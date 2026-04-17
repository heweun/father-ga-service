import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getErrorMessage } from '@/lib/errors';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { name, phone } = body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return NextResponse.json({ success: false, error: '이름을 입력해주세요.' }, { status: 400 });
        }
        if (!phone || typeof phone !== 'string' || !phone.startsWith('01')) {
            return NextResponse.json({ success: false, error: '올바른 전화번호를 입력해주세요.' }, { status: 400 });
        }

        const supabase = createServiceClient();
        const { error } = await supabase
            .from('contacts')
            .update({ name: name.trim(), phone: phone.trim() })
            .eq('id', id);

        if (error) {
            console.error('[contacts] update error:', error);
            return NextResponse.json({ success: false, error: '저장에 실패했습니다. 다시 시도해주세요.' }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (e: unknown) {
        console.error('[contacts] PUT error:', e);
        return NextResponse.json({ success: false, error: getErrorMessage(e) }, { status: 500 });
    }
}

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const supabase = createServiceClient();
        const { error } = await supabase
            .from('contacts')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[contacts] delete error:', error);
            return NextResponse.json({ success: false, error: '삭제에 실패했습니다. 다시 시도해주세요.' }, { status: 500 });
        }

        return NextResponse.json({ success: true });

    } catch (e: unknown) {
        console.error('[contacts] DELETE error:', e);
        return NextResponse.json({ success: false, error: getErrorMessage(e) }, { status: 500 });
    }
}
