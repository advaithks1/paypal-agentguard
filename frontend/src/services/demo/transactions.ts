import type {
  Currency, Paginated, PaymentStatus, PolicyDecision, PolicyViolation, RiskCategory, RiskFactor,
  Transaction, TransactionDetail, TransactionQuery,
} from '@/types';
import { formatMoney } from '@/utils/format';
import { delay } from './util';
import { DEMO_MERCHANTS } from './merchants';

/**
 * DEMO DATA ONLY. Generated in the browser with a seeded generator.
 * These are NOT PayPal payments: paypal_order_id is always null and data_source is 'demo'.
 */
export const DEMO_LIMITS = { maxAuto: 500, maxTransaction: 5000, daily: 3000 } as const;
export const DEMO_AGENTS = ['ProcureBot', 'OpsAssistant', 'TravelAgent'] as const;

const DAY = 86_400_000;
export const DEMO_NOW = Date.now();

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPICAL: Record<string, [number, number]> = {
  'm-aws': [80, 900], 'm-notion': [20, 160], 'm-figma': [15, 150], 'm-do': [40, 400], 'm-staples': [25, 350],
  'm-gws': [60, 600], 'm-zoom': [15, 120], 'm-canva': [12, 100], 'm-abiz': [40, 900],
  'm-nova': [30, 420], 'm-gift': [100, 800], 'm-lux': [900, 6500],
};

export function riskCategoryFor(score: number): RiskCategory {
  if (score < 30) return 'low';
  if (score < 60) return 'medium';
  if (score < 80) return 'high';
  return 'critical';
}

function generate(): Transaction[] {
  const rand = mulberry32(20260801);
  const out: Transaction[] = [];
  for (let i = 0; i < 80; i++) {
    const m = DEMO_MERCHANTS[Math.floor(rand() * DEMO_MERCHANTS.length)] ?? DEMO_MERCHANTS[0]!;
    const [lo, hi] = TYPICAL[m.id] ?? [20, 200];
    const daysAgo = i < 7 ? 0 : Math.floor(rand() * 30);
    const created = new Date(DEMO_NOW - daysAgo * DAY - rand() * DAY * 0.8);
    let amount = lo + rand() * (hi - lo);
    if (rand() < 0.1) amount *= 4 + rand() * 4;
    amount = Math.round(amount * 100) / 100;
    const cr = rand();
    const currency: Currency = cr < 0.88 ? 'USD' : cr < 0.95 ? 'EUR' : 'GBP';

    const amountFactor = amount > 2000 ? 35 : amount > 1000 ? 25 : amount > 500 ? 15 : amount > 200 ? 6 : 0;
    const score = Math.min(99, Math.max(2, Math.round((100 - m.trust_score) * 0.5 + amountFactor + (m.status === 'restricted' ? 30 : 0) + rand() * 10)));

    let decision: PolicyDecision;
    if (m.status === 'restricted' || amount > DEMO_LIMITS.maxTransaction || score >= 85) decision = 'blocked';
    else if (amount > DEMO_LIMITS.maxAuto || score >= 50) decision = 'needs_approval';
    else decision = 'auto_approved';

    const r = rand();
    let payment: PaymentStatus = 'not_started';
    if (decision === 'auto_approved') payment = r < 0.8 ? 'captured' : r < 0.88 ? 'order_created' : r < 0.94 ? 'failed' : 'refunded';
    else if (decision === 'needs_approval' && daysAgo > 2) payment = r < 0.7 ? 'captured' : 'voided';

    out.push({
      id: `TXN-DEMO-${String(i + 1).padStart(4, '0')}`,
      purchase_request_id: null,
      merchant: m.name,
      amount, currency,
      risk_score: score,
      risk_category: riskCategoryFor(score),
      policy_decision: decision,
      payment_status: payment,
      paypal_order_id: null,
      created_at: created.toISOString(),
      data_source: 'demo',
    });
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export const DEMO_TRANSACTIONS: Transaction[] = generate();

export const isPending = (t: Transaction): boolean => t.policy_decision === 'needs_approval' && t.payment_status === 'not_started';
export const isBlocked = (t: Transaction): boolean => t.policy_decision === 'blocked';

export async function demoListTransactions(q: TransactionQuery): Promise<Paginated<Transaction>> {
  await delay(250);
  const term = q.search?.trim().toLowerCase() ?? '';
  let rows = DEMO_TRANSACTIONS.filter((t) =>
    (!term || t.id.toLowerCase().includes(term) || t.merchant.toLowerCase().includes(term)) &&
    (!q.policy_decision || t.policy_decision === q.policy_decision) &&
    (!q.payment_status || t.payment_status === q.payment_status) &&
    (!q.risk_category || t.risk_category === q.risk_category));

  const key = q.sort_by ?? 'created_at';
  const dir = q.sort_dir === 'asc' ? 1 : -1;
  rows = [...rows].sort((a, b) => {
    const cmp = key === 'merchant' ? a.merchant.localeCompare(b.merchant)
      : key === 'created_at' ? a.created_at.localeCompare(b.created_at)
      : a[key] - b[key];
    return cmp * dir;
  });

  const page_size = q.page_size ?? 10;
  const page = Math.max(1, q.page ?? 1);
  return { items: rows.slice((page - 1) * page_size, page * page_size), total: rows.length, page, page_size };
}

export async function demoGetTransaction(id: string): Promise<TransactionDetail> {
  await delay(200);
  const t = DEMO_TRANSACTIONS.find((x) => x.id === id);
  if (!t) throw new Error(`Transaction ${id} was not found.`);
  const merchant = DEMO_MERCHANTS.find((m) => m.name === t.merchant);
  const trust = merchant?.trust_score ?? null;

  const factors: RiskFactor[] = [];
  if (merchant?.status === 'restricted') factors.push({ code: 'restricted_merchant', label: 'Restricted merchant', weight: 30, detail: `${t.merchant} is on the restricted merchant list.` });
  if (trust !== null && trust < 60) factors.push({ code: 'low_merchant_trust', label: 'Low merchant trust', weight: Math.round((100 - trust) * 0.5), detail: `Merchant trust score is ${trust}/100.` });
  if (t.amount > DEMO_LIMITS.maxAuto) factors.push({ code: 'large_amount', label: 'Amount above automatic limit', weight: t.amount > 2000 ? 35 : t.amount > 1000 ? 25 : 15, detail: `${formatMoney(t.amount, t.currency)} exceeds the ${formatMoney(DEMO_LIMITS.maxAuto)} automatic purchase limit.` });
  if (factors.length === 0) factors.push({ code: 'none', label: 'No notable risk factors', weight: 0, detail: 'Amount and merchant are within normal ranges.' });

  const violations: PolicyViolation[] = [];
  if (merchant?.status === 'restricted') violations.push({ rule: 'restricted_merchant', message: 'Merchant is restricted by your spending policy.', severity: 'blocking' });
  if (t.amount > DEMO_LIMITS.maxTransaction) violations.push({ rule: 'max_transaction_amount', message: `Amount exceeds the ${formatMoney(DEMO_LIMITS.maxTransaction)} maximum transaction limit.`, severity: 'blocking' });
  if (t.policy_decision === 'needs_approval') violations.push({ rule: 'manual_approval_threshold', message: 'Request needs manual approval before payment.', severity: 'warning' });

  const at = (mins: number) => new Date(new Date(t.created_at).getTime() + mins * 60_000).toISOString();
  const timeline = [{ label: 'Purchase request submitted', at: t.created_at }, { label: `Policy evaluated: ${t.policy_decision.replace('_', ' ')}`, at: at(1) }, { label: 'Risk assessed (demo rules)', at: at(1) }];
  if (t.payment_status !== 'not_started') timeline.push({ label: `Simulated payment status: ${t.payment_status.replace('_', ' ')}`, at: at(6) });

  return {
    ...t,
    merchant_trust_score: trust,
    policy_evaluation: { decision: t.policy_decision, violations, evaluated_at: at(1), source: 'demo' },
    risk_assessment: { score: t.risk_score, category: t.risk_category, factors, explanation: null, source: 'demo', generated_at: at(1) },
    timeline,
  };
}
