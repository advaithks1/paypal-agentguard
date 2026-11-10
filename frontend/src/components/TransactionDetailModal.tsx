import { AlertTriangle, Ban, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { transactionService } from '@/services/transactions';
import type { PolicyViolation, TransactionDetail } from '@/types';
import { formatDate, formatMoney } from '@/utils/format';
import { DemoBanner, PayPalBadge } from './DemoBadge';
import { isDemoMode } from '@/services/config';
import { ExplanationNote } from './ExplanationNote';
import { Modal } from './Modal';
import { RiskBadge } from './RiskBadge';
import { CardSkeleton } from './Skeleton';
import { ErrorState } from './States';
import { StatusBadge } from './StatusBadge';
import { TransactionTimeline } from './TransactionTimeline';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt><dd className="mt-0.5 text-sm">{children}</dd></div>;
}
const SEVERITY_ICON: Record<PolicyViolation['severity'], ReactNode> = {
  blocking: <Ban className="h-4 w-4 text-danger" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4 text-warn" aria-hidden />,
  info: <Info className="h-4 w-4 text-brand" aria-hidden />,
};

function Body({ tx }: { tx: TransactionDetail }) {
  const risk = tx.risk_assessment;
  const violations = tx.policy_evaluation?.violations ?? [];
  return (
    <div className="space-y-6">
      {tx.data_source === 'demo' && (
        <DemoBanner>Demo record: simulated, not a PayPal payment. The risk and policy results below are demonstration values, not backend-generated assessments.</DemoBanner>
      )}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Transaction ID"><span className="font-mono text-xs">{tx.id}</span></Field>
        <Field label="Merchant">{tx.merchant}</Field>
        <Field label="Amount"><span className="font-semibold tabular-nums">{formatMoney(tx.amount, tx.currency)}</span></Field>
        <Field label="Date">{formatDate(tx.created_at)}</Field>
        <Field label="Policy decision"><StatusBadge status={tx.policy_decision} /></Field>
        <Field label="Payment status"><span className="inline-flex flex-wrap items-center gap-1.5"><StatusBadge status={tx.payment_status} /><PayPalBadge source={tx.data_source} /></span></Field>
        <Field label="PayPal order ID">{tx.paypal_order_id ?? <span className="text-ink-muted">None (no PayPal order exists)</span>}</Field>
        <Field label="Merchant trust">{tx.merchant_trust_score !== null ? `${tx.merchant_trust_score}/100` : 'Unknown'}</Field>
      </dl>

      {risk && (
        <section>
          <div className="mb-2 flex items-center gap-2"><h3 className="text-sm font-semibold">Risk assessment</h3><RiskBadge category={risk.category} score={risk.score} /></div>
          <ul className="space-y-2">
            {risk.factors.map((f) => (
              <li key={f.code} className="rounded-lg border border-surface-line px-3 py-2">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{f.label}</p>{f.weight > 0 && <span className="text-xs font-semibold tabular-nums text-ink-muted">+{f.weight}</span>}</div>
                <p className="text-xs text-ink-muted">{f.detail}</p>
              </li>
            ))}
          </ul>
          <div className="mt-2"><ExplanationNote text={risk.explanation} source={risk.explanation_source} dataSource={tx.data_source} /></div>
          {!risk.explanation && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-ink-muted">No explanation text. The factors above come from simple rules, not a trained fraud model.</p>}
        </section>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Policy evaluation</h3>
        {violations.length === 0 ? <p className="text-sm text-ink-muted">No policy violations.</p> : (
          <ul className="space-y-2">{violations.map((v) => (
            <li key={v.rule} className="flex items-start gap-2 text-sm">{SEVERITY_ICON[v.severity]}<span>{v.message}</span></li>
          ))}</ul>
        )}
      </section>

      {isDemoMode ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Timeline</h3>
          <ol className="space-y-2 border-l border-surface-line pl-4">
            {tx.timeline.map((e, i) => (
              <li key={i} className="text-sm"><p className="font-medium">{e.label}</p><p className="text-xs text-ink-muted">{formatDate(e.at)}</p></li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-muted">The live PayPal event timeline needs the real backend (set VITE_DATA_MODE=api).</p>
        </section>
      ) : <TransactionTimeline id={tx.id} />}
    </div>
  );
}

export function TransactionDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, error, loading, reload } = useAsync(() => transactionService.get(id), [id]);
  return (
    <Modal open onClose={onClose} title="Transaction details" size="lg"
      footer={<button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">Close</button>}>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <CardSkeleton lines={6} /> : data ? <Body tx={data} /> : null}
    </Modal>
  );
}
