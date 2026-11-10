import { Link } from 'react-router-dom';
import type { AgentChatResponse } from '@/types';
import { formatMoney } from '@/utils/format';
import { ExplanationNote } from './ExplanationNote';
import { PaymentActions } from './PaymentActions';
import { RiskBadge } from './RiskBadge';
import { SourceBadge } from './DemoBadge';
import { StatusBadge } from './StatusBadge';

/** What the shopping agent understood, what the policy engine decided, and what happens next. */
export function AgentResult({ result, onChanged }: { result: AgentChatResponse; onChanged: () => void }) {
  const r = result.purchase_request;
  const decision = r.policy_evaluation?.decision;
  const risk = r.risk_assessment;
  const blocking = (r.policy_evaluation?.violations ?? []).filter((v) => v.severity !== 'info');
  return (
    <div className="mt-4 space-y-4 rounded-xl bg-white p-4 text-ink">
      <p className="break-words text-sm font-medium">{result.reply}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Parsed request <span className="ml-1 normal-case font-medium">({result.parser_source === 'gemini' ? 'understood by Gemini' : 'understood by the rule-based fallback'})</span>
          </p>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Item</dt><dd className="min-w-0 break-words text-right font-medium">{r.item}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Merchant</dt><dd className="min-w-0 break-words text-right font-medium">{r.merchant}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Amount</dt><dd className="min-w-0 break-words text-right font-semibold tabular-nums">{formatMoney(r.amount, r.currency)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-ink-muted">Priority</dt><dd className="min-w-0 break-words text-right">{r.priority}</dd></div>
          </dl>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Policy engine decision</p>
          <div className="flex flex-wrap items-center gap-2">
            {decision && <StatusBadge status={decision} />}
            {risk && <RiskBadge category={risk.category} score={risk.score} />}
            <SourceBadge source={r.data_source} />
          </div>
          {blocking.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm">{blocking.map((v, i) => <li key={`${v.rule}-${i}`}>{v.message}</li>)}</ul>}
        </div>
      </div>
      <ExplanationNote text={risk?.explanation ?? r.ai_explanation} source={risk?.explanation_source} dataSource={r.data_source} />
      {decision === 'auto_approved' && <PaymentActions request={r} onChanged={onChanged} />}
      {decision === 'needs_approval' && <Link to="/approvals" className="inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Open the Approval centre</Link>}
    </div>
  );
}
