/**
 * MacroDroid Status Check Endpoint — GET /api/sms/macrodroid/status
 *
 * MacroDroid calls this endpoint RIGHT BEFORE starting the SMS dispatch loop
 * to verify that the claimed record is still in 'processing' state.
 *
 * ── Why this endpoint exists ────────────────────────────────────────────────
 * After MacroDroid polls /api/sms/macrodroid/pending and receives { found: true },
 * there is a brief window before the SMS loop starts. Another MacroDroid instance
 * or manual intervention could have changed the status in that window.
 *
 * This endpoint is the explicit guard: if the record is no longer in 'processing'
 * state, MacroDroid receives { ok_to_send: false } and MUST skip the SMS loop.
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
 *   "true"  (plain text)
 *
 * Record is in any other status (skip sending):
 *   "false"  (plain text)
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
 * MacroDroid variable: sms_ok_to_send = {status_response:$.ok_to_send}
 * Inner If Block condition: sms_ok_to_send Equals "true"
 *   → THEN: proceed with SMS dispatch loop
 *   → ELSE: skip sending
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    const isSafeToSend = currentStatus === 'processing';

    if (isSafeToSend) {
        console.log(`[MacroDroid Status] ${id} is 'processing' — ok to send`);
        return new Response('true', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // Record is no longer in 'processing' — skip dispatch
    console.log(`[MacroDroid Status] Skipping dispatch for ${id}: status='${currentStatus}'`);
    return new Response('false', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
