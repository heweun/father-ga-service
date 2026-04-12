export interface NaverOcrField {
    inferText: string;
}

export interface OcrApiResponse {
    amount: number;
    date: string;
    storeName: string;
    debugText?: string;
    raw?: unknown;
}

export interface NaverOcrResponse {
    images: Array<{
        fields: NaverOcrField[];
    }>;
}
