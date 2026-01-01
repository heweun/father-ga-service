
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
        <div className="min-h-screen pb-20 max-w-md mx-auto bg-[var(--color-bg)] border-x border-gray-200 dark:border-gray-800 shadow-xl overflow-hidden relative">
            <header className="sticky top-0 z-50 flex items-center h-16 px-4 bg-[var(--color-bg)] border-b-4 border-[var(--color-primary)]">
                {showBack ? (
                    <Link href={backUrl} className="p-2 -ml-2 mr-2 rounded-full active:bg-gray-200 dark:active:bg-gray-700">
                        <ChevronLeft size={32} />
                    </Link>
                ) : (
                    <div className="w-2" />
                )}
                <h1 className="flex-1 text-2xl font-black truncate text-center">{title}</h1>
                {showBack && (
                    <Link href="/" className="p-2 -mr-2 rounded-full active:bg-gray-200 dark:active:bg-gray-700">
                        <Home size={28} />
                    </Link>
                )}
            </header>

            <main className="p-4 space-y-6">
                {children}
            </main>
        </div>
    );
}
