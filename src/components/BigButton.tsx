
import { ButtonHTMLAttributes } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

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
                // Base Styles: Large touch target, rounded, font-medium, flex center
                'h-16 px-6 py-4 rounded-2xl text-xl font-bold flex items-center justify-center transition-all duration-200 active:scale-95 shadow-md',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
                {
                    // Primary: Brand Blue with White text
                    'bg-[var(--primary)] text-white hover:bg-blue-700': variant === 'primary',

                    // Secondary: White surface with border, dark text
                    'bg-white text-[var(--text-main)] border-2 border-slate-200 hover:bg-slate-50': variant === 'secondary',

                    // Danger: Soft Red
                    'bg-red-500 text-white hover:bg-red-600': variant === 'danger',

                    // Outline (Ghost-like)
                    'bg-transparent border-2 border-[var(--primary)] text-[var(--primary)]': variant === 'outline',

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
