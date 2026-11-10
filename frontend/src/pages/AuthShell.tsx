import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { DemoBanner } from '@/components/DemoBadge';
import { isDemoMode } from '@/services/config';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-navy-900 p-12 text-slate-300 lg:flex">
        <div className="flex items-center gap-2.5 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand"><ShieldCheck className="h-5 w-5" aria-hidden /></span>
          <span className="text-lg font-semibold">PayPal AgentGuard</span>
        </div>
        <div>
          <p className="text-3xl font-semibold leading-snug text-white">Let AI transact.<br />Let PayPal power the payment.<br />Let AgentGuard enforce the rules.</p>
          <p className="mt-4 max-w-md text-sm text-slate-400">Define what your AI purchasing agents may buy, from whom and for how much. Every request is checked against your policies before money moves.</p>
        </div>
        <p className="text-xs text-slate-500">Payments processed by PayPal. AgentGuard never stores card data.</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-ink-muted">{subtitle}</p>
          {isDemoMode && <div className="mb-5"><DemoBanner>Demo mode: no real authentication, accounts or payments.</DemoBanner></div>}
          {children}
        </div>
      </div>
    </div>
  );
}
