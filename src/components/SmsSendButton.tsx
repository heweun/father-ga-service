
'use client';

import { cn } from '@/lib/cn';

interface SmsSendButtonProps {
    /** Called when the button is pressed (ignored when isLoading = true) */
    onClick: () => void;
    /** When true: shows spinner, disables pointer events, prevents double-submit */
    isLoading: boolean;
    /** Optional additional Tailwind classes */
    className?: string;
    /** Button label when idle (default: '보내기 (전송)') */
    label?: string;
    /** Button label while loading (default: '발송 중...') */
    loadingLabel?: string;
}

/**
 * SmsSendButton
 *
 * A large primary button used exclusively for the SMS dispatch action.
 * Renders a spinner and disables itself while `isLoading` is true so the
 * father cannot accidentally trigger a second dispatch mid-flight.
 *
 * Design constraints:
 *  • Touch-target size matches BigButton (h-16, text-xl) for one-handed use
 *  • Loading state replaces label with a spinner + Korean status text
 *  • Disabled state is enforced at the HTML level (disabled attr) so it works
 *    even if onClick is somehow called programmatically
 */
export default function SmsSendButton({
    onClick,
    isLoading,
    className,
    label = '보내기 (전송)',
    loadingLabel = '발송 중...',
}: SmsSendButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={isLoading}
            aria-busy={isLoading}
            aria-label={isLoading ? loadingLabel : label}
            className={cn(
                // Base styles — matches BigButton sizing for visual consistency
                'h-16 w-full px-6 py-4 rounded-2xl text-xl font-bold',
                'flex items-center justify-center gap-3',
                'transition-all duration-200 active:scale-95 shadow-md',
                // Primary palette
                'bg-[var(--primary)] text-white hover:bg-blue-700',
                // Disabled / loading state — prevent double-submit
                'disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100',
                className,
            )}
        >
            {isLoading ? (
                <>
                    {/* Spinner — inline SVG keeps bundle size at zero */}
                    <svg
                        className="w-6 h-6 animate-spin flex-shrink-0"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                        />
                        <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                    </svg>
                    <span>{loadingLabel}</span>
                </>
            ) : (
                <span>{label}</span>
            )}
        </button>
    );
}
