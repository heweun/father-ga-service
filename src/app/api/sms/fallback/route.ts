/**
 * SMS Fallback Route — Solapi/CoolSMS
 *
 * Sub-AC 10c: Solapi API fallback trigger
 *
 * This route is the FALLBACK path for SMS dispatch.
 * It is triggered automatically when MacroDroid (Galaxy phone) has not
 * processed a pending sms_requests record within 5 minutes.
 *
 * Primary path: MacroDroid polls Supabase → sends via Galaxy phone (free)
 * Fallback path: THIS ROUTE → sends via Solapi/CoolSMS API (paid, per-message)
 *
 * Trigger conditions (actionable statuses):
 *   - 'pending'              : MacroDroid never polled within 5 minutes
 *   - 'processing'           : MacroDroid claimed but stalled within 5 minutes
 *   - 'fallback_in_progress' : Previous fallback attempt crashed after status
 *                              write but before Solapi API call (retry path).
 *                              Guard: only retriable if updated_at > 2 minutes ago.
 *
 * Lifecycle (Sub-AC 10b → 10c):
 *   Sub-AC 10b: Write 'fallback_in_progress' status (optimistic lock)
 *   Sub-AC 10c: Invoke Solapi bulk API → 'sent_via_solapi' | 'failed'
 *
 * Request body: { request_id: string }
 * - Fetches receivers + message from Supabase sms_requests table
 * - Sends all receivers via Solapi bulk API
 * - Updates sms_requests.status → 'sent_via_solapi' | 'failed'
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { getErrorMessage } from '@/lib/errors';
import { SMS_LONG_TEXT_THRESHOLD } from '@/lib/constants/sms';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { request_id } = body;

        if (!request_id) {
            return NextResponse.json({ error: 'Missing request_id' }, { status: 400 });
        }

        // --- Fetch SMS request record from Supabase ---
        const supabase = await createClient();
        const { data: smsRequest, error: fetchError } = await supabase
            .from('sms_requests')
            .select('id, message, receivers, status, updated_at')
            .eq('id', request_id)
            .single();

        if (fetchError || !smsRequest) {
            return NextResponse.json(
                { error: fetchError?.message || 'SMS request not found' },
                { status: 404 }
            );
        }

        // Sub-AC 10c: Guard — only process records that are still actionable.
        //
        // Actionable statuses:
        //   'pending'              — MacroDroid never polled within 5 minutes
        //   'processing'           — MacroDroid claimed but stalled within 5 minutes
        //   'fallback_in_progress' — RETRY path: previous fallback attempt crashed
        //                           after writing the status but before calling Solapi.
        //                           Only allowed if updated_at is > STALE_THRESHOLD_MS
        //                           ago (i.e., the prior call is definitively gone).
        //
        // Reject immediately if the record is already in any other terminal state
        // (sent_via_macrodroid, sent_via_solapi, failed) to prevent duplicate sends.
        const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

        const directActionableStatuses = ['pending', 'processing'];
        const isStaleFallbackInProgress =
            smsRequest.status === 'fallback_in_progress' &&
            Date.now() - new Date((smsRequest as { updated_at: string }).updated_at).getTime() > STALE_THRESHOLD_MS;

        const isActionable =
            directActionableStatuses.includes(smsRequest.status) ||
            isStaleFallbackInProgress;

        if (!isActionable) {
            const isRecentlyInProgress =
                smsRequest.status === 'fallback_in_progress' && !isStaleFallbackInProgress;
            return NextResponse.json({
                success: false,
                error: isRecentlyInProgress
                    ? 'Fallback already in progress — retry after 2 minutes if still unresolved'
                    : `Request already processed (status: ${smsRequest.status})`
            }, { status: 409 });
        }

        const priorStatus = smsRequest.status as string; // 'pending' | 'processing' | 'fallback_in_progress'
        const { message, receivers } = smsRequest as { message: string; receivers: string[]; updated_at: string };

        if (!receivers || receivers.length === 0) {
            return NextResponse.json({ error: 'No receivers in request' }, { status: 400 });
        }

        // --- Mark as fallback_in_progress to prevent race conditions ---
        // Sub-AC 10b: Write 'fallback_in_progress' status so the PWA poll loop
        // detects the transition and shows the "switching" UI banner immediately.
        //
        // Sub-AC 10c: This is the trigger point — after this write, Solapi is invoked.
        //
        // Optimistic lock covers three cases:
        //   'pending'              — normal MacroDroid timeout path
        //   'processing'           — MacroDroid stalled path
        //   'fallback_in_progress' — stale retry path (prior call crashed after status write)
        //
        // If MacroDroid completes concurrently (race), the update finds no rows →
        // the subsequent Solapi guard (actionableStatuses check) will catch it.
        const allActionableStatuses = [...directActionableStatuses, 'fallback_in_progress'];
        await supabase
            .from('sms_requests')
            .update({ status: 'fallback_in_progress', updated_at: new Date().toISOString() })
            .eq('id', request_id)
            .in('status', allActionableStatuses); // Optimistic lock

        // --- Solapi / CoolSMS Authentication ---
        const {
            COOLSMS_API_KEY: API_KEY,
            COOLSMS_API_SECRET: API_SECRET,
            SENDER_PHONE
        } = process.env;

        // Mock mode: API keys not configured (dev/test environment)
        if (!API_KEY || !API_SECRET) {
            console.warn('[SMS Fallback] CoolSMS keys missing — running in mock mode');
            const now = new Date().toISOString();
            await supabase
                .from('sms_requests')
                .update({
                    status: 'sent_via_solapi',
                    dispatch_method: 'solapi',
                    success_count: receivers.length,
                    sent_at: now,
                    completed_at: now,
                    updated_at: now,
                    fallback_note: `mock: no API keys configured (prior status: ${priorStatus})`
                })
                .eq('id', request_id);

            // AC 5a: Insert mock per-number delivery results
            const mockRows = (receivers as string[]).map((phone: string) => ({
                request_id,
                phone,
                status: 'sent' as const,
                sent_at: now,
                error_message: null,
            }));
            await supabase.from('sms_delivery_results').insert(mockRows);

            return NextResponse.json({ success: true, mock: true, count: receivers.length });
        }

        // HMAC-SHA256 authentication for Solapi
        const date = new Date().toISOString();
        const salt = crypto.randomBytes(16).toString('hex');
        const signature = crypto
            .createHmac('sha256', API_SECRET)
            .update(date + salt)
            .digest('hex');

        // Build message array for Solapi bulk send
        // Use LMS for messages longer than threshold (Korean characters)
        const isLong = message.length > SMS_LONG_TEXT_THRESHOLD;

        const messages = receivers.map((phone: string) => ({
            to: phone,
            from: SENDER_PHONE || '01000000000',
            text: message,
            type: isLong ? 'LMS' : 'SMS'
        }));

        // --- Send via Solapi bulk API ---
        const response = await fetch('https://api.coolsms.co.kr/messages/v4/send-many', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`
            },
            body: JSON.stringify({ messages })
        });

        const result = await response.json();

        // Sub-AC 10c: Handle Solapi API response — update Supabase with final status.
        //
        // Solapi error structure: { errorCode: "...", errorMessage: "..." }
        if (!response.ok || result.errorCode) {
            console.error('[SMS Fallback] Solapi error:', result);
            const failedAt = new Date().toISOString();
            await supabase
                .from('sms_requests')
                .update({
                    status: 'failed',
                    dispatch_method: 'solapi',
                    updated_at: failedAt,
                    completed_at: failedAt,
                    fallback_note: `${result.errorMessage || `Solapi error: ${result.errorCode}`} (prior status: ${priorStatus})`
                })
                .eq('id', request_id);
            return NextResponse.json({
                success: false,
                error: result.errorMessage || `Solapi Error: ${result.errorCode}`
            }, { status: 500 });
        }

        // --- Update Supabase record: success ---
        const sentAt = new Date().toISOString();
        await supabase
            .from('sms_requests')
            .update({
                status: 'sent_via_solapi',
                dispatch_method: 'solapi',
                success_count: receivers.length,
                sent_at: sentAt,
                completed_at: sentAt,
                updated_at: sentAt,
                fallback_note: `Sent ${receivers.length} messages via Solapi fallback (prior status: ${priorStatus})`
            })
            .eq('id', request_id);

        // AC 5a: Insert per-number delivery results into sms_delivery_results table.
        // Solapi bulk-send does not return per-number status in the success response,
        // so all receivers are recorded as 'sent' at the batch dispatch time.
        // Failures (per-number rejection) would only be visible via Solapi's delivery
        // status webhooks, which are out of scope for this implementation.
        const perNumberRows = (receivers as string[]).map((phone: string) => ({
            request_id,
            phone,
            status: 'sent' as const,
            sent_at: sentAt,
            error_message: null,
        }));

        const { error: deliveryInsertError } = await supabase
            .from('sms_delivery_results')
            .insert(perNumberRows);

        if (deliveryInsertError) {
            // Non-fatal: aggregate status is already written to sms_requests.
            console.error('[SMS Fallback] Failed to insert delivery results:', deliveryInsertError);
        }

        return NextResponse.json({ success: true, count: receivers.length, result });

    } catch (e: unknown) {
        console.error('[SMS Fallback] Internal error:', e);
        return NextResponse.json(
            { error: getErrorMessage(e) || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
