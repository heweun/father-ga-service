
import Link from 'next/link';
import BigButton from '@/components/BigButton';
import { MessageSquare, Wallet, UserCircle, Users } from 'lucide-react';

export default function Home() {
  return (
    <main className="min-h-screen bg-[var(--bg-app)] flex flex-col max-w-md mx-auto shadow-2xl bg-white min-h-[100dvh]">

      {/* Header Area */}
      <header className="p-8 pb-4">
        <h1 className="text-3xl font-bold text-[var(--text-main)] mb-1">
          총무나라 <span className="text-2xl">👑</span>
        </h1>
        <p className="text-xl text-[var(--text-sub)]">
          동창회, 모임 관리가<br />이렇게 쉬울 수 없습니다.
        </p>
      </header>

      {/* Main Actions */}
      <div className="flex-1 px-6 space-y-6 flex flex-col justify-center pb-20">

        <Link href="/sms" className="block transform transition-transform active:scale-95">
          <div className="bg-[var(--primary)] text-white rounded-3xl p-8 shadow-lg shadow-blue-200 flex flex-col items-center gap-4 text-center border-b-4 border-blue-700">
            <MessageSquare size={64} strokeWidth={1.5} />
            <div>
              <h2 className="text-3xl font-bold mb-1">문자 보내기</h2>
              <p className="opacity-90 text-lg">모임 공지, 경조사 알림</p>
            </div>
          </div>
        </Link>

        <Link href="/money" className="block transform transition-transform active:scale-95">
          <div className="bg-white text-[var(--text-main)] border-2 border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col items-center gap-4 text-center">
            <Wallet size={64} strokeWidth={1.5} className="text-[var(--accent)]" />
            <div>
              <h2 className="text-3xl font-bold mb-1">회비 관리</h2>
              <p className="text-[var(--text-sub)] text-lg">회비, 지출, 장부 정리</p>
            </div>
          </div>
        </Link>

        <Link href="/contacts" className="block transform transition-transform active:scale-95">
          <div className="bg-white text-[var(--text-main)] border-2 border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col items-center gap-4 text-center">
            <Users size={64} strokeWidth={1.5} className="text-green-600" />
            <div>
              <h2 className="text-3xl font-bold mb-1">회원 관리</h2>
              <p className="text-[var(--text-sub)] text-lg">회원 추가, 수정, 삭제</p>
            </div>
          </div>
        </Link>

      </div>

      {/* Footer / User Info */}
      <footer className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-2 text-[var(--text-sub)]">
        <UserCircle size={24} />
        <span className="font-medium">접속중: 총무님</span>
      </footer>

    </main>
  );
}
