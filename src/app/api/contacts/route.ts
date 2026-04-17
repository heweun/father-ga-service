import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getErrorMessage } from '@/lib/errors';

/** 010-1234-5678 형식으로 통일 */
function formatPhone(digits: string): string {
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return digits;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, phone } = body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return NextResponse.json({ success: false, error: '이름을 입력해주세요.' }, { status: 400 });
        }
        if (!phone || typeof phone !== 'string' || !phone.startsWith('01')) {
            return NextResponse.json({ success: false, error: '올바른 전화번호를 입력해주세요.' }, { status: 400 });
        }

        const digits = phone.replace(/[^0-9]/g, '');
        const supabase = createServiceClient();
        const { data, error } = await supabase
            .from('contacts')
            .insert({ name: name.trim(), phone: formatPhone(digits), group_name: '곤25' })
            .select('id')
            .single();

        if (error || !data) {
            console.error('[contacts] insert error:', error);
            return NextResponse.json({ success: false, error: '저장에 실패했습니다. 다시 시도해주세요.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, id: data.id });

    } catch (e: unknown) {
        console.error('[contacts] POST error:', e);
        return NextResponse.json({ success: false, error: getErrorMessage(e) }, { status: 500 });
    }
}
