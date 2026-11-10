import { useContext } from 'react';
import { NotificationContext, type NotificationState } from '@/contexts/NotificationContext';

export function useNotifications(): NotificationState {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used inside <NotificationProvider>');
  return ctx;
}
