export const EXPENSE_CATEGORIES = [
    '식사/회식',
    '교통비',
    '선물/경조사',
    '운영비',
    '기타',
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export type FilterType = 'all' | 'thisMonth' | 'lastMonth' | 'threeMonths';

export const HISTORY_FILTERS: { key: FilterType; label: string }[] = [
    { key: 'all', label: '전체보기' },
    { key: 'thisMonth', label: '이번 달' },
    { key: 'lastMonth', label: '지난 달' },
    { key: 'threeMonths', label: '3개월' },
];
