/**
 * GET /api/sms/macrodroid/next-receiver?id=UUID&secret=SECRET
 *
 * Returns the NEXT unsent receiver phone number as plain text.
 * MacroDroid calls this in a loop (동작 반복) until "DONE" is received.
 *
 * How it works:
 *   - Uses success_count as an index into the receivers array.
 *   - Each call returns receivers[success_count] and increments success_count.
 *   - When success_count >= receivers.length, returns "DONE".
 *
 * Response:
 *   "01012345678"  — next phone number to send to (plain text)
 *   "DONE"         — all receivers have been returned
 *   "ERROR"        — record not found or wrong status
 */

import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    const expectedSecret = process.env.MACRODROID_WEBHOOK_SECRET;

    if (expectedSecret && secret !== expectedSecret) {
        return new Response('Unauthorized', { status: 401 });
    }

    const id = searchParams.get('id');
    if (!id || id === 'NONE') {
        // 'NONE' means the pending poll returned no job — treat as done
        return new Response('DONE', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    const supabase = await createClient();

    // Get current state
    const { data, error } = await supabase
        .from('sms_requests')
        .select('receivers, success_count, status')
        .eq('id', id)
        .maybeSingle();

    if (error || !data) {
        console.error('[NextReceiver] Not found:', id, error);
        return new Response('ERROR', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    if (data.status !== 'processing') {
        console.warn('[NextReceiver] Not in processing state:', id, data.status);
        return new Response('DONE', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    const receivers: string[] = Array.isArray(data.receivers) ? data.receivers : [];
    const idx = data.success_count ?? 0;

    if (idx >= receivers.length) {
        console.log(`[NextReceiver] All done for ${id} (${receivers.length} receivers)`);
        return new Response('DONE', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    const phone = receivers[idx];

    // Increment index for next call — must succeed before returning the number.
    // If this fails, return ERROR so MacroDroid can abort rather than sending
    // a duplicate on the next call (same idx would be returned again).
    const { error: updateError } = await supabase
        .from('sms_requests')
        .update({ success_count: idx + 1, updated_at: new Date().toISOString() })
        .eq('id', id);

    if (updateError) {
        console.error(`[NextReceiver] Failed to increment success_count for ${id}:`, updateError);
        return new Response('ERROR', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    console.log(`[NextReceiver] ${id} → ${phone} (${idx + 1}/${receivers.length})`);
    return new Response(phone, { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
