/**
 * MacroDroid Status Check Endpoint — GET /api/sms/macrodroid/status
 *
 * MacroDroid calls this endpoint RIGHT BEFORE starting the SMS dispatch loop
 * to verify that the claimed record is still in 'processing' state.
 *
 * ── Why this endpoint exists ────────────────────────────────────────────────
 * After MacroDroid polls /api/sms/macrodroid/pending and receives { found: true },
 * there is a brief window before the SMS loop starts. In this window, the Solapi
 * fallback might fire (if the 5-minute timer is very close to expiry) and change
 * the record status to 'fallback_in_progress' or 'sent_via_solapi'.
 *
 * Without this check, MacroDroid would send SMS to all 187 recipients even though
 * Solapi has already sent them — resulting in 374 duplicate messages.
 *
 * This endpoint is the explicit "skip non-pending" guard: if the record is no
 * longer in 'processing' state, MacroDroid receives { ok_to_send: false } and
 * MUST skip the SMS dispatch loop entirely.
 *
 * ── Authentication ───────────────────────────────────────────────────────────
 * ?secret=<MACRODROID_WEBHOOK_SECRET> query parameter
 *
 * ── Query parameters ─────────────────────────────────────────────────────────
 * ?id=<uuid>        — UUID of the sms_requests row to check
 * ?secret=<secret>  — Shared secret for authentication
 *
 * ── Response shapes ──────────────────────────────────────────────────────────
 *
 * Record is 'processing' (MacroDroid owns it — safe to send):
 *   { "ok_to_send": true, "id": "<uuid>", "status": "processing" }
 *
 * Record is in any other status (skip sending — already done or claimed elsewhere):
 *   { "ok_to_send": false, "id": "<uuid>", "status": "<current_status>", "reason": "..." }
 *
 * Record not found:
 *   { "ok_to_send": false, "id": "<uuid>", "status": null, "reason": "not_found" }
 *
 * Auth failure:
 *   HTTP 401 { "error": "Unauthorized" }
 *
 * Missing id param:
 *   HTTP 400 { "error": "Missing required parameter: id" }
 *
 * ── MacroDroid integration ───────────────────────────────────────────────────
 * This endpoint is called as Action 4 (BEFORE the For Each loop) inside the
 * If Block from the polling macro. See docs/macrodroid-setup.md for full flow.
 *
 * MacroDroid variable: sms_ok_to_send = {status_response:$.ok_to_send}
 * Inner If Block condition: sms_ok_to_send Equals "true"
 *   → THEN: proceed with SMS dispatch loop
 *   → ELSE: skip sending (already handled by Solapi or another process)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/** Statuses in which it is safe for MacroDroid to send SMS */
const SAFE_TO_SEND_STATUSES = ['processing'] as const;

export async function GET(request: Request) {
    // ── Auth: validate secret ──────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const expectedSecret = process.env.MACRODROID_WEBHOOK_SECRET;

    if (!expectedSecret) {
        console.warn('[MacroDroid Status] MACRODROID_WEBHOOK_SECRET is not set — running without auth');
    } else if (secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Validate required id parameter ────────────────────────────────────
    const id = searchParams.get('id');
    if (!id) {
        return NextResponse.json(
            { error: 'Missing required parameter: id' },
            { status: 400 }
        );
    }

    // ── Query the record status ────────────────────────────────────────────
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('sms_requests')
        .select('id, status')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        console.error('[MacroDroid Status] Supabase query error:', error);
        return NextResponse.json(
            { error: 'Database error', detail: error.message },
            { status: 500 }
        );
    }

    // ── Record not found ───────────────────────────────────────────────────
    if (!data) {
        console.warn(`[MacroDroid Status] Record not found: ${id}`);
        return NextResponse.json({
            ok_to_send: false,
            id,
            status: null,
            reason: 'not_found',
        });
    }

    const currentStatus = data.status as string;
    const isSafeToSend = (SAFE_TO_SEND_STATUSES as readonly string[]).includes(currentStatus);

    if (isSafeToSend) {
        // Record is still in 'processing' state — MacroDroid owns it and should proceed
        console.log(`[MacroDroid Status] ${id} is '${currentStatus}' — ok to send`);
        return NextResponse.json({
            ok_to_send: true,
            id,
            status: currentStatus,
        });
    }

    // ── Record is no longer in 'processing' — skip dispatch to prevent duplicates ──
    //
    // This happens when:
    //   - The Solapi fallback fired before MacroDroid started sending
    //     (status: 'fallback_in_progress' | 'sent_via_solapi')
    //   - The record was already completed by a previous MacroDroid run
    //     (status: 'sent_via_macrodroid' | 'sent')
    //   - The record failed for another reason (status: 'failed')
    //   - Status was manually reset (status: 'pending') — extremely rare
    //
    // In ALL of these cases, MacroDroid MUST NOT send any SMS.
    // Sending would result in duplicate messages (187 extra SMS at carrier cost).
    const reason = buildSkipReason(currentStatus);
    console.log(
        `[MacroDroid Status] Skipping dispatch for ${id}: status='${currentStatus}' (${reason})`
    );

    return NextResponse.json({
        ok_to_send: false,
        id,
        status: currentStatus,
        reason,
    });
}

/** Returns a human-readable reason for skipping dispatch */
function buildSkipReason(status: string): string {
    switch (status) {
        case 'fallback_in_progress':
            return 'solapi_fallback_started';
        case 'sent_via_solapi':
            return 'already_sent_via_solapi';
        case 'sent_via_macrodroid':
            return 'already_sent_via_macrodroid';
        case 'sent':
            return 'already_sent_legacy';
        case 'failed':
            return 'previously_failed';
        case 'pending':
            // Extremely rare: record was reset back to pending after being claimed.
            // Treat as skip (the next poll will re-claim it).
            return 'status_reset_to_pending';
        default:
            return `unexpected_status_${status}`;
    }
}
