
import Link from 'next/link';
import MobileLayout from '@/components/MobileLayout';
import BigButton from '@/components/BigButton';
import { Plus, Minus, FileText, Share2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';

export default async function MoneyPage() {
    const supabase = await createClient();

    // Calculate Real Balance from transactions
    const { data: transactions } = await supabase
        .from('transactions')
        .select('amount, type');

    const balance = transactions?.reduce((sum, t) => {
        return sum + (t.type === 'income' ? t.amount : -t.amount);
    }, 0) || 0;

    return (
        <MobileLayout title="우리 회비 관리" showBack>

            {/* 1. Balance Card */}
            <section className="bg-black text-yellow-400 p-8 rounded-3xl text-center space-y-2 shadow-lg">
                <h2 className="text-xl opacity-80">현재 남은 돈</h2>
                <p className="text-5xl font-black">
                    {new Intl.NumberFormat('ko-KR').format(balance)}원
                </p>
            </section>

            {/* 2. Actions */}
            <section className="grid grid-cols-2 gap-4">
                <Link href="/money/expense" className="block">
                    <BigButton variant="danger" className="h-40 flex flex-col gap-2 text-2xl">
                        <Minus size={48} />
                        돈 썼음<br />(지출)
                    </BigButton>
                </Link>

                <Link href="/money/income" className="block">
                    <BigButton className="h-40 flex flex-col gap-2 text-2xl bg-blue-600 border-blue-600 text-white">
                        <Plus size={48} />
                        돈 받았음<br />(수입)
                    </BigButton>
                </Link>
            </section>

            {/* 3. Sub Actions */}
            <section className="space-y-4">
                <Link href="/money/history" className="block">
                    <BigButton variant="secondary" className="h-20 text-xl justify-start px-6 gap-4">
                        <FileText size={28} />
                        장부 보기 (내역)
                    </BigButton>
                </Link>
            </section>

        </MobileLayout>
    );
}
