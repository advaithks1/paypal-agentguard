import type { ReactNode } from 'react';
import { cn } from '@/utils/format';

export const inputClass = (invalid?: boolean): string =>
  cn('block w-full rounded-lg border bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand disabled:bg-slate-50 disabled:text-slate-500',
    invalid ? 'border-danger' : 'border-slate-300');

interface Props { label: string; htmlFor: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }

export function FormField({ label, htmlFor, error, hint, required, children, className }: Props) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children}
      {hint && !error && <p id={`${htmlFor}-hint`} className="mt-1 text-xs text-ink-muted">{hint}</p>}
      {error && <p id={`${htmlFor}-error`} role="alert" className="mt-1 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
