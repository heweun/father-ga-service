import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getErrorMessage } from '@/lib/errors';

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

        const supabase = createServiceClient();
        const { data, error } = await supabase
            .from('contacts')
            .insert({ name: name.trim(), phone: phone.trim(), group_name: '곤25' })
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
