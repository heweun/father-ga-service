'use client';

import { useState, useEffect, useCallback } from 'react';
import MobileLayout from '@/components/MobileLayout';
import BigButton from '@/components/BigButton';
import ContactModal, { Contact } from '@/components/ContactModal';
import { createClient } from '@/lib/supabase/client';
import { UserPlus, Pencil } from 'lucide-react';

/** 01012345678 → 010-1234-5678 */
function formatPhone(phone: string): string {
    const d = phone.replace(/[^0-9]/g, '');
    if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return phone;
}

export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [modalContact, setModalContact] = useState<Contact | null | undefined>(undefined);

    const loadContacts = useCallback(async () => {
        setIsLoading(true);
        setLoadError('');
        const supabase = createClient();
        const { data, error } = await supabase
            .from('contacts')
            .select('id, name, phone')
            .eq('group_name', '곤25')
            .order('name', { ascending: true });

        setIsLoading(false);
        if (error) { setLoadError('목록을 불러오지 못했습니다.'); return; }
        setContacts((data ?? []) as Contact[]);
    }, []);

    useEffect(() => { loadContacts(); }, [loadContacts]);

    return (
        <MobileLayout title="회원 관리" showBack>
            <div className="space-y-4">

                {/* 상단 헤더: 인원 수 + 추가 버튼 */}
                <div className="flex items-center justify-between gap-3">
                    <p className="text-2xl font-bold text-gray-700">
                        총 <span className="text-[var(--primary)]">{contacts.length}</span>명
                    </p>
                    <BigButton
                        onClick={() => setModalContact(null)}
                        className="w-auto h-14 px-5 text-lg shrink-0"
                        fullWidth={false}
                    >
                        <UserPlus size={22} className="mr-2" />
                        새 회원 추가
                    </BigButton>
                </div>

                {/* 안내 문구: 탭하면 수정 가능하다는 힌트 */}
                {!isLoading && !loadError && contacts.length > 0 && (
                    <p className="text-base text-gray-400 text-center">
                        이름을 누르면 수정하거나 삭제할 수 있어요
                    </p>
                )}

                {/* 로딩 */}
                {isLoading && (
                    <p className="text-center text-xl text-gray-400 py-16">불러오는 중...</p>
                )}

                {/* 에러 */}
                {loadError && (
                    <div className="text-center py-8 space-y-4">
                        <p className="text-red-500 text-xl">{loadError}</p>
                        <BigButton variant="outline" onClick={loadContacts}>다시 불러오기</BigButton>
                    </div>
                )}

                {/* 회원 목록 */}
                {!isLoading && !loadError && (
                    <ul className="space-y-2">
                        {contacts.map(c => (
                            <li key={c.id}>
                                <button
                                    className="w-full flex items-center gap-3 px-4 py-5 bg-white border-2 border-slate-200 rounded-2xl active:scale-95 active:bg-slate-50 transition-all"
                                    onClick={() => setModalContact(c)}
                                >
                                    {/* 이름: 넘치면 말줄임 */}
                                    <span className="text-xl font-bold flex-1 text-left truncate">
                                        {c.name}
                                    </span>

                                    {/* 전화번호: 항상 고정폭, 숫자 정렬 */}
                                    <span className="text-lg text-gray-500 shrink-0 tabular-nums font-medium">
                                        {formatPhone(c.phone)}
                                    </span>

                                    {/* 수정 아이콘 힌트 */}
                                    <Pencil size={18} className="text-gray-300 shrink-0" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* 추가/수정/삭제 모달 */}
            {modalContact !== undefined && (
                <ContactModal
                    contact={modalContact}
                    onClose={() => setModalContact(undefined)}
                    onSaved={loadContacts}
                />
            )}
        </MobileLayout>
    );
}
