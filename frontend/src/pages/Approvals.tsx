import { Check, X } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Card } from '@/components/Card';
import { DemoBanner, SourceBadge } from '@/components/DemoBadge';
import { Drawer } from '@/components/Drawer';
import { ExplanationNote } from '@/components/ExplanationNote';
import { PageHeader } from '@/components/PageHeader';
import { PaymentActions } from '@/components/PaymentActions';
import { RequestDetail } from '@/components/RequestDetail';
import { RiskBadge } from '@/components/RiskBadge';
import { CardSkeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { inputClass } from '@/components/FormField';
import { useAsync } from '@/hooks/useAsync';
import { useNotifications } from '@/hooks/useNotifications';
import { approvalService } from '@/services/approvals';
import { isDemoMode } from '@/services/config';
import type { Approval, ApprovalDecision, ApprovalStatus } from '@/types';
import { errorMessage } from '@/utils/errors';
import { formatDate, formatMoney } from '@/utils/format';

type Tab = 'pending' | 'approved' | 'rejected' | 'all';
const TABS: { v: Tab; l: string }[] = [{ v: 'pending', l: 'Pending' }, { v: 'approved', l: 'Approved' }, { v: 'rejected', l: 'Rejected' }, { v: 'all', l: 'All' }];

function ApprovalCard({ a, onDecided, onDetails }: { a: Approval; onDecided: (d?: ApprovalDecision) => void; onDetails: (a: Approval) => void }) {
  const { notify } = useNotifications();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<ApprovalDecision | null>(null);
  const r = a.purchase_request;
  const warnings = (r.policy_evaluation?.violations ?? []).filter((v) => v.severity !== 'info');

  async function decide(decision: ApprovalDecision) {
    setBusy(decision);
    try {
      await approvalService.decide(a.id, decision, note.trim() || undefined);
      notify(decision === 'approved'
        ? { tone: 'success', title: 'Approved', message: isDemoMode ? `${r.item} approved.` : 'You can now pay with PayPal.' }
        : { tone: 'info', title: 'Rejected', message: `${r.item} will not be paid. Any funds PayPal was holding are released automatically.` });
      onDecided(decision);
    } catch (e) {
      notify({ tone: 'danger', title: 'Could not save your decision', message: errorMessage(e) });
      setBusy(null);
    }
  }

  return (
    <li className="rounded-card border border-surface-line bg-surface-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold">{r.item}</p>
          <p className="break-words text-sm text-ink-muted">{r.merchant} · requested by {r.agent_name ?? 'a user'} · {formatDate(r.created_at)}</p>
        </div>
        <p className="shrink-0 text-xl font-semibold tabular-nums">{formatMoney(r.amount, r.currency)}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge status={a.status} />
        {r.risk_assessment && <RiskBadge category={r.risk_assessment.category} score={r.risk_assessment.score} />}
        <SourceBadge source={r.data_source} />
        <button type="button" onClick={() => onDetails(a)} className="ml-auto text-xs font-medium text-brand hover:underline">Full details</button>
      </div>
      {warnings.length > 0 && <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm">{warnings.map((v, i) => <li key={`${v.rule}-${i}`}>{v.message}</li>)}</ul>}
      <div className="mt-3"><ExplanationNote text={r.risk_assessment?.explanation ?? r.ai_explanation} source={r.risk_assessment?.explanation_source} dataSource={r.data_source} /></div>

      {a.status === 'pending' && (
        <div className="mt-4 space-y-3 border-t border-surface-line pt-4">
          <PaymentActions request={r} />
          <div>
            <label htmlFor={`note-${a.id}`} className="mb-1 block text-sm font-medium">Decision note <span className="font-normal text-ink-muted">(optional)</span></label>
            <textarea id={`note-${a.id}`} rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy !== null} className={inputClass()} placeholder="Why are you approving or rejecting this?" />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => void decide('approved')} className="inline-flex items-center gap-2 rounded-lg bg-ok px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"><Check className="h-4 w-4" aria-hidden />{busy === 'approved' ? 'Approving...' : 'Approve'}</button>
            <button type="button" disabled={busy !== null} onClick={() => void decide('rejected')} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-danger hover:bg-red-50 disabled:opacity-60"><X className="h-4 w-4" aria-hidden />{busy === 'rejected' ? 'Rejecting...' : 'Reject'}</button>
          </div>
        </div>
      )}
      {a.status !== 'pending' && (
        <div className="mt-4 space-y-3 border-t border-surface-line pt-4">
          <p className="text-sm text-ink-muted">{a.status === 'approved' ? 'Approved' : 'Rejected'} {a.decided_at ? formatDate(a.decided_at) : ''}{a.decision_note ? ` · "${a.decision_note}"` : ''}</p>
          {a.status === 'approved' && <PaymentActions request={r} onChanged={() => onDecided()} />}
        </div>
      )}
    </li>
  );
}

export default function Approvals() {
  const [tab, setTab] = useState<Tab>('pending');
  const [detail, setDetail] = useState<Approval | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);
  const list = useAsync(() => approvalService.list(tab === 'all' ? undefined : (tab as ApprovalStatus)), [tab]);

  return (
    <>
      <PageHeader title="Approval centre" description="Purchases that exceeded an auto-approval rule wait here. Nothing reaches PayPal until a human approves it." />
      {isDemoMode && <div className="mb-5"><DemoBanner>Demo mode: approvals are simulated in your browser. PayPal checkout needs the real backend.</DemoBanner></div>}
      <div role="tablist" aria-label="Approval status" className="mb-4 flex gap-1 rounded-lg bg-slate-100 p-1 sm:w-fit">
        {TABS.map((t) => (
          <button key={t.v} role="tab" type="button" aria-selected={tab === t.v} onClick={() => setTab(t.v)}
            className={`flex-1 rounded-md px-4 py-1.5 text-sm font-medium sm:flex-none ${tab === t.v ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}>{t.l}</button>
        ))}
      </div>
      {list.error ? <Card><ErrorState message={list.error} onRetry={list.reload} /></Card>
        : !list.data ? <div className="space-y-4"><CardSkeleton lines={4} /><CardSkeleton lines={4} /></div>
        : list.data.length === 0 ? <Card><EmptyState title={tab === 'pending' ? 'Nothing is waiting for you' : 'No approvals here'} description={tab === 'pending' ? 'When the policy engine flags a purchase for review it will appear here. Try the demo scenario on the Purchase requests page.' : 'Nothing matches this filter.'} /></Card>
        : <ul className={`space-y-4 ${list.loading ? 'opacity-60' : ''}`} aria-busy={list.loading}>{list.data.map((a) => <ApprovalCard key={a.id} a={a} onDecided={(d) => { if (d === 'approved' && tab === 'pending') setTab('approved'); else list.reload(); }} onDetails={setDetail} />)}</ul>}
      <Drawer open={detail !== null} onClose={closeDetail} title="Purchase request">
        {detail && <RequestDetail key={detail.id} request={detail.purchase_request} showPayment={false} />}
      </Drawer>
    </>
  );
}
