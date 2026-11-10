import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Props { page: number; pageSize: number; total: number; onPage: (p: number) => void }

export function Pagination({ page, pageSize, total, onPage }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn = 'inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-line px-4 py-3 text-sm">
      <p className="text-ink-muted">Showing <span className="font-medium text-ink">{from}-{to}</span> of <span className="font-medium text-ink">{total}</span></p>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft className="h-4 w-4" aria-hidden />Previous</button>
        <span className="px-1 text-ink-muted">Page {page} of {pages}</span>
        <button type="button" className={btn} disabled={page >= pages} onClick={() => onPage(page + 1)}>Next<ChevronRight className="h-4 w-4" aria-hidden /></button>
      </div>
    </nav>
  );
}
