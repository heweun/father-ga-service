export interface SmsRequest {
    receivers: string[];
    message: string;
}

export interface SmsSuccessResponse {
    success: true;
    result?: {
        count?: number;
    };
    mock?: boolean;
}

export interface SmsErrorResponse {
    success: false;
    error: string;
}

export type SmsResponse = SmsSuccessResponse | SmsErrorResponse;
