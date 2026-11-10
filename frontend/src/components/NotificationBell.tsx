import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDate } from '@/utils/format';

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button type="button" aria-label={`Notifications, ${unreadCount} unread`} aria-expanded={open}
        onClick={() => { setOpen((o) => !o); if (!open) markAllRead(); }}
        className="relative rounded-lg p-2 text-ink-muted hover:bg-slate-100">
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unreadCount}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-card border border-surface-line bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-surface-line px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {notifications.length > 0 && <button type="button" onClick={clearAll} className="text-xs font-medium text-brand hover:underline">Clear all</button>}
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-ink-muted">You're all caught up.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-surface-line overflow-y-auto">
              {notifications.map((n) => (
                <li key={n.id} className="px-4 py-3">
                  <p className="text-sm font-medium">{n.title}</p>
                  {n.message && <p className="text-sm text-ink-muted">{n.message}</p>}
                  <p className="mt-0.5 text-xs text-slate-400">{formatDate(n.created_at)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
