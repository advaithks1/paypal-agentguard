import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/utils/format';

interface Props { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; size?: 'md' | 'lg' }

export function Modal({ open, onClose, title, children, footer, size = 'md' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-navy-950/60" onClick={onClose} aria-hidden />
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={cn('relative flex max-h-[90vh] w-full flex-col rounded-card bg-surface-card shadow-2xl', size === 'lg' ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between border-b border-surface-line px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-md p-1 text-ink-muted hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-surface-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
