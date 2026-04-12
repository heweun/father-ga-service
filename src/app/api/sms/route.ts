/**
 * SMS Primary Route — Supabase Queue Insert
 *
 * Dispatch flow:
 *   1. PRIMARY: Writes pending record to Supabase sms_requests queue
 *      → MacroDroid (Galaxy phone) polls and sends for free
 *   2. FALLBACK: If MacroDroid has not processed within 5 minutes,
 *      → /api/sms/fallback is called by the PWA client to send via Solapi/CoolSMS (paid)
 *
 * Solapi/CoolSMS fallback code lives in: /api/sms/fallback/route.ts
 * Retained as fallback to ensure reliability when Galaxy phone is unavailable.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getErrorMessage } from '@/lib/errors';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { receivers, message } = body;

        if (!receivers || !Array.isArray(receivers) || receivers.length === 0 || !message) {
            return NextResponse.json({ error: 'Missing requirements' }, { status: 400 });
        }

        const supabase = await createClient();

        // Insert pending SMS request into queue
        // MacroDroid polls this table and processes pending records for free
        const { data, error } = await supabase
            .from('sms_requests')
            .insert({
                receivers,
                message,
                status: 'pending',
                total_count: receivers.length,
            })
            .select('id')
            .single();

        if (error || !data) {
            console.error('[SMS Queue] Supabase insert error:', error);
            return NextResponse.json(
                { success: false, error: error?.message || 'Failed to queue SMS request' },
                { status: 500 }
            );
        }

        console.log(`[SMS Queue] Queued request ${data.id} for ${receivers.length} receivers`);

        return NextResponse.json({
            success: true,
            request_id: data.id,
            count: receivers.length,
        });

    } catch (e: unknown) {
        console.error('[SMS Queue] Internal error:', e);
        return NextResponse.json(
            { error: getErrorMessage(e) || 'Internal Server Error' },
            { status: 500 }
        );
    }
}
