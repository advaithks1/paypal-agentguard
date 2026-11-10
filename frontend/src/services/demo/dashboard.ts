import type { DashboardSummary, RiskCategory } from '@/types';
import { formatMoney } from '@/utils/format';
import { delay } from './util';
import { DEMO_AGENTS, DEMO_LIMITS, DEMO_NOW, DEMO_TRANSACTIONS, isBlocked, isPending } from './transactions';

const DAY = 86_400_000;
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function demoDashboardSummary(): Promise<DashboardSummary> {
  await delay(300);
  const tx = DEMO_TRANSACTIONS;
  const blocked = tx.filter(isBlocked);
  const pending = tx.filter(isPending);
  const approved = tx.filter((t) => !isBlocked(t) && !isPending(t));
  const captured = tx.filter((t) => t.payment_status === 'captured' && t.currency === 'USD');
  const last24 = tx.filter((t) => DEMO_NOW - new Date(t.created_at).getTime() < DAY && !isBlocked(t) && t.currency === 'USD');
  const used = last24.reduce((s, t) => s + t.amount, 0);

  const history = Array.from({ length: 14 }, (_, i) => {
    const date = dayKey(DEMO_NOW - (13 - i) * DAY);
    const day = tx.filter((t) => t.created_at.slice(0, 10) === date);
    return {
      date,
      approved: day.filter((t) => !isBlocked(t) && !isPending(t)).length,
      blocked: day.filter(isBlocked).length,
      volume: Math.round(day.filter((t) => t.payment_status === 'captured' && t.currency === 'USD').reduce((s, t) => s + t.amount, 0)),
    };
  });

  const risk_distribution: Record<RiskCategory, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  tx.forEach((t) => { risk_distribution[t.risk_category] += 1; });

  const activity = tx.slice(0, 8).map((t, i) => {
    const agent = DEMO_AGENTS[i % DEMO_AGENTS.length] ?? 'ProcureBot';
    const outcome = t.policy_decision === 'auto_approved' ? 'auto-approved' : t.policy_decision === 'needs_approval' ? 'sent for approval' : 'blocked by policy';
    return { id: t.id, message: `${agent} requested ${formatMoney(t.amount, t.currency)} at ${t.merchant}: ${outcome}`, created_at: t.created_at };
  });

  return {
    total_volume: Math.round(captured.reduce((s, t) => s + t.amount, 0) * 100) / 100,
    currency: 'USD',
    approved_count: approved.length,
    blocked_count: blocked.length,
    pending_count: pending.length,
    high_risk_count: tx.filter((t) => t.risk_category === 'high' || t.risk_category === 'critical').length,
    daily_utilization_pct: Math.min(100, Math.round((used / DEMO_LIMITS.daily) * 100)),
    risk_distribution, history, activity,
    data_source: 'demo',
  };
}
