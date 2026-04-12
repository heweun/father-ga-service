/**
 * SMS Request Query Functions — Supabase
 *
 * Provides typed helpers for reading sms_requests rows from Supabase.
 * Used by:
 *   - sms/page.tsx poll loop (browser client) to check dispatch progress
 *   - API routes (server client) to inspect job state before fallback
 *
 * All functions are client-agnostic: pass any Supabase client instance
 * (browser or server) and receive a typed result.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { SmsRequestRow, SmsRequestStatus } from '@/lib/types/sms';

// ── Result types ──────────────────────────────────────────────────────────────

/** Successful status fetch result */
export interface SmsStatusOk {
    ok: true;
    /** The full sms_requests row */
    row: SmsRequestRow;
    /** Convenience alias for row.status */
    status: SmsRequestStatus;
}

/** Failed status fetch result (row not found or DB error) */
export interface SmsStatusError {
    ok: false;
    /** Human-readable error message for logging */
    error: string;
}

export type SmsStatusResult = SmsStatusOk | SmsStatusError;

// ── Terminal status helpers ───────────────────────────────────────────────────

/** Statuses that indicate successful delivery through any path */
export const SMS_SUCCESS_STATUSES: SmsRequestStatus[] = [
    'sent_via_macrodroid',
    'sent_via_solapi',
];

/** All terminal statuses (success + failure) — polling should stop here */
export const SMS_TERMINAL_STATUSES: SmsRequestStatus[] = [
    ...SMS_SUCCESS_STATUSES,
    'failed',
];

/**
 * Returns true if the given status represents a successful terminal state
 * (dispatch confirmed through any path).
 */
export function isSmsSuccess(status: SmsRequestStatus): boolean {
    return (SMS_SUCCESS_STATUSES as string[]).includes(status);
}

/**
 * Returns true if the given status represents a terminal state
 * (no further state transitions expected).
 */
export function isSmsTerminal(status: SmsRequestStatus): boolean {
    return (SMS_TERMINAL_STATUSES as string[]).includes(status);
}

// ── Query functions ───────────────────────────────────────────────────────────

/**
 * Fetches the current SMS dispatch status for a given sms_requests record.
 *
 * @param supabase - Any Supabase client instance (browser or server)
 * @param requestId - UUID of the sms_requests row to query
 * @returns SmsStatusResult with the full row on success, or an error message
 *
 * @example
 * // Browser (PWA poll loop)
 * const supabase = createClient();
 * const result = await getSmsRequestStatus(supabase, request_id);
 * if (result.ok && result.status === 'sent_via_macrodroid') {
 *   // dispatch confirmed
 * }
 *
 * @example
 * // Server (API route)
 * const supabase = await createServerClient();
 * const result = await getSmsRequestStatus(supabase, request_id);
 * if (!result.ok) {
 *   console.error('[Fallback] Status check failed:', result.error);
 * }
 */
export async function getSmsRequestStatus(
    supabase: SupabaseClient,
    requestId: string,
): Promise<SmsStatusResult> {
    const { data, error } = await supabase
        .from('sms_requests')
        .select(
            'id, message, receivers, status, created_at, updated_at, sent_at, fallback_note, ' +
            'dispatch_method, total_count, success_count, delivery_results, error_message, ' +
            'dispatched_at, completed_at',
        )
        .eq('id', requestId)
        .single();

    if (error) {
        return {
            ok: false,
            error: error.code === 'PGRST116'
                ? `SMS request not found: ${requestId}`
                : `Supabase query error: ${error.message}`,
        };
    }

    if (!data) {
        return {
            ok: false,
            error: `SMS request not found: ${requestId}`,
        };
    }

    const row = data as unknown as SmsRequestRow;

    return {
        ok: true,
        row,
        status: row.status,
    };
}

/**
 * Fetches only the status field (lightweight poll — no payload columns).
 * Use this in tight polling loops where the full row is not needed.
 *
 * @param supabase - Any Supabase client instance (browser or server)
 * @param requestId - UUID of the sms_requests row to query
 * @returns The status string, or null on error
 */
export async function getSmsStatus(
    supabase: SupabaseClient,
    requestId: string,
): Promise<{ status: SmsRequestStatus; error_message: string | null } | null> {
    const { data, error } = await supabase
        .from('sms_requests')
        .select('status, error_message')
        .eq('id', requestId)
        .single();

    if (error || !data) {
        return null;
    }

    return {
        status: data.status as SmsRequestStatus,
        error_message: data.error_message ?? null,
    };
}
