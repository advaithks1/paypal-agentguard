import { ShieldCheck, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { cn } from '@/utils/format';
import { NAV_ITEMS } from '@/utils/navigation';
import { isDemoMode } from '@/services/config';

export function Sidebar({ onNavigate, onClose }: { onNavigate?: () => void; onClose?: () => void }) {
  return (
    <div className="flex h-full w-64 flex-col bg-navy-900 text-slate-300">
      <div className="flex h-16 items-center justify-between px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-white">AgentGuard</p>
            <p className="text-[11px] text-slate-400">for PayPal</p>
          </div>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close menu" className="rounded p-1 text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>}
      </div>
      <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2">
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={path} end={path === '/'} onClick={onNavigate}
            className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-navy-700 text-white' : 'hover:bg-navy-800 hover:text-white')}>
            <Icon className="h-[18px] w-[18px]" aria-hidden />{label}
          </NavLink>
        ))}
      </nav>
      {isDemoMode && (
        <div className="m-3 rounded-lg bg-navy-800 p-3 text-xs text-slate-400">
          <p className="font-semibold text-slate-200">Demo preview</p>
          <p className="mt-0.5">Data is simulated. No real PayPal payments occur.</p>
        </div>
      )}
    </div>
  );
}
