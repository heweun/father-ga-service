import React from 'react';
import Link from 'next/link';
import { MessageSquare, Wallet, Users } from 'lucide-react';

interface MenuCardProps {
    href: string;
    icon: React.ReactNode;
    title: string;
    desc: string;
    accent?: boolean;
}

function MenuCard({ href, icon, title, desc, accent = false }: MenuCardProps) {
    return (
        <Link href={href} className="block active:scale-95 transition-transform duration-100">
            <div className={`
                rounded-3xl p-7 flex items-center gap-5
                border-b-4 shadow-sm
                ${accent
                    ? 'bg-[var(--primary)] text-white border-[#0f2456]'
                    : 'bg-white text-[var(--text-main)] border-[var(--border)]'
                }
            `}>
                <div className={`
                    w-16 h-16 rounded-2xl flex items-center justify-center shrink-0
                    ${accent ? 'bg-white/15' : 'bg-[#F0F4FF]'}
                `}>
                    {icon}
                </div>
                <div>
                    <h2 className={`text-2xl font-black mb-0.5 ${accent ? 'text-white' : 'text-[var(--text-main)]'}`}>
                        {title}
                    </h2>
                    <p className={`text-base ${accent ? 'text-white/75' : 'text-[var(--text-sub)]'}`}>
                        {desc}
                    </p>
                </div>
            </div>
        </Link>
    );
}

export default function Home() {
    return (
        <main className="min-h-[100dvh] bg-[var(--bg-app)] flex flex-col max-w-md mx-auto shadow-2xl">

            {/* 헤더 */}
            <header className="bg-[var(--primary)] px-6 pt-12 pb-8">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-3xl">👑</span>
                    <h1 className="text-4xl font-black text-white tracking-tight">총무나라</h1>
                </div>
                <p className="text-white/70 text-lg">
                    동창회 관리, 이제 쉽게 하세요
                </p>
            </header>

            {/* 메뉴 카드들 */}
            <div className="flex-1 px-4 py-6 space-y-4">

                <MenuCard
                    href="/sms"
                    accent
                    icon={<MessageSquare size={32} className="text-white" strokeWidth={1.8} />}
                    title="문자 보내기"
                    desc="모임 공지, 경조사 알림"
                />

                <MenuCard
                    href="/money"
                    icon={<Wallet size={32} className="text-[var(--primary)]" strokeWidth={1.8} />}
                    title="회비 관리"
                    desc="회비, 지출, 장부 정리"
                />

                <MenuCard
                    href="/contacts"
                    icon={<Users size={32} className="text-[var(--accent)]" strokeWidth={1.8} />}
                    title="회원 관리"
                    desc="회원 추가, 수정, 삭제"
                />

            </div>

            {/* 푸터 */}
            <footer className="px-6 py-5 border-t border-[var(--border)] text-center text-[var(--text-sub)] text-base">
                곤지암중 25기 동창회
            </footer>

        </main>
    );
}
