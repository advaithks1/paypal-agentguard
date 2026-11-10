import { LogOut, Menu } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { isDemoMode } from '@/services/config';
import { initials } from '@/utils/format';
import { findNavItem } from '@/utils/navigation';
import { NotificationBell } from './NotificationBell';

export function Header({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const title = findNavItem(pathname)?.label ?? 'AgentGuard';
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-surface-line bg-white/90 px-4 backdrop-blur sm:px-6">
      <button type="button" onClick={onMenu} aria-label="Open menu" className="rounded-lg p-2 text-ink-muted hover:bg-slate-100 lg:hidden"><Menu className="h-5 w-5" /></button>
      <p className="text-sm font-semibold sm:text-base">{title}</p>
      <div className="ml-auto flex items-center gap-2">
        {isDemoMode && <span className="hidden rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700 ring-1 ring-inset ring-violet-200 sm:inline">Demo data</span>}
        <NotificationBell />
        {user && (
          <div className="flex items-center gap-2 border-l border-surface-line pl-3">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-navy-800 text-xs font-semibold text-white" aria-hidden>{initials(user.full_name)}</span>
            <div className="hidden leading-tight md:block">
              <p className="text-sm font-medium">{user.full_name}</p>
              <p className="text-xs text-ink-muted">{user.email}</p>
            </div>
            <button type="button" onClick={logout} aria-label="Sign out" className="rounded-lg p-2 text-ink-muted hover:bg-slate-100"><LogOut className="h-5 w-5" /></button>
          </div>
        )}
      </div>
    </header>
  );
}
