/**
 * MacroDroid Poll Endpoint — GET /api/sms/macrodroid/pending
 *
 * MacroDroid (Galaxy phone) calls this endpoint periodically to check if
 * there is a pending SMS request waiting to be dispatched.
 *
 * Authentication: ?secret=<MACRODROID_WEBHOOK_SECRET> query parameter
 *   (query param chosen over header for MacroDroid free-tier HTTP action compatibility)
 *
 * Response 200 — pending request found AND claimed:
 *   { "found": true, "id": "<uuid>", "message": "...", "receivers": ["010...", ...], "count": 187 }
 *
 * Response 200 — no pending request:
 *   { "found": false }
 *
 * Response 401 — missing or wrong secret
 * Response 405 — method not allowed
 *
 * ── Atomic Claim ──────────────────────────────────────────────────────────────
 * When a pending record is found, this endpoint immediately updates its status
 * to 'processing' (with optimistic lock: eq('status', 'pending')).
 *
 * This prevents duplicate dispatch if MacroDroid polls again before completing:
 *   - First poll: status 'pending' → returned + status set to 'processing'
 *   - Second poll: no 'pending' rows found → { found: false }
 *
 * If the UPDATE race is lost (another caller claimed it first), the endpoint
 * returns { found: false } rather than returning a record without owning it.
 *
 * ── MacroDroid flow after receiving { found: true } ───────────────────────────
 *   1. Store id, message, receivers locally in MacroDroid variables
 *   2. Send SMS to each receiver via Galaxy phone's sendSMS action
 *   3. Call PATCH /api/sms/macrodroid/complete with result (separate AC)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    // ── Auth: validate secret ──────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const expectedSecret = process.env.MACRODROID_WEBHOOK_SECRET;

    if (!expectedSecret) {
        // Dev/test: secret not configured — allow access but log warning
        console.warn('[MacroDroid Poll] MACRODROID_WEBHOOK_SECRET is not set — running without auth');
    } else if (secret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await createClient();

    // ── Find the oldest pending sms_request ───────────────────────────────
    const { data, error } = await supabase
        .from('sms_requests')
        .select('id, message, receivers, total_count')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) {
        console.error('[MacroDroid Poll] Supabase query error:', error);
        return NextResponse.json(
            { error: 'Database error', detail: error.message },
            { status: 500 }
        );
    }

    // ── No pending request ─────────────────────────────────────────────────
    if (!data) {
        return NextResponse.json({ found: false });
    }

    // ── Atomic claim: set status to 'processing' with optimistic lock ──────
    // Only update if status is still 'pending' to avoid claiming a row that
    // was just claimed by a concurrent poll (race condition guard).
    const { data: claimedRows, error: claimError } = await supabase
        .from('sms_requests')
        .update({
            status: 'processing',
            dispatched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq('id', data.id)
        .eq('status', 'pending')   // optimistic lock — only succeeds if still pending
        .select('id');

    if (claimError) {
        console.error('[MacroDroid Poll] Claim error:', claimError);
        return NextResponse.json(
            { error: 'Failed to claim record', detail: claimError.message },
            { status: 500 }
        );
    }

    // Race lost: another process already claimed the row → no work for us
    if (!claimedRows || claimedRows.length === 0) {
        console.log(`[MacroDroid Poll] Race lost on ${data.id} — returning no-work`);
        return NextResponse.json({ found: false });
    }

    // ── Claimed successfully — return payload for MacroDroid ───────────────
    const receivers: string[] = Array.isArray(data.receivers) ? data.receivers : [];

    console.log(`[MacroDroid Poll] Claimed request ${data.id} (${receivers.length} receivers)`);

    return NextResponse.json({
        found: true,
        id: data.id,
        message: data.message,
        receivers,
        count: receivers.length,
    });
}
