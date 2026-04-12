/**
 * GET /api/sms/macrodroid/message?id=UUID&secret=SECRET
 * Returns the SMS message text as plain text for MacroDroid.
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
        .select('message')
        .eq('id', id)
        .maybeSingle();

    if (error || !data) {
        console.error('[MacroDroid Message] Not found:', id, error);
        return new Response('', { status: 404 });
    }

    console.log(`[MacroDroid Message] Returning message for ${id}`);
    return new Response(data.message ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
}
