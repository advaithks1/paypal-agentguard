import type { LucideIcon } from 'lucide-react';
import type { DataSource } from '@/types';
import { cn } from '@/utils/format';
import { toneIconClasses, type BadgeTone } from '@/utils/tones';
import { DemoBadge } from './DemoBadge';
import { Skeleton } from './Skeleton';

interface Props { label: string; value: string; hint?: string; icon: LucideIcon; tone?: BadgeTone; source?: DataSource; loading?: boolean }

export function MetricCard({ label, value, hint, icon: Icon, tone = 'info', source, loading }: Props) {
  return (
    <div className="rounded-card border border-surface-line bg-surface-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-muted">{label}</p>
        <span className={cn('grid h-9 w-9 place-items-center rounded-lg', toneIconClasses[tone])}><Icon className="h-5 w-5" aria-hidden /></span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-28" /> : <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>}
      <div className="mt-1 flex items-center gap-2 text-xs text-ink-muted">
        {hint && <span>{hint}</span>}
        {source && <DemoBadge source={source} />}
      </div>
    </div>
  );
}
