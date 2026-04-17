'use client';

import { useState, useEffect, useCallback } from 'react';
import MobileLayout from '@/components/MobileLayout';
import BigButton from '@/components/BigButton';
import ContactModal, { Contact } from '@/components/ContactModal';
import { createClient } from '@/lib/supabase/client';
import { UserPlus } from 'lucide-react';

export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [modalContact, setModalContact] = useState<Contact | null | undefined>(undefined);
    // undefined: 모달 닫힘, null: 추가 모드, Contact: 수정 모드

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

                <div className="flex items-center justify-between">
                    <p className="text-xl font-bold text-gray-600">
                        총 {contacts.length}명
                    </p>
                    <BigButton
                        onClick={() => setModalContact(null)}
                        className="w-auto h-12 px-4 text-base"
                        fullWidth={false}
                    >
                        <UserPlus size={20} className="mr-2" />
                        새 회원 추가
                    </BigButton>
                </div>

                {isLoading && (
                    <p className="text-center text-xl text-gray-400 py-12">불러오는 중...</p>
                )}

                {loadError && (
                    <div className="text-center py-8 space-y-4">
                        <p className="text-red-500 text-xl">{loadError}</p>
                        <BigButton variant="outline" onClick={loadContacts}>다시 불러오기</BigButton>
                    </div>
                )}

                {!isLoading && !loadError && (
                    <ul className="space-y-2">
                        {contacts.map(c => (
                            <li key={c.id}>
                                <button
                                    className="w-full flex justify-between items-center px-4 py-4 bg-white border-2 border-slate-200 rounded-2xl hover:bg-slate-50 active:scale-95 transition-all"
                                    onClick={() => setModalContact(c)}
                                >
                                    <span className="text-xl font-bold">{c.name}</span>
                                    <span className="text-lg text-gray-500">{c.phone}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

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
