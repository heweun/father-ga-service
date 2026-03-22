const formatter = new Intl.NumberFormat('ko-KR');

/**
 * Format a number as Korean Won
 * @param amount - Amount in won
 * @returns Formatted string (e.g., "15,000원")
 */
export function formatWon(amount: number): string {
    return `${formatter.format(amount)}원`;
}

/**
 * Parse a Korean Won formatted string to number
 * @param input - String like "15,000원" or "15,000" or "15000"
 * @returns Number (e.g., 15000)
 */
export function parseWon(input: string): number {
    const cleaned = input.replace(/[^0-9]/g, '');
    return parseInt(cleaned, 10) || 0;
}
