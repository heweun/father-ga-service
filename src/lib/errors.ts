export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'string') {
        return error;
    }

    if (typeof error === 'object' && error !== null && 'message' in error) {
        return String(error.message);
    }

    return '알 수 없는 오류가 발생했습니다.';
}
