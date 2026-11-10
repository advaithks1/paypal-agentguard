import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props { open: boolean; onClose: () => void; title: string; children: ReactNode }

/** Right-hand detail panel (full width on phones). */
export function Drawer({ open, onClose, title, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; previous?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-navy-950/60" onClick={onClose} aria-hidden />
      <aside ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-surface-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-surface-line px-5 py-4">
          <h2 id={titleId} className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close panel" className="rounded-md p-1 text-ink-muted hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
