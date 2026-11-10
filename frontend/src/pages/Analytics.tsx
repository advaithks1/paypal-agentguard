import { Activity, CheckCircle2, Gauge, Wallet } from 'lucide-react';
import { useMemo } from 'react';
import { Card } from '@/components/Card';
import { BarList, type BarItem } from '@/components/charts/BarList';
import { ChartCard } from '@/components/charts/ChartCard';
import { HistoryBarChart } from '@/components/charts/HistoryBarChart';
import { DemoBanner } from '@/components/DemoBadge';
import { MetricCard } from '@/components/MetricCard';
import { PageHeader } from '@/components/PageHeader';
import { CardSkeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/States';
import { useAsync } from '@/hooks/useAsync';
import { isDemoMode } from '@/services/config';
import { dashboardService } from '@/services/dashboard';
import { purchaseRequestService } from '@/services/purchaseRequests';
import { formatMoney } from '@/utils/format';

const DECISION_LABEL = { auto_approved: 'Auto-approved', needs_approval: 'Needs approval', blocked: 'Blocked' } as const;

export default function Analytics() {
  const summary = useAsync(() => dashboardService.getSummary(), []);
  const reqs = useAsync(() => purchaseRequestService.list({ page: 1, page_size: 100 }), []);
  const stats = useMemo(() => {
    const items = reqs.data?.items ?? [];
    const decisions: Record<string, number> = {}, byMerchant = new Map<string, number>();
    let riskSum = 0, riskN = 0;
    for (const r of items) {
      const d = r.policy_evaluation?.decision;
      if (d) decisions[d] = (decisions[d] ?? 0) + 1;
      if (r.risk_assessment) { riskSum += r.risk_assessment.score; riskN++; }
      if (d !== 'blocked' && r.status !== 'rejected' && r.currency === 'USD') byMerchant.set(r.merchant, (byMerchant.get(r.merchant) ?? 0) + r.amount);
    }
    const decisionBars: BarItem[] = (Object.keys(DECISION_LABEL) as (keyof typeof DECISION_LABEL)[]).map((k) => ({ label: DECISION_LABEL[k], value: decisions[k] ?? 0 }));
    const merchantBars: BarItem[] = [...byMerchant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value, display: formatMoney(value, 'USD') }));
    const total = items.length;
    const allowed = total - (decisions.blocked ?? 0);
    return { total, decisionBars, merchantBars, avgRisk: riskN ? Math.round(riskSum / riskN) : 0, autoRate: total ? Math.round(((decisions.auto_approved ?? 0) / total) * 100) : 0, allowed };
  }, [reqs.data]);
  const s = summary.data;

  return (
    <>
      <PageHeader title="Analytics" description="Spend, decisions and trends across your agents' purchase requests." />
      {isDemoMode && <div className="mb-5"><DemoBanner>Demo mode: charts use simulated data.</DemoBanner></div>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Captured volume" icon={Wallet} loading={!s} value={s ? formatMoney(s.total_volume, s.currency) : ''} hint="USD, paid through PayPal" source={s?.data_source} />
        <MetricCard label="Requests analysed" icon={Activity} loading={!reqs.data} value={String(stats.total)} hint="Latest 100" />
        <MetricCard label="Auto-approval rate" icon={CheckCircle2} tone="success" loading={!reqs.data} value={`${stats.autoRate}%`} hint="No human needed" />
        <MetricCard label="Average risk score" icon={Gauge} tone="warning" loading={!reqs.data} value={`${stats.avgRisk}/100`} hint="Across analysed requests" />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {summary.error ? <Card><ErrorState message={summary.error} onRetry={summary.reload} /></Card>
          : <ChartCard title="Decisions per day" description="Last 14 days" source={s?.data_source}>{s ? <HistoryBarChart data={s.history} /> : <CardSkeleton lines={5} />}</ChartCard>}
        <Card title="Decision breakdown">
          {reqs.error ? <ErrorState message={reqs.error} onRetry={reqs.reload} /> : !reqs.data ? <CardSkeleton lines={4} /> : stats.total === 0 ? <EmptyState title="No requests yet" description="Run the demo scenario on the Purchase requests page." /> : <BarList items={stats.decisionBars} />}
        </Card>
      </div>
      <Card className="mt-5" title="Spend by merchant" description="USD requested at merchants that were not blocked or rejected">
        {!reqs.data ? <CardSkeleton lines={5} /> : stats.merchantBars.length === 0 ? <EmptyState title="No spend yet" /> : <BarList items={stats.merchantBars} />}
      </Card>
    </>
  );
}
