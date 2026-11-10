import { cn } from '@/utils/format';

export function UtilizationMeter({ percent, label }: { percent: number; label: string }) {
  const pct = Math.min(100, Math.max(0, percent));
  const color = pct < 60 ? 'bg-ok' : pct < 85 ? 'bg-warn' : 'bg-danger';
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-semibold tabular-nums">{pct}%</p>
        <p className="text-xs text-ink-muted">{label}</p>
      </div>
      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
