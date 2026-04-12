/**
 * useSmsStatus — React hook for polling sms_requests status
 *
 * Polls Supabase every SMS_POLL_INTERVAL_MS (10 seconds) and exposes the
 * latest status value for a given request UUID.
 *
 * Usage:
 *   const { status, errorMessage, lastPolledAt, isPolling } = useSmsStatus(requestId);
 *
 * Pass null as requestId to suspend polling (e.g., before a request is queued).
 * Polling stops automatically when the hook unmounts.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSmsStatus } from '@/lib/sms/queries';
import type { SmsRequestStatus } from '@/lib/types/sms';

/** How often the hook polls Supabase for status updates (ms) */
export const SMS_POLL_INTERVAL_MS = 10 * 1000; // 10 seconds

// ── State shape ───────────────────────────────────────────────────────────────

export interface SmsStatusState {
    /** Latest status from Supabase, or null if not yet fetched */
    status: SmsRequestStatus | null;
    /** error_message column from the row, or null */
    errorMessage: string | null;
    /** Timestamp of the most recent successful poll, or null */
    lastPolledAt: Date | null;
    /** True while an active polling interval is running */
    isPolling: boolean;
    /** Number of poll attempts since polling started */
    pollCount: number;
}

const INITIAL_STATE: SmsStatusState = {
    status: null,
    errorMessage: null,
    lastPolledAt: null,
    isPolling: false,
    pollCount: 0,
};

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Polls Supabase every SMS_POLL_INTERVAL_MS for the current status of an
 * sms_requests row and exposes the latest value reactively.
 *
 * @param requestId - UUID of the sms_requests row to watch, or null to pause
 * @returns SmsStatusState — reactive snapshot updated after every poll
 *
 * @example
 * const { status, errorMessage, isPolling } = useSmsStatus(requestId);
 *
 * useEffect(() => {
 *   if (status === 'sent_via_macrodroid') {
 *     // dispatch confirmed via Galaxy phone
 *   }
 * }, [status]);
 */
export function useSmsStatus(requestId: string | null): SmsStatusState {
    const [state, setState] = useState<SmsStatusState>(INITIAL_STATE);

    // Keep a ref so the async poll closure always sees the latest requestId
    // without needing to be recreated on every render.
    const requestIdRef = useRef<string | null>(requestId);
    useEffect(() => {
        requestIdRef.current = requestId;
    });

    // Stable poll function — safe to call from setInterval
    const executePoll = useCallback(async (supabase: ReturnType<typeof createClient>) => {
        const id = requestIdRef.current;
        if (!id) return;

        const result = await getSmsStatus(supabase, id);

        setState(prev => {
            // Ignore stale result if the requestId has changed mid-poll
            if (requestIdRef.current !== id) return prev;

            return {
                ...prev,
                status: result ? result.status : prev.status,
                errorMessage: result ? result.error_message : prev.errorMessage,
                lastPolledAt: new Date(),
                pollCount: prev.pollCount + 1,
            };
        });
    }, []); // empty deps — stable reference

    useEffect(() => {
        if (!requestId) {
            // Reset to initial state when polling is suspended
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setState(INITIAL_STATE);
            return;
        }

        const supabase = createClient();
        let cancelled = false;

        setState(prev => ({ ...prev, isPolling: true, pollCount: 0 }));

        // Immediate first poll so UI doesn't wait a full interval
        const pollIfActive = async () => {
            if (cancelled) return;
            await executePoll(supabase);
        };

        pollIfActive();

        const intervalId = setInterval(pollIfActive, SMS_POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(intervalId);
            setState(prev => ({ ...prev, isPolling: false }));
        };
    }, [requestId, executePoll]);

    return state;
}
