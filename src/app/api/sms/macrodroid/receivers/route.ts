/**
 * GET /api/sms/macrodroid/receivers?id=UUID&secret=SECRET
 * Returns the receivers as a JSON array for MacroDroid For Each action.
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
    if (!id) {
        return new Response('Missing id', { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase
        .from('sms_requests')
        .select('receivers')
        .eq('id', id)
        .maybeSingle();

    if (error || !data) {
        console.error('[MacroDroid Receivers] Not found:', id, error);
        return new Response('[]', { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    const receivers: string[] = Array.isArray(data.receivers) ? data.receivers : [];
    console.log(`[MacroDroid Receivers] Returning ${receivers.length} receivers for ${id}`);
    return new Response(JSON.stringify(receivers), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
