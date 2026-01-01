
'use client';

import { useState } from 'react';
import MobileLayout from '@/components/MobileLayout';
import BigButton from '@/components/BigButton';
import BigInput from '@/components/BigInput';
import { extractContacts, ExtractedContact } from '@/lib/contactUtils';
import { User, Copy, Trash2, Send } from 'lucide-react';

export default function SmsPage() {
    const [step, setStep] = useState<'input' | 'confirm'>('input');
    const [message, setMessage] = useState('');
    const [contacts, setContacts] = useState<ExtractedContact[]>([]);
    const [rawText, setRawText] = useState('');

    // 1. Contact Picker (Android)
    const handleContactPicker = async () => {
        try {
            if ('contacts' in navigator && 'ContactsManager' in window) {
                // @ts-expect-error - Contact Picker API is experimental
                const pickedContacts = await navigator.contacts.select(['name', 'tel'], { multiple: true });

                const formatted: ExtractedContact[] = pickedContacts.map((c: any) => ({
                    name: c.name?.[0] || '이름없음',
                    phone: c.tel?.[0]?.replace(/[^0-9]/g, '') || '',
                    originalText: '연락처에서 가져옴'
                })).filter((c: ExtractedContact) => c.phone.startsWith('01')); // Simple validation

                setContacts(prev => [...prev, ...formatted]);
            } else {
                alert("이 기능은 안드로이드 폰에서만 지원됩니다.\n아이폰은 '명단 붙여넣기'를 이용해주세요.");
            }
        } catch (e) {
            console.error(e);
            // Ignore user cancellation
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
        setRawText(''); // Clear input
        alert(`${extracted.length}명의 연락처를 추가했습니다!`);
    };

    // 3. Send Logic (Real API)
    const [isSending, setIsSending] = useState(false);
    const handleSend = async () => {
        // Validation (Double check)
        if (contacts.length === 0) return alert("받는 사람이 없습니다.");


        setIsSending(true);
        try {
            const receivers = contacts.map(c => c.phone);
            const response = await fetch('/api/sms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ receivers, message })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || '알 수 없는 오류가 발생했습니다.');
            }

            // Success
            alert(`✅ 발송 성공!\n(총 ${result.result?.count || contacts.length}건 접수됨)`);
            window.location.href = '/';

        } catch (e: any) {
            console.error("SMS Send Error:", e);
            alert(`❌ 발송 실패\n${e.message}\n(잠시 후 다시 시도해보세요)`);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <MobileLayout title="문자 보내기" showBack>

            {step === 'input' && (
                <div className="space-y-6">
                    {/* Step 1: Input Message */}
                    <section className="space-y-2">
                        <h2 className="text-xl font-bold">1. 내용 쓰기</h2>
                        <textarea
                            className="w-full text-xl p-4 border-2 border-black rounded-xl h-40 focus:ring-4 focus:ring-yellow-400"
                            placeholder="여기에 보낼 내용을 적거나 붙여넣으세요"
                            value={message}
                            onChange={e => setMessage(e.target.value)}
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

                        {/* Paste Area (Hidden until needed? No, always visible for simplicity) */}
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

                        {/* Contact List Preview */}
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
                        <BigButton onClick={handleSend} disabled={isSending}>
                            {isSending ? '보내는 중...' : '보내기 (전송)'}
                        </BigButton>
                    </div>
                </div>
            )}

        </MobileLayout>
    );
}
