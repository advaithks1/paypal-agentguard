import type { RiskCategory } from '@/types';
import { cn } from '@/utils/format';

const STYLE: Record<RiskCategory, string> = {
  low: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  medium: 'bg-amber-50 text-amber-800 ring-amber-200',
  high: 'bg-orange-50 text-orange-700 ring-orange-200',
  critical: 'bg-red-50 text-red-700 ring-red-300',
};
export const RISK_LABEL: Record<RiskCategory, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

export function RiskBadge({ category, score, className }: { category: RiskCategory; score?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', STYLE[category], className)}>
      {score !== undefined && <span className="font-semibold tabular-nums">{score}</span>}
      {RISK_LABEL[category]}
    </span>
  );
}
