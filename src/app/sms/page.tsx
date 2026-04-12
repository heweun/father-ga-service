
'use client';

import { useState, useEffect, useRef } from 'react';
import MobileLayout from '@/components/MobileLayout';
import BigButton from '@/components/BigButton';
import SmsSendButton from '@/components/SmsSendButton';
import { extractContacts, ExtractedContact } from '@/lib/contactUtils';
import { User, Copy, Trash2 } from 'lucide-react';
import { getErrorMessage } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';
import { useSmsStatus } from '@/lib/sms/useSmsStatus';
import { isSmsSuccess, isSmsTerminal } from '@/lib/sms/queries';

/**
 * Sub-AC 10a — 5-minute timeout monitoring constants:
 *
 * The PWA starts a precise `setTimeout` immediately after queuing a Supabase
 * sms_requests record. If the status has not transitioned to a terminal success
 * state within FALLBACK_TIMEOUT_MS, the Solapi fallback API is triggered.
 * A second hard-fail timer fires at FALLBACK_TIMEOUT_MS + HARD_TIMEOUT_EXTRA_MS
 * if even the fallback path has not resolved by then.
 *
 * These timers are independent of the 10-second Supabase poll cycle so they
 * fire at the exact millisecond boundary rather than "next poll after 5 min".
 */
const FALLBACK_TIMEOUT_MS = 5 * 60 * 1000;   // 5 minutes — trigger Solapi fallback
const HARD_TIMEOUT_EXTRA_MS = 2 * 60 * 1000; // +2 minutes — hard fail (total: 7 min)

type Step = 'input' | 'confirm' | 'processing' | 'done';

interface SendResult {
    success: boolean;
    detail: string;
}

export default function SmsPage() {
    const [step, setStep] = useState<Step>('input');
    const PREFIX = '[곤지암중 25기 동창회 소식]\n';
    const [message, setMessage] = useState(PREFIX);
    const [contacts, setContacts] = useState<ExtractedContact[]>([]);
    const [rawText, setRawText] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [sendResult, setSendResult] = useState<SendResult | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);

    // UUID of the queued sms_requests row; null while not yet dispatched
    const [activeRequestId, setActiveRequestId] = useState<string | null>(null);

    // 10-second polling hook — active only when activeRequestId is set
    const smsStatus = useSmsStatus(activeRequestId);

    // ── Sub-AC 10a: 5-minute timeout monitoring ───────────────────────────────
    // Mirror activeRequestId and isSending into refs so the setTimeout callbacks
    // always read the latest values without stale-closure issues (the callbacks
    // are created once and cannot be recreated on every render).
    const activeRequestIdRef = useRef<string | null>(null);
    activeRequestIdRef.current = activeRequestId;
    const isSendingRef = useRef(false);
    isSendingRef.current = isSending;

    // Guard: ensures Solapi fallback is triggered at most once per dispatch
    const fallbackTriggeredRef = useRef(false);

    // Handles for the two wall-clock timeout timers.
    // Cleared when the status-watcher detects a terminal state so they never
    // fire after the dispatch has already resolved.
    const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Track elapsed time while processing so father can see progress
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (step === 'processing') {
            setElapsedSeconds(0);
            timerRef.current = setInterval(() => {
                setElapsedSeconds(s => s + 1);
            }, 1000);
        } else {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [step]);

    /**
     * Sub-AC 10a: 5-minute timeout monitoring effect
     *
     * Starts two wall-clock timers the moment a request is queued in Supabase:
     *
     *   • fallbackTimer  (FALLBACK_TIMEOUT_MS = 5 min):
     *       Triggers the Solapi fallback API exactly 5 minutes after `activeRequestId`
     *       is set, regardless of the 10-second poll cycle. Uses `activeRequestIdRef`
     *       to read the latest request ID without stale-closure issues.
     *
     *   • hardTimer (FALLBACK_TIMEOUT_MS + HARD_TIMEOUT_EXTRA_MS = 7 min):
     *       If even the Solapi fallback hasn't resolved within an additional 2 minutes,
     *       the UI transitions to the failure screen with a simple timeout message.
     *
     * Both timers are cancelled (clearTimeout) as soon as the status-watcher effect
     * below detects a terminal state, so they never fire after a successful dispatch.
     * The cleanup function also cancels them on component unmount.
     */
    useEffect(() => {
        // Clear any timers left over from a previous dispatch attempt
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
        fallbackTimerRef.current = null;
        hardTimerRef.current = null;

        if (!activeRequestId) return; // No active dispatch — nothing to time out

        console.log(`[SMS Timeout] Started 5-min fallback timer for request ${activeRequestId}`);

        // ── Timer 1: 5-minute MacroDroid timeout → trigger Solapi fallback ────
        fallbackTimerRef.current = setTimeout(() => {
            const reqId = activeRequestIdRef.current;
            if (!reqId || !isSendingRef.current || fallbackTriggeredRef.current) {
                // Dispatch already resolved (terminal state reached) — do nothing
                return;
            }

            fallbackTriggeredRef.current = true;
            console.warn(
                `[SMS Timeout] MacroDroid did not complete within ${FALLBACK_TIMEOUT_MS / 1000}s`,
                `— triggering Solapi fallback for request ${reqId}`,
            );

            fetch('/api/sms/fallback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: reqId }),
            })
                .then(r => r.json())
                .then(result => {
                    if (!result.success) {
                        console.error('[SMS Fallback] Solapi fallback returned failure:', result.error);
                    } else {
                        console.log('[SMS Fallback] Solapi fallback accepted:', result);
                    }
                    // The status-watcher effect below will detect the terminal state
                    // (sent_via_solapi | failed) on the next poll tick and resolve the UI.
                })
                .catch(e => {
                    console.error('[SMS Fallback] Network error calling /api/sms/fallback:', getErrorMessage(e));
                });
        }, FALLBACK_TIMEOUT_MS);

        // ── Timer 2: 7-minute hard fail → force UI to failure screen ──────────
        hardTimerRef.current = setTimeout(() => {
            const reqId = activeRequestIdRef.current;
            if (!reqId || !isSendingRef.current) {
                // Dispatch already resolved — do nothing
                return;
            }

            console.error(
                `[SMS Timeout] Hard timeout at ${(FALLBACK_TIMEOUT_MS + HARD_TIMEOUT_EXTRA_MS) / 1000}s`,
                `— request ${reqId} never reached a terminal state`,
            );
            setSendResult({ success: false, detail: '시간 초과 — 잠시 후 다시 시도해주세요.' });
            setIsSending(false);
            setStep('done');
            setActiveRequestId(null);
        }, FALLBACK_TIMEOUT_MS + HARD_TIMEOUT_EXTRA_MS);

        return () => {
            if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
            if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
        };
    }, [activeRequestId]); // Re-run only when a new request is queued or cleared

    /**
     * Status-watcher effect — reacts to every poll result emitted by
     * useSmsStatus (every 10 seconds) and drives the dispatch lifecycle:
     *
     *  • Terminal success (sent_via_macrodroid | sent_via_solapi) → success screen
     *  • Terminal failure (failed) → error screen
     *
     * Time-based fallback and hard-timeout are handled exclusively by the
     * Sub-AC 10a timeout effect above (setTimeout-based, not poll-dependent).
     * When a terminal state is detected here, the timeout timers are cancelled
     * so they cannot fire after the dispatch has already resolved.
     */
    useEffect(() => {
        if (!activeRequestId || !isSending) return;

        const { status, errorMessage } = smsStatus;

        if (!status || !isSmsTerminal(status)) return; // Not yet resolved — wait for next poll

        // ── Cancel wall-clock timers — dispatch resolved before any timeout ───
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        if (hardTimerRef.current) clearTimeout(hardTimerRef.current);
        fallbackTimerRef.current = null;
        hardTimerRef.current = null;

        // ── Show result to father ─────────────────────────────────────────────
        if (isSmsSuccess(status)) {
            setSendResult({ success: true, detail: `총 ${contacts.length}명에게 발송 완료` });
        } else {
            // Log technical detail for developer observability via Supabase dashboard
            if (errorMessage) {
                console.error('[SMS] Dispatch failed. DB error_message:', errorMessage);
            }
            // Father-facing message: simple Korean only, no technical language
            setSendResult({
                success: false,
                detail: '문자 발송에 실패했습니다.\n잠시 후 다시 시도해주세요.',
            });
        }
        setIsSending(false);
        setStep('done');
        setActiveRequestId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [smsStatus.status, smsStatus.lastPolledAt, activeRequestId, isSending]);

    useEffect(() => {
        const loadDefaultContacts = async () => {
            const supabase = createClient();
            const { data, error } = await supabase
                .from('contacts')
                .select('name, phone')
                .eq('group_name', '곤25');
            if (error) { console.error('[contacts] error:', error); return; }
            if (data && data.length > 0) {
                setContacts(data.map(c => ({ name: c.name, phone: c.phone, originalText: '' })));
            }
        };
        loadDefaultContacts();
    }, []);

    // 1. Contact Picker (Android)
    const handleContactPicker = async () => {
        try {
            if ('contacts' in navigator && 'ContactsManager' in window) {
                // @ts-expect-error - Contact Picker API is experimental
                const pickedContacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });

                const formatted: ExtractedContact[] = pickedContacts.map((c: { name?: string[]; tel?: string[] }) => ({
                    name: c.name?.[0] || '이름없음',
                    phone: c.tel?.[0]?.replace(/[^0-9]/g, '') || '',
                    originalText: '연락처에서 가져옴'
                })).filter((c: ExtractedContact) => c.phone.startsWith('01'));

                setContacts(prev => [...prev, ...formatted]);
            } else {
                alert("이 기능은 안드로이드 폰에서만 지원됩니다.\n아이폰은 '명단 붙여넣기'를 이용해주세요.");
            }
        } catch (e) {
            console.error(e);
        }
    };

    // 2. Smart Paste Logic
    const handlePasteProcess = () => {
        if (!rawText) return;
        const extracted = extractContacts(rawText);
        if (extracted.length === 0) {
            alert("전화번호를 찾을 수 없습니다.\n'이름 010-0000-0000' 형식인지 확인해주세요.");
            return;
        }
        setContacts(prev => [...prev, ...extracted]);
        setRawText('');
        alert(`${extracted.length}명의 연락처를 추가했습니다!`);
    };

    // 3. Send Logic
    const handleSend = async () => {
        if (contacts.length === 0) return alert("받는 사람이 없습니다.");

        setIsSending(true);
        setStep('processing');

        // Reset fallback guard for this dispatch attempt.
        // The 5-minute timeout timer starts automatically when setActiveRequestId()
        // is called below (driven by the Sub-AC 10a timeout useEffect).
        fallbackTriggeredRef.current = false;

        try {
            // Queue SMS request in Supabase (MacroDroid will pick it up)
            const receivers = contacts.map(c => c.phone);
            const response = await fetch('/api/sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receivers, message }),
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || '발송 요청 실패');
            }

            const request_id: string = result.request_id;
            console.log(`[SMS] Queued request ${request_id} for ${contacts.length} receivers`);

            // Activate the useSmsStatus hook — it will poll every 10 seconds.
            // The status-watcher useEffect above will handle completion + fallback.
            setActiveRequestId(request_id);

        } catch (e: unknown) {
            // Log technical detail for developer; show simple message to father
            console.error('[SMS] Send error:', getErrorMessage(e));
            setSendResult({
                success: false,
                detail: '문자 발송에 실패했습니다.\n잠시 후 다시 시도해주세요.',
            });
            setIsSending(false);
            setStep('done');
        }
    };

    const formatElapsed = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return m > 0 ? `${m}분 ${s}초` : `${s}초`;
    };

    // ── Processing screen display state (driven by useSmsStatus hook) ─────────
    // These are derived from the reactive DB status so the UI updates on every
    // poll tick, not just based on elapsed wall-clock time.
    const dbStatus = smsStatus.status;
    const processingIsActive = dbStatus === 'processing';
    const processingIsSwitching = dbStatus === 'fallback_in_progress';

    /**
     * Spinner border color reflects current dispatch phase:
     *   yellow  → waiting / pending (default)
     *   green   → MacroDroid has picked up and is sending
     *   orange  → Solapi fallback path is running
     */
    const spinnerColorClass = processingIsSwitching
        ? 'border-orange-400'
        : processingIsActive
        ? 'border-green-400'
        : 'border-yellow-400';

    /**
     * Banner shown below the spinner — null means no banner (early stage).
     * Transitions reactively on every poll cycle as DB status changes.
     */
    const processingStatusBanner: { bg: string; text: string; msg: string } | null =
        processingIsSwitching
            ? { bg: 'bg-orange-50', text: 'text-orange-700', msg: '🔄 자동으로 다른 방법으로 전환 중...' }
            : processingIsActive
            ? { bg: 'bg-green-50', text: 'text-green-700', msg: '📱 갤럭시 폰에서 발송 중입니다' }
            : elapsedSeconds >= 30
            ? { bg: 'bg-gray-100', text: 'text-gray-500', msg: '⏳ 갤럭시 폰으로 연결 중입니다...' }
            : null;

    return (
        <MobileLayout title="문자 보내기" showBack>

            {/* ── STEP: Input ── */}
            {step === 'input' && (
                <div className="space-y-6">
                    {/* Step 1: Input Message */}
                    <section className="space-y-2">
                        <h2 className="text-xl font-bold">1. 내용 쓰기</h2>
                        <textarea
                            className="w-full text-xl p-4 border-2 border-black rounded-xl h-40 focus:ring-4 focus:ring-yellow-400"
                            placeholder="여기에 보낼 내용을 적거나 붙여넣으세요"
                            value={message}
                            onChange={e => {
                                if (!e.target.value.startsWith(PREFIX)) return;
                                setMessage(e.target.value);
                            }}
                        />
                    </section>

                    {/* Step 2: Add Contacts */}
                    <section className="space-y-4 pt-4 border-t-2 border-gray-200">
                        <h2 className="text-xl font-bold">2. 받는 사람 ({contacts.length}명)</h2>

                        <div className="grid grid-cols-2 gap-3">
                            <BigButton
                                variant="secondary"
                                onClick={handleContactPicker}
                                className="text-base h-20 bg-blue-50 border-blue-200"
                            >
                                <User className="mb-1" />
                                폰 연락처<br />가져오기
                            </BigButton>

                            <BigButton
                                variant="secondary"
                                onClick={() => document.getElementById('paste-area')?.focus()}
                                className="text-base h-20 bg-green-50 border-green-200"
                            >
                                <Copy className="mb-1" />
                                카톡 명단<br />붙여넣기
                            </BigButton>
                        </div>

                        <div className="bg-gray-100 p-4 rounded-xl space-y-2">
                            <p className="font-bold">👇 명단 붙여넣는 곳</p>
                            <textarea
                                id="paste-area"
                                className="w-full h-24 p-2 border border-gray-400 rounded text-lg"
                                placeholder="예: 홍길동 010-1234-5678 (여러 명 가능)"
                                value={rawText}
                                onChange={e => setRawText(e.target.value)}
                            />
                            <BigButton onClick={handlePasteProcess} className="h-12 text-lg">
                                명단 추가하기
                            </BigButton>
                        </div>

                        {contacts.length > 0 && (
                            <ul className="max-h-40 overflow-y-auto border border-black rounded bg-white p-2 space-y-1">
                                {contacts.map((c, i) => (
                                    <li key={i} className="flex justify-between items-center p-2 hover:bg-gray-100 border-b last:border-0 text-lg">
                                        <span>{c.name}</span>
                                        <span className="text-gray-600">{c.phone}</span>
                                        <button
                                            onClick={() => setContacts(prev => prev.filter((_, idx) => idx !== i))}
                                            className="text-red-500 p-2"
                                        >
                                            <Trash2 />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <div className="pt-4">
                        <BigButton
                            onClick={() => {
                                if (!message) return alert("문자 내용을 입력해주세요");
                                if (contacts.length === 0) return alert("받는 사람을 추가해주세요");
                                setStep('confirm');
                            }}
                        >
                            다음 단계로
                        </BigButton>
                    </div>
                </div>
            )}

            {/* ── STEP: Confirm ── */}
            {step === 'confirm' && (
                <div className="space-y-6 text-center">
                    <div className="bg-yellow-100 p-6 rounded-2xl border-4 border-yellow-400">
                        <h2 className="text-3xl font-black mb-4">총 {contacts.length}명</h2>
                        <p className="text-xl">에게 문자를 보냅니다.</p>
                    </div>

                    <div className="text-left bg-gray-50 p-4 rounded-xl border border-gray-300 max-h-60 overflow-y-auto">
                        <h3 className="font-bold mb-2 text-gray-500">보낼 내용:</h3>
                        <p className="text-xl whitespace-pre-wrap">{message}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-8">
                        <BigButton variant="secondary" onClick={() => setStep('input')}>
                            수정하기
                        </BigButton>
                        <SmsSendButton
                            onClick={handleSend}
                            isLoading={isSending}
                        />
                    </div>
                </div>
            )}

            {/* ── STEP: Processing ── */}
            {step === 'processing' && (
                <div className="flex flex-col items-center justify-center space-y-8 py-12 text-center">
                    {/* Spinner — border color tracks actual dispatch phase from DB */}
                    <div className={`w-24 h-24 border-8 border-t-transparent rounded-full animate-spin ${spinnerColorClass}`} />

                    <div className="space-y-3">
                        <h2 className="text-3xl font-black">문자 보내는 중...</h2>
                        <p className="text-xl text-gray-600">
                            총 {contacts.length}명에게 발송 중입니다
                        </p>
                        <p className="text-lg text-gray-400">
                            {formatElapsed(elapsedSeconds)} 경과
                        </p>

                        {/* Status banner — reactively updated on every 10-second poll.
                            Pulsing dot shows the hook is actively polling Supabase. */}
                        {processingStatusBanner && (
                            <div className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-base ${processingStatusBanner.bg} ${processingStatusBanner.text}`}>
                                {smsStatus.isPolling && (
                                    <span
                                        className="w-2 h-2 rounded-full bg-current animate-pulse flex-shrink-0"
                                        aria-hidden="true"
                                    />
                                )}
                                <span>{processingStatusBanner.msg}</span>
                            </div>
                        )}
                    </div>

                    <p className="text-sm text-gray-400">화면을 닫지 마세요</p>
                </div>
            )}

            {/* ── STEP: Done ── */}
            {step === 'done' && sendResult && (
                <div className="flex flex-col items-center justify-center space-y-8 py-12 text-center">
                    {sendResult.success ? (
                        <>
                            <div className="text-8xl">✅</div>
                            <div className="space-y-2">
                                <h2 className="text-4xl font-black text-green-700">발송 완료!</h2>
                                <p className="text-2xl">{sendResult.detail}</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-8xl">❌</div>
                            <div className="space-y-2">
                                <h2 className="text-4xl font-black text-red-700">발송 실패</h2>
                                <p className="text-xl text-red-600 whitespace-pre-line">{sendResult.detail}</p>
                            </div>
                        </>
                    )}

                    <BigButton
                        onClick={() => {
                            if (sendResult.success) {
                                window.location.href = '/';
                            } else {
                                setStep('confirm');
                                setSendResult(null);
                            }
                        }}
                        variant={sendResult.success ? 'primary' : 'secondary'}
                        className="w-full text-2xl py-6"
                    >
                        {sendResult.success ? '홈으로' : '다시 시도'}
                    </BigButton>
                </div>
            )}

        </MobileLayout>
    );
}
