import { cn } from '@/utils/format';

export interface BarItem { label: string; value: number; display?: string; hint?: string }

/** Simple labelled horizontal bars (no chart library needed). */
export function BarList({ items, color = 'bg-brand' }: { items: BarItem[]; color?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-medium">{i.label}{i.hint && <span className="ml-1.5 text-xs font-normal text-ink-muted">{i.hint}</span>}</span>
            <span className="shrink-0 tabular-nums text-ink-muted">{i.display ?? i.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100" role="presentation"><div className={cn('h-full rounded-full', color)} style={{ width: `${Math.max(3, (i.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
