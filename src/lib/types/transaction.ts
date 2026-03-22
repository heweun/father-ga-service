export type TransactionType = 'income' | 'expense';

export interface Transaction {
    id: string;
    type: TransactionType;
    amount: number;
    category?: string;
    description?: string;
    memo?: string | null;
    created_at?: string;
    transaction_date?: string;
}
