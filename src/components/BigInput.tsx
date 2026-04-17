import { InputHTMLAttributes, useId } from 'react';
import { cn } from '@/lib/cn';

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
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
        <div className="space-y-2 w-full">
            {label && (
                <label htmlFor={inputId} className="block text-lg font-bold text-[var(--text-main)]">
                    {label}
                </label>
            )}
            <input
                id={inputId}
                className={cn(
                    "w-full h-16 px-4 rounded-2xl border-2 border-[var(--border)] bg-white text-2xl",
                    "placeholder:text-slate-300",
                    "focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-100 outline-none transition-all",
                    className
                )}
                {...props}
            />
            {helperText && (
                <p className="text-base text-[var(--text-sub)] mt-1 ml-1">{helperText}</p>
            )}
        </div>
    );
}
