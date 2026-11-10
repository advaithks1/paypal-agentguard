import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import type { AppNotification, NotificationTone } from '@/contexts/NotificationContext';

const ICON = { info: Info, success: CheckCircle2, warning: TriangleAlert, danger: AlertCircle } as const;
const COLOR: Record<NotificationTone, string> = { info: 'text-brand', success: 'text-ok', warning: 'text-warn', danger: 'text-danger' };

export function Toaster({ toasts, onDismiss }: { toasts: AppNotification[]; onDismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICON[t.tone];
        return (
          <div key={t.id} className="pointer-events-auto flex gap-3 rounded-lg border border-surface-line bg-white p-3 shadow-lg">
            <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${COLOR[t.tone]}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.message && <p className="text-sm text-ink-muted">{t.message}</p>}
            </div>
            <button type="button" onClick={() => onDismiss(t.id)} aria-label="Dismiss notification" className="h-fit rounded p-0.5 text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>
        );
      })}
    </div>
  );
}
