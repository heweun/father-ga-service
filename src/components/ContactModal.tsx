'use client';

import { useState, useEffect } from 'react';
import BigButton from '@/components/BigButton';
import BigInput from '@/components/BigInput';
import { X } from 'lucide-react';

export interface Contact {
    id: string;
    name: string;
    phone: string;
}

interface ContactModalProps {
    /** null이면 추가 모드, Contact이면 수정 모드 */
    contact: Contact | null;
    onClose: () => void;
    onSaved: () => void;
}

/** 번호 정규화: 숫자만 추출 */
function normalizePhone(raw: string): string {
    return raw.replace(/[^0-9]/g, '');
}

export default function ContactModal({ contact, onClose, onSaved }: ContactModalProps) {
    const isEdit = contact !== null;

    const [name, setName] = useState(contact?.name ?? '');
    const [phone, setPhone] = useState(contact?.phone ?? '');
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [error, setError] = useState('');

    // contact prop이 바뀌면 필드 초기화
    useEffect(() => {
        setName(contact?.name ?? '');
        setPhone(contact?.phone ?? '');
        setError('');
    }, [contact]);

    const handleSave = async () => {
        const normalizedPhone = normalizePhone(phone);
        if (!name.trim()) { setError('이름을 입력해주세요.'); return; }
        if (!normalizedPhone.startsWith('01')) { setError('올바른 전화번호를 입력해주세요.'); return; }

        setIsSaving(true);
        setError('');

        try {
            const url = isEdit ? `/api/contacts/${contact!.id}` : '/api/contacts';
            const method = isEdit ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), phone: normalizedPhone }),
            });
            const result = await res.json();

            if (!result.success) {
                setError(result.error || '저장에 실패했습니다. 다시 시도해주세요.');
                return;
            }

            onSaved();
            onClose();
        } catch {
            setError('저장에 실패했습니다. 다시 시도해주세요.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!contact) return;
        if (!window.confirm(`${contact.name}님을 삭제할까요?`)) return;

        setIsDeleting(true);
        setError('');

        try {
            const res = await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
            const result = await res.json();

            if (!result.success) {
                setError(result.error || '삭제에 실패했습니다. 다시 시도해주세요.');
                return;
            }

            onSaved();
            onClose();
        } catch {
            setError('삭제에 실패했습니다. 다시 시도해주세요.');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
            onClick={onClose}
        >
            <div
                className="bg-white w-full max-w-md rounded-t-3xl p-6 space-y-5 pb-10"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">
                        {isEdit ? '회원 수정' : '새 회원 추가'}
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600">
                        <X size={28} />
                    </button>
                </div>

                <BigInput
                    label="이름"
                    placeholder="홍길동"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    autoFocus
                />
                <BigInput
                    label="전화번호"
                    placeholder="010-1234-5678"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    inputMode="tel"
                />

                {error && (
                    <p className="text-red-500 text-lg font-medium">{error}</p>
                )}

                <BigButton onClick={handleSave} disabled={isSaving || isDeleting}>
                    {isSaving ? '저장 중...' : '저장'}
                </BigButton>

                {isEdit && (
                    <BigButton
                        variant="danger"
                        onClick={handleDelete}
                        disabled={isSaving || isDeleting}
                    >
                        {isDeleting ? '삭제 중...' : `${contact!.name} 삭제`}
                    </BigButton>
                )}
            </div>
        </div>
    );
}
