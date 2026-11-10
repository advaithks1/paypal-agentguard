import { useState } from 'react';
import { Card } from '@/components/Card';
import { DemoBanner, SourceBadge } from '@/components/DemoBadge';
import { PageHeader } from '@/components/PageHeader';
import { Pagination } from '@/components/Pagination';
import { TableSkeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/States';
import { useAsync } from '@/hooks/useAsync';
import { auditService } from '@/services/audit';
import { isDemoMode } from '@/services/config';
import { formatDate } from '@/utils/format';

const PAGE_SIZE = 15;
const FILTERS = [
  { v: '', l: 'All events' }, { v: 'purchase_request.', l: 'Purchase requests' }, { v: 'policy.', l: 'Policy decisions and changes' },
  { v: 'approval.', l: 'Approvals' }, { v: 'payment.', l: 'Payments' }, { v: 'paypal.', l: 'PayPal webhooks' },
];

export default function AuditLogs() {
  const [prefix, setPrefix] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useAsync(() => auditService.list({ action: prefix || undefined, page, page_size: PAGE_SIZE }), [prefix, page]);
  return (
    <>
      <PageHeader title="Audit logs" description="An append-only record of every decision, approval and PayPal step. Who did what, and when." />
      {isDemoMode && <div className="mb-5"><DemoBanner>Demo mode: only actions you take in this browser session are logged.</DemoBanner></div>}
      <Card flush>
        <div className="flex flex-wrap items-center gap-3 border-b border-surface-line p-4">
          <label htmlFor="audit-filter" className="text-sm font-medium">Event type</label>
          <select id="audit-filter" value={prefix} onChange={(e) => { setPrefix(e.target.value); setPage(1); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm">
            {FILTERS.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
          </select>
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : !data ? <TableSkeleton rows={8} />
          : data.items.length === 0 ? <EmptyState title="No audit events" description={prefix ? 'No events of this type yet.' : 'Events appear here as soon as a request is made.'} />
          : (
            <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={loading}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-ink-muted"><tr>{['When', 'Actor', 'Action', 'Entity', 'Detail'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{data.items.map((a) => (
                    <tr key={a.id} className="border-t border-surface-line align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDate(a.created_at)}</td>
                      <td className="px-4 py-3"><span className="font-mono text-xs">{a.actor}</span></td>
                      <td className="whitespace-nowrap px-4 py-3 font-medium">{a.action} <SourceBadge source={a.data_source} /></td>
                      <td className="px-4 py-3 text-xs text-ink-muted">{a.entity_type}{a.entity_id && <span className="block font-mono">{a.entity_id}</span>}</td>
                      <td className="min-w-64 px-4 py-3">{a.detail}</td>
                    </tr>))}</tbody>
                </table>
              </div>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} onPage={setPage} />
            </div>
          )}
      </Card>
    </>
  );
}
