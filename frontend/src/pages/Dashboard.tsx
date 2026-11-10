import { Ban, CheckCircle2, Clock, ShieldAlert, Wallet } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/Card';
import { DemoBadge, DemoBanner } from '@/components/DemoBadge';
import { HistoryBarChart } from '@/components/charts/HistoryBarChart';
import { RiskDonut } from '@/components/charts/RiskDonut';
import { UtilizationMeter } from '@/components/charts/UtilizationMeter';
import { MetricCard } from '@/components/MetricCard';
import { PageHeader } from '@/components/PageHeader';
import { CardSkeleton, TableSkeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/States';
import { TransactionDetailModal } from '@/components/TransactionDetailModal';
import { TransactionTable } from '@/components/TransactionTable';
import { useAsync } from '@/hooks/useAsync';
import { isDemoMode } from '@/services/config';
import { dashboardService } from '@/services/dashboard';
import { transactionService } from '@/services/transactions';
import { formatMoney, timeAgo } from '@/utils/format';

export default function Dashboard() {
  const summary = useAsync(() => dashboardService.getSummary(), []);
  const recent = useAsync(() => transactionService.list({ page: 1, page_size: 6, sort_by: 'created_at', sort_dir: 'desc' }), []);
  const [selected, setSelected] = useState<string | null>(null);
  const closeDetail = useCallback(() => setSelected(null), []);
  const s = summary.data;

  return (
    <>
      <PageHeader title="Dashboard" description="Overview of what your AI purchasing agents are requesting and how AgentGuard is handling it."
        actions={<Link to="/purchase-requests" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Ask the shopping agent</Link>} />
      {isDemoMode && <div className="mb-5"><DemoBanner>Demo data: every figure here is simulated in your browser. None of it is a real PayPal payment.</DemoBanner></div>}

      {summary.error ? (
        <Card><ErrorState message={summary.error} onRetry={summary.reload} /></Card>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Transaction volume" icon={Wallet} loading={!s} value={s ? formatMoney(s.total_volume, s.currency) : ''} hint={isDemoMode ? 'Captured, USD only' : 'Captured via PayPal, USD only'} source={s?.data_source} />
            <MetricCard label="Approved" icon={CheckCircle2} tone="success" loading={!s} value={String(s?.approved_count ?? '')} hint="Allowed to proceed" />
            <MetricCard label="Blocked" icon={Ban} tone="danger" loading={!s} value={String(s?.blocked_count ?? '')} hint="Stopped by policy" />
            <MetricCard label="Pending approvals" icon={Clock} tone="warning" loading={!s} value={String(s?.pending_count ?? '')} hint="Awaiting a human" />
            <MetricCard label="High-risk" icon={ShieldAlert} tone="danger" loading={!s} value={String(s?.high_risk_count ?? '')} hint="High or critical score" />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Transaction history" description="Last 14 days" className="lg:col-span-2" action={s && <DemoBadge source={s.data_source} />}>
              <div className="h-64">{s ? <HistoryBarChart data={s.history} /> : <CardSkeleton lines={5} />}</div>
            </Card>
            <Card title="Risk distribution" action={s && <DemoBadge source={s.data_source} />}>
              {s ? <RiskDonut distribution={s.risk_distribution} /> : <CardSkeleton lines={5} />}
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Recent transactions" className="lg:col-span-2" flush
              action={<Link to="/transactions" className="text-xs font-medium text-brand hover:underline">View all</Link>}>
              {recent.error ? <ErrorState message={recent.error} onRetry={recent.reload} />
                : !recent.data ? <TableSkeleton rows={6} />
                : recent.data.items.length === 0 ? <EmptyState title="No transactions yet" description="Purchase requests from your agents will appear here." />
                : <TransactionTable compact rows={recent.data.items} onSelect={(t) => setSelected(t.id)} />}
            </Card>
            <div className="space-y-5">
              <Card title="Daily spending utilization" description="Share of your daily limit used in the last 24 hours">
                {s ? <UtilizationMeter percent={s.daily_utilization_pct} label={isDemoMode ? 'of daily limit (simulated)' : 'of daily limit'} /> : <CardSkeleton lines={2} />}
              </Card>
              <Card title="Activity feed" description={isDemoMode ? 'Simulated activity.' : 'Latest events from your agents, approvals and PayPal.'}
                action={s && (isDemoMode ? <DemoBadge source={s.data_source} /> : <Link to="/audit-logs" className="text-xs font-medium text-brand hover:underline">Audit log</Link>)}>
                {!s ? <CardSkeleton lines={4} /> : s.activity.length === 0 ? <EmptyState title="No agent activity yet" description="Ask the shopping agent for something to buy." /> : (
                  <ul className="space-y-3">
                    {s.activity.slice(0, 6).map((a) => (
                      <li key={a.id} className="text-sm"><p>{a.message}</p><p className="text-xs text-ink-muted">{timeAgo(a.created_at)}</p></li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
      {selected && <TransactionDetailModal id={selected} onClose={closeDetail} />}
    </>
  );
}
