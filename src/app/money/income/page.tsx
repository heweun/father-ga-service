
'use client';

import { useState } from 'react';
import MobileLayout from '@/components/MobileLayout';
import BigButton from '@/components/BigButton';
import BigInput from '@/components/BigInput';
import { createClient } from '@/lib/supabase/client';

export default function IncomePage() {
    const [amount, setAmount] = useState('');
    const [source, setSource] = useState('');
    const [memo, setMemo] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async () => {
        if (!amount || !source) return;
        setIsSaving(true);

        try {
            const supabase = createClient();
            const { error } = await supabase.from('transactions').insert({
                type: 'income',
                amount: parseInt(amount.replace(/,/g, '')),
                category: '수입',
                description: source,
                memo: memo || null
            });

            if (error) throw error;

            alert(`저장되었습니다!\n${parseInt(amount).toLocaleString('ko-KR')}원 - ${source}`);
            window.location.href = '/money';
        } catch (e: any) {
            alert(`저장 실패: ${e.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <MobileLayout title="수입 입력 (돈 받음)" showBack backUrl="/money">

            {/* Step 1: Amount */}
            <BigInput
                label="얼마를 받았나요?"
                type="text"
                placeholder="예: 30,000"
                value={amount ? parseInt(amount).toLocaleString('ko-KR') : ''}
                onChange={e => {
                    const rawValue = e.target.value.replace(/[^0-9]/g, '');
                    setAmount(rawValue);
                }}
                className="text-right font-black text-3xl"
            />

            {/* Step 2: Source */}
            <BigInput
                label="누구에게/어디서?"
                type="text"
                placeholder="예: 동창회 회비"
                value={source}
                onChange={e => setSource(e.target.value)}
            />

            {/* Step 3: Memo (Optional) */}
            <div className="space-y-2">
                <label className="text-xl font-bold block">메모 (선택사항)</label>
                <textarea
                    className="w-full h-24 px-4 py-3 rounded-xl border-2 border-slate-300 bg-white text-lg placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100 outline-none transition-all resize-none"
                    placeholder="예: 12월 회비 일괄 수금"
                    value={memo}
                    onChange={e => setMemo(e.target.value)}
                />
            </div>

            <div className="pt-8">
                <BigButton
                    onClick={handleSubmit}
                    disabled={!amount || !source || isSaving}
                    className="bg-blue-600 border-blue-600 text-white"
                >
                    {isSaving ? '저장 중...' : '저장하기 💾'}
                </BigButton>
            </div>

        </MobileLayout>
    );
}
