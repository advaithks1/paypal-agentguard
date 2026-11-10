import { useCallback, useMemo, useState } from 'react';
import { Card } from '@/components/Card';
import { BarList, type BarItem } from '@/components/charts/BarList';
import { RiskDonut } from '@/components/charts/RiskDonut';
import { DemoBadge, DemoBanner } from '@/components/DemoBadge';
import { PageHeader } from '@/components/PageHeader';
import { CardSkeleton, TableSkeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/States';
import { TransactionDetailModal } from '@/components/TransactionDetailModal';
import { TransactionTable } from '@/components/TransactionTable';
import { useAsync } from '@/hooks/useAsync';
import { isDemoMode } from '@/services/config';
import { dashboardService } from '@/services/dashboard';
import { purchaseRequestService } from '@/services/purchaseRequests';
import { transactionService } from '@/services/transactions';

function tally(map: Map<string, number>, key: string, by = 1) { map.set(key, (map.get(key) ?? 0) + by); }
const top = (m: Map<string, number>, n = 6): BarItem[] => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([label, value]) => ({ label, value }));

export default function Risk() {
  const summary = useAsync(() => dashboardService.getSummary(), []);
  const risky = useAsync(() => transactionService.list({ sort_by: 'risk_score', sort_dir: 'desc', page: 1, page_size: 8 }), []);
  const reqs = useAsync(() => purchaseRequestService.list({ page: 1, page_size: 100 }), []);
  const [selected, setSelected] = useState<string | null>(null);
  const close = useCallback(() => setSelected(null), []);

  const insight = useMemo(() => {
    const factors = new Map<string, number>(), rules = new Map<string, number>(), who = new Map<string, number>();
    for (const r of reqs.data?.items ?? []) {
      for (const f of r.risk_assessment?.factors ?? []) if (f.weight > 0) tally(factors, f.label);
      for (const v of r.policy_evaluation?.violations ?? []) if (v.severity !== 'info') tally(rules, v.rule.replace(/_/g, ' '));
      const src = r.risk_assessment?.explanation_source;
      if (r.risk_assessment) tally(who, src === 'gemini' ? 'Gemini' : r.data_source === 'demo' ? 'Simulated (demo)' : 'Rule-based');
    }
    return { factors: top(factors), rules: top(rules), who: top(who, 3) };
  }, [reqs.data]);

  return (
    <>
      <PageHeader title="Risk intelligence" description="How risky are your agents' purchases, and why? Scores come from transparent rules, not a trained fraud model." />
      {isDemoMode && <div className="mb-5"><DemoBanner>Demo mode: scores and factors are simulated.</DemoBanner></div>}
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Risk distribution" action={summary.data && <DemoBadge source={summary.data.data_source} />}>
          {summary.error ? <ErrorState message={summary.error} onRetry={summary.reload} /> : summary.data ? <RiskDonut distribution={summary.data.risk_distribution} /> : <CardSkeleton lines={5} />}
        </Card>
        <Card title="What drives risk" description="Risk factors that added to a score, across your latest 100 requests" className="lg:col-span-2">
          {reqs.error ? <ErrorState message={reqs.error} onRetry={reqs.reload} /> : !reqs.data ? <CardSkeleton lines={5} />
            : insight.factors.length === 0 ? <EmptyState title="No risk factors yet" description="Make a purchase request or run the demo scenario to see what drives risk." /> : <BarList items={insight.factors} color="bg-orange-500" />}
        </Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card title="Policy rules triggered" description="Warnings and blocks, latest 100 requests">
          {!reqs.data ? <CardSkeleton lines={4} /> : insight.rules.length === 0 ? <EmptyState title="No rules triggered" /> : <BarList items={insight.rules} color="bg-danger" />}
        </Card>
        <Card title="Who wrote the explanations" description="Policy rules decide. Explanation text comes from Gemini when configured, otherwise rules.">
          {!reqs.data ? <CardSkeleton lines={3} /> : insight.who.length === 0 ? <EmptyState title="Nothing to show yet" /> : <BarList items={insight.who} color="bg-brand" />}
        </Card>
      </div>
      <Card className="mt-5" flush title="Highest-risk transactions">
        {risky.error ? <ErrorState message={risky.error} onRetry={risky.reload} /> : !risky.data ? <TableSkeleton rows={5} />
          : risky.data.items.length === 0 ? <EmptyState title="No transactions yet" /> : <TransactionTable rows={risky.data.items} onSelect={(t) => setSelected(t.id)} />}
      </Card>
      {selected && <TransactionDetailModal id={selected} onClose={close} />}
    </>
  );
}
