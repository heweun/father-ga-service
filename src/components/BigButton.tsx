import { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface BigButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'danger' | 'outline';
    fullWidth?: boolean;
}

export default function BigButton({
    className,
    variant = 'primary',
    fullWidth = true,
    children,
    type = 'button',
    ...props
}: BigButtonProps) {
    return (
        <button
            type={type}
            className={cn(
                'h-16 px-6 py-4 rounded-2xl text-xl font-bold flex items-center justify-center transition-all duration-150 active:scale-95',
                'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
                'shadow-sm',
                {
                    // Primary: 깊은 네이비 + 그림자 강조
                    'bg-[var(--primary)] text-white hover:brightness-110 shadow-[0_4px_0_0_#0f2456]':
                        variant === 'primary',

                    // Secondary: 따뜻한 흰색 카드
                    'bg-white text-[var(--text-main)] border-2 border-[var(--border)] hover:bg-[#FFF8EE]':
                        variant === 'secondary',

                    // Danger: 선명한 레드
                    'bg-red-500 text-white hover:bg-red-600 shadow-[0_4px_0_0_#b91c1c]':
                        variant === 'danger',

                    // Outline: 테두리만
                    'bg-transparent border-2 border-[var(--primary)] text-[var(--primary)] hover:bg-blue-50':
                        variant === 'outline',

                    'w-full': fullWidth,
                },
                className
            )}
            {...props}
        >
            {children}
        </button>
    );
}
