import { createClient } from '@supabase/supabase-js';

/**
 * Supabase service_role 클라이언트
 *
 * RLS를 bypass하므로 서버 API 라우트에서만 사용할 것.
 * 브라우저 코드에서 절대 import 금지.
 */
export function createServiceClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다');
    }

    return createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
