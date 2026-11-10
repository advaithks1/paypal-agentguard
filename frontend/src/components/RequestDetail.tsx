import { AlertTriangle, Ban, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import type { PolicyViolation, PurchaseRequest } from '@/types';
import { formatDate, formatMoney } from '@/utils/format';
import { SourceBadge } from './DemoBadge';
import { ExplanationNote } from './ExplanationNote';
import { PaymentActions } from './PaymentActions';
import { RiskBadge } from './RiskBadge';
import { StatusBadge } from './StatusBadge';

const SEVERITY_ICON: Record<PolicyViolation['severity'], ReactNode> = {
  blocking: <Ban className="h-4 w-4 shrink-0 text-danger" aria-hidden />,
  warning: <AlertTriangle className="h-4 w-4 shrink-0 text-warn" aria-hidden />,
  info: <Info className="h-4 w-4 shrink-0 text-brand" aria-hidden />,
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</dt><dd className="mt-0.5 break-words text-sm">{children}</dd></div>;
}

/** Policy decision, risk, explanation and payment for one purchase request. Used in drawers and the approval centre. */
export function RequestDetail({ request: r, onChanged, showPayment = true }: { request: PurchaseRequest; onChanged?: () => void; showPayment?: boolean }) {
  const violations = r.policy_evaluation?.violations ?? [];
  const risk = r.risk_assessment;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {r.policy_evaluation && <StatusBadge status={r.policy_evaluation.decision} />}
        <StatusBadge status={r.status} />
        <SourceBadge source={r.data_source} />
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <Field label="Item">{r.item}</Field>
        <Field label="Merchant">{r.merchant}</Field>
        <Field label="Amount"><span className="font-semibold tabular-nums">{formatMoney(r.amount, r.currency)}</span></Field>
        <Field label="Priority">{r.priority}</Field>
        <Field label="Requested by">{r.agent_name ?? 'Manual request'}</Field>
        <Field label="Created">{formatDate(r.created_at)}</Field>
        <Field label="Request ID"><span className="font-mono text-xs">{r.id}</span></Field>
        <Field label="Approval"><StatusBadge status={r.approval_status} /></Field>
      </dl>
      {r.source_prompt && (
        <section>
          <h3 className="mb-1 text-sm font-semibold">Original request text</h3>
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-ink-muted">{r.source_prompt}</p>
          <p className="mt-1 text-[11px] text-ink-muted">Shown as untrusted data. It is never treated as an instruction.</p>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Policy evaluation</h3>
        {violations.length === 0 ? <p className="text-sm text-ink-muted">No policy violations.</p> : (
          <ul className="space-y-2">{violations.map((v, i) => <li key={`${v.rule}-${i}`} className="flex items-start gap-2 text-sm">{SEVERITY_ICON[v.severity]}<span>{v.message}</span></li>)}</ul>
        )}
      </section>
      {risk && (
        <section className="space-y-2">
          <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Risk assessment</h3><RiskBadge category={risk.category} score={risk.score} /></div>
          {risk.factors.length > 0 && (
            <ul className="space-y-1.5">{risk.factors.map((f) => (
              <li key={f.code} className="rounded-lg border border-surface-line px-3 py-2">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">{f.label}</p>{f.weight > 0 && <span className="text-xs font-semibold tabular-nums text-ink-muted">+{f.weight}</span>}</div>
                <p className="text-xs text-ink-muted">{f.detail}</p>
              </li>
            ))}</ul>
          )}
          <ExplanationNote text={risk.explanation ?? r.ai_explanation} source={risk.explanation_source} dataSource={r.data_source} />
        </section>
      )}
      {showPayment && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Payment</h3>
          <PaymentActions request={r} onChanged={onChanged} />
        </section>
      )}
    </div>
  );
}
