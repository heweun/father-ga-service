export interface NaverOcrField {
    inferText: string;
}

export interface OcrApiResponse {
    amount: number;
    date: string;
    storeName: string;
    debugText?: string;
    raw?: any;
}

export interface NaverOcrResponse {
    images: Array<{
        fields: NaverOcrField[];
    }>;
}
