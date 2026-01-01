
import { InputHTMLAttributes } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface BigInputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    helperText?: string;
}

export default function BigInput({
    label,
    helperText,
    className,
    id,
    ...props
}: BigInputProps) {
    const inputId = id || crypto.randomUUID();

    return (
        <div className="space-y-2 w-full">
            {label && (
                <label htmlFor={inputId} className="block text-xl font-bold text-[var(--text-main)] mb-1">
                    {label}
                </label>
            )}
            <input
                id={inputId}
                className={cn(
                    "w-full h-16 px-4 rounded-xl border-2 border-slate-300 bg-white text-2xl placeholder:text-slate-400 focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100 outline-none transition-all",
                    className
                )}
                {...props}
            />
            {helperText && (
                <p className="text-base text-[var(--text-sub)] mt-1 ml-1">
                    {helperText}
                </p>
            )}
        </div>
    );
}
