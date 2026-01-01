
import { NextResponse } from 'next/server';
import crypto from 'crypto';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { receivers, message } = body;

        if (!receivers || !message) {
            return NextResponse.json({ error: 'Missing requirements' }, { status: 400 });
        }

        const {
            COOLSMS_API_KEY: API_KEY,
            COOLSMS_API_SECRET: API_SECRET,
            SENDER_PHONE
        } = process.env;

        if (!API_KEY || !API_SECRET) {
            console.warn("CoolSMS Keys missing.");
            return NextResponse.json({ success: true, mock: true, count: receivers.length });
        }

        // Solapi uses HMAC-SHA256 Auth
        const date = new Date().toISOString();
        const salt = crypto.randomBytes(16).toString('hex');
        const signature = crypto.createHmac('sha256', API_SECRET)
            .update(date + salt)
            .digest('hex');

        // Construct Message Group
        // For Solapi, we can send messages in bulk or single. 'send-many' supports arrays.
        // If text > 45 chars (korean), it should be LMS. Solapi auto-converts if type is not strictly enforced?
        // Safer to just specify 'LMS' if lengthy.
        const isLong = message.length > 40;

        const messages = receivers.map((phone: string) => ({
            to: phone,
            from: SENDER_PHONE || '01000000000',
            text: message,
            type: isLong ? 'LMS' : 'SMS'
        }));

        // Send Request
        const response = await fetch('https://api.coolsms.co.kr/messages/v4/send-many', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `HMAC-SHA256 apiKey=${API_KEY}, date=${date}, salt=${salt}, signature=${signature}`
            },
            body: JSON.stringify({ messages })
        });

        const result = await response.json();

        // Check Solapi Error Structure
        // Success looks like: { groupInfo: {...} } or { logId: ... }
        // Error looks like: { errorCode: "...", errorMessage: "..." }
        if (!response.ok || result.errorCode) {
            console.error("CoolSMS Error Response:", result);
            return NextResponse.json({
                success: false,
                error: result.errorMessage || `CoolSMS Error: ${result.errorCode}`
            }, { status: 500 });
        }

        return NextResponse.json({ success: true, result });

    } catch (e: any) {
        console.error("Internal SMS Error:", e);
        return NextResponse.json({ error: e.message || 'Internal Server Error' }, { status: 500 });
    }
}
