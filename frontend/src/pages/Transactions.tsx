import { Search, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Card } from '@/components/Card';
import { DemoBanner } from '@/components/DemoBadge';
import { inputClass } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { TableSkeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/States';
import { TransactionDetailModal } from '@/components/TransactionDetailModal';
import { TransactionTable } from '@/components/TransactionTable';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { isDemoMode } from '@/services/config';
import { transactionService } from '@/services/transactions';
import type { PaymentStatus, PolicyDecision, RiskCategory, SortDir, TransactionQuery, TransactionSortKey } from '@/types';

const PAGE_SIZE = 10;
const DECISIONS: { v: PolicyDecision; l: string }[] = [{ v: 'auto_approved', l: 'Auto-approved' }, { v: 'needs_approval', l: 'Needs approval' }, { v: 'blocked', l: 'Blocked' }];
const PAYMENTS: { v: PaymentStatus; l: string }[] = [
  { v: 'not_started', l: 'Not started' }, { v: 'order_created', l: 'Order created' }, { v: 'buyer_approved', l: 'Buyer approved' },
  { v: 'captured', l: 'Captured' }, { v: 'failed', l: 'Failed' }, { v: 'refunded', l: 'Refunded' }, { v: 'voided', l: 'Voided' },
];
const RISKS: { v: RiskCategory; l: string }[] = [{ v: 'low', l: 'Low' }, { v: 'medium', l: 'Medium' }, { v: 'high', l: 'High' }, { v: 'critical', l: 'Critical' }];

export default function Transactions() {
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search, 250);
  const [decision, setDecision] = useState<PolicyDecision | ''>('');
  const [payment, setPayment] = useState<PaymentStatus | ''>('');
  const [risk, setRisk] = useState<RiskCategory | ''>('');
  const [sortKey, setSortKey] = useState<TransactionSortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const closeDetail = useCallback(() => setSelected(null), []);

  const query: TransactionQuery = {
    search: debounced || undefined,
    policy_decision: decision || undefined,
    payment_status: payment || undefined,
    risk_category: risk || undefined,
    sort_by: sortKey, sort_dir: sortDir, page, page_size: PAGE_SIZE,
  };
  const { data, error, loading, reload } = useAsync(() => transactionService.list(query), [debounced, decision, payment, risk, sortKey, sortDir, page]);

  const filtered = search !== '' || decision !== '' || payment !== '' || risk !== '';
  const clear = () => { setSearch(''); setDecision(''); setPayment(''); setRisk(''); setPage(1); };
  const onSort = (k: TransactionSortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'merchant' ? 'asc' : 'desc'); }
    setPage(1);
  };
  const select = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm';

  return (
    <>
      <PageHeader title="Transactions" description="Every purchase decision made by AgentGuard, with its risk score, policy decision and payment status." />
      {isDemoMode && <div className="mb-5"><DemoBanner>Demo data: these transactions are simulated and have no PayPal order behind them.</DemoBanner></div>}

      <Card flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-surface-line p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" aria-label="Search by transaction ID or merchant" placeholder="Search ID or merchant" value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }} className={`${inputClass()} pl-9`} />
          </div>
          <select aria-label="Filter by policy decision" className={select} value={decision} onChange={(e) => { setDecision(e.target.value as PolicyDecision | ''); setPage(1); }}>
            <option value="">All decisions</option>{DECISIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <select aria-label="Filter by payment status" className={select} value={payment} onChange={(e) => { setPayment(e.target.value as PaymentStatus | ''); setPage(1); }}>
            <option value="">All payment statuses</option>{PAYMENTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <select aria-label="Filter by risk category" className={select} value={risk} onChange={(e) => { setRisk(e.target.value as RiskCategory | ''); setPage(1); }}>
            <option value="">All risk levels</option>{RISKS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          {filtered && <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"><X className="h-4 w-4" aria-hidden />Clear</button>}
        </div>

        {error ? <ErrorState message={error} onRetry={reload} />
          : !data ? <TableSkeleton rows={8} />
          : data.items.length === 0 ? (
            <EmptyState title={filtered ? 'No transactions match your filters' : 'No transactions yet'}
              description={filtered ? 'Try a different search or clear the filters.' : 'Transactions appear here once your agents submit purchase requests.'}
              action={filtered ? <button type="button" onClick={clear} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Clear filters</button> : undefined} />
          ) : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
              <TransactionTable rows={data.items} onSelect={(t) => setSelected(t.id)} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
            </div>
          )}
      </Card>
      {selected && <TransactionDetailModal id={selected} onClose={closeDetail} />}
    </>
  );
}
