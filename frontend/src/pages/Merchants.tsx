import { Search } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/Card';
import { DemoBanner } from '@/components/DemoBadge';
import { inputClass } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { TableSkeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { useAsync } from '@/hooks/useAsync';
import { isDemoMode } from '@/services/config';
import { merchantService } from '@/services/merchants';
import { formatMoney } from '@/utils/format';

export default function Merchants() {
  const [q, setQ] = useState('');
  const { data, error, reload } = useAsync(() => merchantService.list(), []);
  const rows = (data ?? []).filter((m) => `${m.name} ${m.category}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <PageHeader title="Merchants" description="The merchant directory the policy engine checks. Trusted merchants can be auto-approved; restricted ones are always blocked." />
      {isDemoMode && <div className="mb-5"><DemoBanner>Demo directory: trust scores and limits are fictional.</DemoBanner></div>}
      <Card flush>
        <div className="border-b border-surface-line p-4">
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input type="search" aria-label="Search merchants" placeholder="Search merchant or category" value={q} onChange={(e) => setQ(e.target.value)} className={`${inputClass()} pl-9`} />
          </div>
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <TableSkeleton rows={8} />
          : rows.length === 0 ? <EmptyState title={q ? 'No merchants match your search' : 'No merchants yet'} description={q ? 'Try a different name.' : 'The directory is seeded when the backend starts.'} />
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-ink-muted"><tr>{['Merchant', 'Category', 'Status', 'Trust score', 'Per-transaction limit', 'Monthly limit'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{rows.map((m) => (
                  <tr key={m.id} className="border-t border-surface-line">
                    <td className="px-4 py-3 font-medium">{m.name}</td>
                    <td className="px-4 py-3 text-ink-muted">{m.category}</td>
                    <td className="px-4 py-3"><StatusBadge status={m.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100" role="presentation"><div className={`h-full rounded-full ${m.trust_score >= 75 ? 'bg-ok' : m.trust_score >= 40 ? 'bg-warn' : 'bg-danger'}`} style={{ width: `${m.trust_score}%` }} /></div><span className="tabular-nums">{m.trust_score}</span></div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{m.per_transaction_limit === null ? 'No limit' : formatMoney(m.per_transaction_limit, m.currency)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{m.monthly_limit === null ? 'No limit' : formatMoney(m.monthly_limit, m.currency)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
      </Card>
    </>
  );
}
