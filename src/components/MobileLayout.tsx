import Link from 'next/link';
import { ChevronLeft, Home } from 'lucide-react';
import React from 'react';

interface LayoutProps {
    children: React.ReactNode;
    title: string;
    showBack?: boolean;
    backUrl?: string;
}

export default function MobileLayout({ children, title, showBack = false, backUrl = '/' }: LayoutProps) {
    return (
        <div className="min-h-[100dvh] pb-24 max-w-md mx-auto bg-[var(--bg-app)] shadow-2xl overflow-hidden relative">
            {/* 헤더 */}
            <header className="sticky top-0 z-50 flex items-center h-16 px-3 bg-[var(--primary)]">
                {showBack ? (
                    <Link
                        href={backUrl}
                        className="p-2 -ml-1 mr-1 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <ChevronLeft size={32} />
                    </Link>
                ) : (
                    <div className="w-10" />
                )}

                <h1 className="flex-1 text-2xl font-black text-white text-center tracking-tight">
                    {title}
                </h1>

                {showBack ? (
                    <Link
                        href="/"
                        className="p-2 -mr-1 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                    >
                        <Home size={26} />
                    </Link>
                ) : (
                    <div className="w-10" />
                )}
            </header>

            <main className="p-4 space-y-5">
                {children}
            </main>
        </div>
    );
}
