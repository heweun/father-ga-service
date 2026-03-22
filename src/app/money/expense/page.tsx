
'use client';

import { useState } from 'react';
import MobileLayout from '@/components/MobileLayout';
import BigButton from '@/components/BigButton';
import BigInput from '@/components/BigInput';
import { Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/errors';
import { EXPENSE_CATEGORIES } from '@/lib/constants/money';

export default function ExpensePage() {
    const [amount, setAmount] = useState('');
    const [category, setCategory] = useState('');
    const [description, setDescription] = useState('');
    const [memo, setMemo] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    const handleSubmit = async () => {
        if (!amount || !category) return;
        setIsSaving(true);

        try {
            const supabase = createClient();
            const { error } = await supabase.from('transactions').insert({
                type: 'expense',
                amount: parseInt(amount.replace(/,/g, '')),
                category,
                description: description || category,
                memo: memo || null
            });

            if (error) throw error;

            alert(`저장되었습니다!\n${amount}원 - ${category}`);
            window.location.href = '/money';
        } catch (e: unknown) {
            alert(`저장 실패: ${getErrorMessage(e)}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <MobileLayout title="지출 입력 (돈 씀)" showBack backUrl="/money">

            {/* Loading Overlay */}
            {isAnalyzing && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center">
                    <div className="bg-white p-8 rounded-3xl animate-bounce">
                        <p className="text-2xl font-bold text-center">🧾<br />영수증 읽는 중...</p>
                    </div>
                </div>
            )}

            {/* Step 1: Receipt Photo */}
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-2xl p-6 text-center space-y-4 hover:bg-gray-50 transition-colors cursor-pointer relative">
                <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;

                        setIsAnalyzing(true);

                        try {
                            const formData = new FormData();
                            formData.append('file', file);

                            const res = await fetch('/api/ocr', { method: 'POST', body: formData });
                            const data = await res.json();

                            if (data.amount) setAmount(data.amount.toString());
                            if (data.storeName) setDescription(data.storeName);
                        } catch (err) {
                            alert("사진을 읽지 못했습니다. 다시 시도하거나 직접 입력해주세요.");
                        } finally {
                            setIsAnalyzing(false);
                            e.target.value = ''; // Reset for next use
                        }
                    }}
                />
                <div className="flex flex-col items-center gap-2 pointer-events-none">
                    <Camera className="text-blue-500" size={48} />
                    <p className="text-xl font-bold text-gray-700">영수증 사진 찍기 📸</p>
                    <p className="text-sm text-gray-400">여기를 누르면 카메라가 켜집니다</p>
                </div>
            </div>

            {/* Step 2: Amount */}
            <BigInput
                label="얼마를 썼나요?"
                type="text"
                placeholder="예: 50,000"
                value={amount ? parseInt(amount).toLocaleString('ko-KR') : ''}
                onChange={e => {
                    const rawValue = e.target.value.replace(/[^0-9]/g, '');
                    setAmount(rawValue);
                }}
                className="text-right font-black text-3xl"
            />

            {/* Step 3: Category */}
            <div className="space-y-2">
                <label className="text-xl font-bold block">무엇을 했나요?</label>
                <div className="grid grid-cols-2 gap-2">
                    {EXPENSE_CATEGORIES.map(c => (
                        <button
                            key={c}
                            onClick={() => setCategory(c)}
                            className={`h-16 text-lg font-bold rounded-lg border-2 transition-colors ${category === c
                                ? 'bg-black text-yellow-400 border-black'
                                : 'bg-white text-gray-600 border-gray-300'
                                }`}
                        >
                            {c}
                        </button>
                    ))}
                </div>
            </div>

            {/* Step 4: Memo (Optional) */}
            <div className="space-y-2">
                <label className="text-xl font-bold block">메모 (선택사항)</label>
                <textarea
                    className="w-full h-24 px-4 py-3 rounded-xl border-2 border-slate-300 bg-white text-lg placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100 outline-none transition-all resize-none"
                    placeholder="예: 김철수 회원님 생일 케이크"
                    value={memo}
                    onChange={e => setMemo(e.target.value)}
                />
            </div>

            {/* Debug Info Area */}
            {description && (
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-sm space-y-1">
                    <p className="font-bold text-blue-600">🤖 영수증 분석 결과</p>
                    <p>상호명: {description}</p>
                    <p>금액: {parseInt(amount || '0').toLocaleString()}원</p>
                    <p className="text-gray-400 text-xs mt-2 border-t pt-1">
                        (분석이 틀렸다면 아래에서 직접 수정해주세요)
                    </p>
                </div>
            )}

            <div className="pt-8">
                <BigButton onClick={handleSubmit} disabled={!amount || !category || isSaving}>
                    {isSaving ? '저장 중...' : '저장하기 💾'}
                </BigButton>
            </div>

        </MobileLayout>
    );
}
