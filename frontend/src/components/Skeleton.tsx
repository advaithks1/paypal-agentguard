import { cn } from '@/utils/format';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />;
}
export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 rounded-card border border-surface-line bg-surface-card p-5 shadow-card" role="status" aria-label="Loading">
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className="h-3 w-full" />)}
    </div>
  );
}
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" role="status" aria-label="Loading table">
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  );
}
