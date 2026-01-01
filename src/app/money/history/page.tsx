'use client';

import { useState, useEffect } from 'react';
import MobileLayout from '@/components/MobileLayout';
import { createClient } from '@/lib/supabase/client';

type FilterType = 'all' | 'thisMonth' | 'lastMonth' | 'threeMonths';

export default function HistoryPage() {
    const [filter, setFilter] = useState<FilterType>('threeMonths');
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTransactions();
    }, [filter]);

    const fetchTransactions = async () => {
        setLoading(true);
        const supabase = createClient();

        let query = supabase
            .from('transactions')
            .select('*')
            .order('created_at', { ascending: false });

        // Apply date filter
        const now = new Date();
        if (filter === 'thisMonth') {
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            query = query.gte('created_at', startOfMonth.toISOString());
        } else if (filter === 'lastMonth') {
            const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
            query = query.gte('created_at', startOfLastMonth.toISOString())
                .lte('created_at', endOfLastMonth.toISOString());
        } else if (filter === 'threeMonths') {
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
            query = query.gte('created_at', threeMonthsAgo.toISOString());
        }
        // 'all' has no date filter

        const { data } = await query;
        setTransactions(data || []);
        setLoading(false);
    };

    const filterButtons: { key: FilterType; label: string }[] = [
        { key: 'all', label: '전체보기' },
        { key: 'thisMonth', label: '이번 달' },
        { key: 'lastMonth', label: '지난 달' },
        { key: 'threeMonths', label: '3개월' }
    ];

    return (
        <MobileLayout title="장부 (내역)" showBack backUrl="/money">

            {/* Filter Buttons */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {filterButtons.map(btn => (
                    <button
                        key={btn.key}
                        onClick={() => setFilter(btn.key)}
                        className={`px-4 py-2 rounded-full text-base font-bold whitespace-nowrap transition-colors ${filter === btn.key
                                ? 'bg-[var(--primary)] text-white'
                                : 'bg-white border-2 border-slate-200 text-slate-600'
                            }`}
                    >
                        {btn.label}
                    </button>
                ))}
            </div>

            {/* Transaction List */}
            {loading ? (
                <div className="text-center py-8 text-gray-400">불러오는 중...</div>
            ) : transactions.length === 0 ? (
                <div className="text-center py-8 text-gray-400">내역이 없습니다.</div>
            ) : (
                <ul className="space-y-4">
                    {transactions.map((t: any) => (
                        <li
                            key={t.id}
                            className={`p-4 rounded-xl border-2 flex justify-between items-start shadow-sm ${t.type === 'income'
                                    ? 'bg-blue-50 border-blue-200'
                                    : 'bg-red-50 border-red-200'
                                }`}
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <p className="font-bold text-lg">{t.description || t.category}</p>
                                    {t.category && (
                                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${t.type === 'income'
                                                ? 'bg-blue-200 text-blue-800'
                                                : 'bg-red-200 text-red-800'
                                            }`}>
                                            {t.category}
                                        </span>
                                    )}
                                </div>
                                <p className="text-gray-600 text-base">{t.transaction_date || t.created_at?.substring(0, 10)}</p>
                                {t.memo && (
                                    <p className="text-sm text-gray-500 italic mt-1">📝 {t.memo}</p>
                                )}
                            </div>
                            <div className={`text-xl font-bold ml-4 ${t.type === 'income' ? 'text-blue-700' : 'text-red-700'}`}>
                                {t.type === 'income' ? '+' : '-'}{new Intl.NumberFormat('ko-KR').format(t.amount)}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </MobileLayout>
    );
}
