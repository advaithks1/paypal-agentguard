import { createContext, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Toaster } from '@/components/Toaster';

export type NotificationTone = 'info' | 'success' | 'warning' | 'danger';
export interface AppNotification {
  id: number; title: string; message?: string; tone: NotificationTone; created_at: string; read: boolean;
}
export interface NotifyInput { title: string; message?: string; tone?: NotificationTone }
export interface NotificationState {
  notifications: AppNotification[];
  toasts: AppNotification[];
  unreadCount: number;
  notify: (n: NotifyInput) => void;
  dismissToast: (id: number) => void;
  markAllRead: () => void;
  clearAll: () => void;
}
export const NotificationContext = createContext<NotificationState | null>(null);

const MAX_HISTORY = 25;
const TOAST_MS = 5000;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const nextId = useRef(1);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback((n: NotifyInput) => {
    const item: AppNotification = {
      id: nextId.current++, title: n.title, message: n.message, tone: n.tone ?? 'info',
      created_at: new Date().toISOString(), read: false,
    };
    setNotifications((list) => [item, ...list].slice(0, MAX_HISTORY));
    setToasts((t) => [...t, item]);
    window.setTimeout(() => dismissToast(item.id), TOAST_MS);
  }, [dismissToast]);
  const markAllRead = useCallback(() => setNotifications((l) => l.map((n) => ({ ...n, read: true }))), []);
  const clearAll = useCallback(() => setNotifications([]), []);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const value = useMemo(
    () => ({ notifications, toasts, unreadCount, notify, dismissToast, markAllRead, clearAll }),
    [notifications, toasts, unreadCount, notify, dismissToast, markAllRead, clearAll],
  );
  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </NotificationContext.Provider>
  );
}
