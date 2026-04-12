/**
 * SMS Delivery Results Endpoint — GET /api/sms/results/[id]
 *
 * Returns the per-number delivery results for a given sms_requests UUID.
 * Intended for developer observability and debugging, not for father-facing UI.
 *
 * ── Purpose ─────────────────────────────────────────────────────────────────
 * While the Supabase dashboard lets a developer query tables directly, this
 * endpoint provides a structured, programmable alternative for:
 *   - Verifying delivery results after a dispatch
 *   - Integrating with monitoring scripts or alerting
 *   - Auditing which specific numbers failed and why
 *
 * ── Request ──────────────────────────────────────────────────────────────────
 *   GET /api/sms/results/<request_uuid>
 *
 *   Optional query parameters:
 *     ?status=failed    — filter to only failed numbers
 *     ?status=sent      — filter to only successfully sent numbers
 *
 * ── Response 200 ─────────────────────────────────────────────────────────────
 *   {
 *     "request_id": "550e8400-e29b-41d4-a716-446655440000",
 *     "batch_status": "sent_via_macrodroid",
 *     "dispatch_method": "macrodroid",
 *     "total": 187,
 *     "sent_count": 185,
 *     "failed_count": 2,
 *     "pending_count": 0,
 *     "results": [
 *       {
 *         "phone": "01012345678",
 *         "name": "홍길동",
 *         "status": "sent",
 *         "sent_at": "2026-03-22T12:00:00Z",
 *         "error_message": null
 *       },
 *       {
 *         "phone": "01099999999",
 *         "name": "김철수",
 *         "status": "failed",
 *         "sent_at": null,
 *         "error_message": "Invalid number format"
 *       }
 *     ]
 *   }
 *
 * ── Response 200 (no per-number rows) ────────────────────────────────────────
 *   When no sms_delivery_results rows exist for this request (e.g. MacroDroid
 *   sent a simple aggregate-only completion report), returns:
 *   {
 *     "request_id": "...",
 *     "batch_status": "sent_via_macrodroid",
 *     "dispatch_method": "macrodroid",
 *     "total": 187,
 *     "sent_count": null,
 *     "failed_count": null,
 *     "pending_count": null,
 *     "results": [],
 *     "note": "No per-number rows found. MacroDroid reported aggregate success_count only."
 *   }
 *
 * ── Response 404 ─────────────────────────────────────────────────────────────
 *   { "error": "SMS request not found" }
 *
 * ── Response 400 ─────────────────────────────────────────────────────────────
 *   { "error": "Missing request ID" }
 *
 * ── Response 405 ─────────────────────────────────────────────────────────────
 *   Method not allowed (only GET is supported)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SmsDeliveryResultRow, SmsRequestRow } from '@/lib/types/sms';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(
    request: Request,
    { params }: RouteParams
): Promise<NextResponse> {
    const { id: requestId } = await params;

    if (!requestId) {
        return NextResponse.json({ error: 'Missing request ID' }, { status: 400 });
    }

    // Optional status filter (e.g. ?status=failed)
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status'); // 'sent' | 'failed' | 'pending' | null

    const supabase = await createClient();

    // ── 1. Fetch the batch record ────────────────────────────────────────────
    const { data: batchRow, error: batchError } = await supabase
        .from('sms_requests')
        .select(
            'id, status, dispatch_method, total_count, success_count, error_message, fallback_note, created_at, sent_at, completed_at'
        )
        .eq('id', requestId)
        .maybeSingle();

    if (batchError) {
        console.error('[SMS Results] Supabase fetch error:', batchError);
        return NextResponse.json(
            { error: 'Database error', detail: batchError.message },
            { status: 500 }
        );
    }

    if (!batchRow) {
        return NextResponse.json({ error: 'SMS request not found' }, { status: 404 });
    }

    const batch = batchRow as Pick<
        SmsRequestRow,
        | 'id'
        | 'status'
        | 'dispatch_method'
        | 'total_count'
        | 'success_count'
        | 'error_message'
        | 'fallback_note'
        | 'created_at'
        | 'sent_at'
        | 'completed_at'
    >;

    // ── 2. Fetch per-number delivery results ─────────────────────────────────
    let deliveryQuery = supabase
        .from('sms_delivery_results')
        .select('id, phone, name, status, sent_at, error_message, created_at')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true });

    if (statusFilter && ['sent', 'failed', 'pending'].includes(statusFilter)) {
        deliveryQuery = deliveryQuery.eq('status', statusFilter);
    }

    const { data: deliveryRows, error: deliveryError } = await deliveryQuery;

    if (deliveryError) {
        console.error('[SMS Results] Supabase delivery_results fetch error:', deliveryError);
        return NextResponse.json(
            { error: 'Database error fetching delivery results', detail: deliveryError.message },
            { status: 500 }
        );
    }

    const results = (deliveryRows ?? []) as SmsDeliveryResultRow[];

    // ── 3. Compute per-status counters ───────────────────────────────────────
    const sentCount = results.filter((r) => r.status === 'sent').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;
    const pendingCount = results.filter((r) => r.status === 'pending').length;

    const hasPerNumberRows = results.length > 0;

    // ── 4. Build response ────────────────────────────────────────────────────
    const responseBody: Record<string, unknown> = {
        request_id: batch.id,
        batch_status: batch.status,
        dispatch_method: batch.dispatch_method ?? null,
        total: batch.total_count ?? null,
        success_count: batch.success_count ?? null,  // aggregate from sms_requests
        sent_count: hasPerNumberRows ? sentCount : null,
        failed_count: hasPerNumberRows ? failedCount : null,
        pending_count: hasPerNumberRows ? pendingCount : null,
        error_message: batch.error_message ?? null,
        fallback_note: batch.fallback_note ?? null,
        created_at: batch.created_at,
        sent_at: batch.sent_at ?? null,
        completed_at: batch.completed_at ?? null,
        results: results.map((r) => ({
            phone: r.phone,
            name: r.name ?? null,
            status: r.status,
            sent_at: r.sent_at ?? null,
            error_message: r.error_message ?? null,
        })),
    };

    if (!hasPerNumberRows) {
        responseBody.note = statusFilter
            ? `No per-number rows found with status="${statusFilter}".`
            : 'No per-number rows found. Dispatcher may have reported aggregate success_count only.';
    }

    return NextResponse.json(responseBody);
}
