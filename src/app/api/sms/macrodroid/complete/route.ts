/**
 * MacroDroid Completion Endpoint — PATCH /api/sms/macrodroid/complete
 *
 * MacroDroid calls this endpoint AFTER it has attempted SMS dispatch to all
 * receivers via the Galaxy phone's Android SmsManager. This updates the
 * Supabase sms_requests row so the PWA polling loop can show the result
 * (success or failure) to the father.
 *
 * Authentication: ?secret=<MACRODROID_WEBHOOK_SECRET> query parameter
 *
 * ── Success request body ───────────────────────────────────────────────────────
 *   {
 *     "id": "<uuid>",                    // sms_requests row UUID
 *     "status": "sent_via_macrodroid",   // final status (success path)
 *     "success_count": 187,              // how many SMS were accepted by SmsManager
 *     "delivery_results": [              // optional per-number results (AC 5a)
 *       { "phone": "010XXXXXXXX", "status": "sent", "sent_at": "2026-03-22T12:00:00Z" },
 *       { "phone": "010YYYYYYYY", "status": "failed", "error_message": "Invalid number" }
 *     ]
 *   }
 *
 * ── Failure request body ───────────────────────────────────────────────────────
 *   {
 *     "id": "<uuid>",                    // sms_requests row UUID
 *     "status": "failed",               // final status (failure path)
 *     "success_count": 0,               // how many were sent before failure
 *     "error_message": "SMS permission denied"  // human-readable failure reason
 *   }
 *
 * ── Success response 200 ───────────────────────────────────────────────────────
 *   { "ok": true, "id": "<uuid>", "status": "sent_via_macrodroid" }
 *
 * ── Failure response 200 ───────────────────────────────────────────────────────
 *   { "ok": true, "id": "<uuid>", "status": "failed" }
 *
 * Response 400 — missing required fields
 * Response 401 — missing or wrong secret
 * Response 404 — record not found or not in processing state
 * Response 405 — method not allowed
 * Response 500 — database error
 *
 * ── Idempotency ────────────────────────────────────────────────────────────────
 * The UPDATE only applies when status is 'processing' (the claimed state).
 * If the row is already 'sent_via_macrodroid' (duplicate report), the UPDATE
 * finds no rows and returns 200 with already_done: true — safe no-op.
 *
 * ── PWA completion detection ───────────────────────────────────────────────────
 * The PWA polls sms_requests and resolves success on ['sent_via_macrodroid'].
 * Writing 'sent_via_macrodroid' here triggers that.
 * Writing 'failed' triggers the failure screen.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(request: Request) {
    // ── Auth: validate secret ──────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const expectedSecret = process.env.MACRODROID_WEBHOOK_SECRET;

    if (!expectedSecret) {
        // Dev/test: secret not configured — allow access but log warning
        console.warn('[MacroDroid Complete] MACRODROID_WEBHOOK_SECRET is not set — running without auth');
    } else if (secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Parse request body ────────────────────────────────────────────────
    let body: {
        id?: string;
        success_count?: number | string;
        /**
         * 'sent_via_macrodroid' — all (or most) SMS dispatched successfully.
         * 'failed'              — MacroDroid could not dispatch (permission error,
         *                         SIM unavailable, Android crash, etc.).
         * Any other value is treated as 'sent_via_macrodroid' for forward-compat.
         */
        status?: string;
        /** Human-readable failure description (required when status = 'failed') */
        error_message?: string;
        /** Per-number delivery results (AC 5a). If provided, inserted into sms_delivery_results table. */
        delivery_results?: Array<{
            phone: string;
            name?: string;
            status: 'pending' | 'sent' | 'failed';
            sent_at?: string;
            error_message?: string;
        }>;
    };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { id, success_count, status, error_message: bodyErrorMessage, delivery_results } = body;

    if (!id) {
        return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
    }

    // Normalise status: accept 'sent_via_macrodroid' (success) or 'failed' (failure).
    // Any unrecognised value defaults to 'sent_via_macrodroid' for forward-compatibility.
    const finalStatus: 'sent_via_macrodroid' | 'failed' =
        status === 'failed' ? 'failed' : 'sent_via_macrodroid';

    // Normalise success_count: MacroDroid may send it as a string variable.
    // Returns null if not provided or unparseable — callers must guard against null
    // to avoid overwriting an existing DB value with null.
    const successCountNum: number | null = (() => {
        if (typeof success_count === 'number' && isFinite(success_count)) return success_count;
        if (typeof success_count === 'string' && success_count !== '') {
            const parsed = parseInt(success_count, 10);
            return isFinite(parsed) ? parsed : null;
        }
        return null;
    })();

    const supabase = await createClient();

    // ── Update row: only if still in 'processing' state ───────────────────
    // Idempotency guard: prevents duplicate /complete calls from overwriting
    // an already-completed record.
    const now = new Date().toISOString();

    // Build the update payload based on success vs. failure path.
    // Success: populate sent_at (actual dispatch time) + success_count.
    // Failure: populate error_message so the developer can audit why it failed.
    const updatePayload =
        finalStatus === 'sent_via_macrodroid'
            ? {
                  status: finalStatus,
                  dispatch_method: 'macrodroid' as const,
                  // Only write success_count if MacroDroid reported it.
                  // If null, preserve the existing DB value (which tracks the next-receiver index).
                  ...(successCountNum !== null && { success_count: successCountNum }),
                  sent_at: now,
                  completed_at: now,
                  updated_at: now,
              }
            : {
                  status: finalStatus,
                  dispatch_method: 'macrodroid' as const,
                  success_count: successCountNum ?? 0,
                  error_message: bodyErrorMessage ?? 'MacroDroid dispatch failed',
                  completed_at: now,
                  updated_at: now,
              };

    const { data: updatedRows, error: updateError } = await supabase
        .from('sms_requests')
        .update(updatePayload)
        .eq('id', id)
        .eq('status', 'processing')  // only claim rows we own
        .select('id, status');

    if (updateError) {
        console.error('[MacroDroid Complete] Supabase update error:', updateError);
        return NextResponse.json(
            { error: 'Database error', detail: updateError.message },
            { status: 500 }
        );
    }

    // ── No rows updated: already completed or not found ───────────────────
    if (!updatedRows || updatedRows.length === 0) {
        // Check if it already completed (idempotent re-delivery from MacroDroid)
        const { data: existingRow } = await supabase
            .from('sms_requests')
            .select('id, status')
            .eq('id', id)
            .maybeSingle();

        if (!existingRow) {
            return NextResponse.json({ error: 'Record not found' }, { status: 404 });
        }

        // Already marked done — safe no-op (MacroDroid may retry on network error)
        console.log(`[MacroDroid Complete] Idempotent: ${id} already has status '${existingRow.status}'`);
        return NextResponse.json({
            ok: true,
            id,
            status: existingRow.status,
            already_done: true,
        });
    }

    if (finalStatus === 'sent_via_macrodroid') {
        console.log(`[MacroDroid Complete] Request ${id} marked ${finalStatus} (${successCountNum ?? '?'} sent)`);
    } else {
        console.warn(`[MacroDroid Complete] Request ${id} marked ${finalStatus} — error: ${bodyErrorMessage ?? '(no message)'}`);
    }

    // ── AC 5a: Insert per-number delivery results if provided ─────────────
    // MacroDroid may optionally include a delivery_results array in the body.
    // Each entry is inserted as a row in sms_delivery_results for Supabase
    // dashboard auditability (SELECT * FROM sms_delivery_results WHERE request_id = '...').
    //
    // If MacroDroid does not send delivery_results (simple completion report),
    // only the aggregate success_count on sms_requests is populated — still valid.
    if (delivery_results && delivery_results.length > 0) {
        const rows = delivery_results.map((r) => ({
            request_id: id,
            phone: r.phone,
            name: r.name ?? null,
            status: r.status,
            sent_at: r.sent_at ?? null,
            error_message: r.error_message ?? null,
        }));

        const { error: insertError } = await supabase
            .from('sms_delivery_results')
            .insert(rows);

        if (insertError) {
            // Non-fatal: log the error but do not fail the response.
            // The aggregate status on sms_requests is already written — the PWA
            // will show success. Per-number rows are audit data only.
            console.error('[MacroDroid Complete] Failed to insert delivery results:', insertError);
        } else {
            console.log(`[MacroDroid Complete] Inserted ${rows.length} delivery result rows for ${id}`);
        }
    }

    return NextResponse.json({
        ok: true,
        id,
        status: finalStatus,
    });
}
