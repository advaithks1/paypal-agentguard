import { ShieldCheck, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/Card';
import { DemoBanner } from '@/components/DemoBadge';
import { FormField, inputClass } from '@/components/FormField';
import { PageHeader } from '@/components/PageHeader';
import { CardSkeleton } from '@/components/Skeleton';
import { EmptyState, ErrorState } from '@/components/States';
import { useAsync } from '@/hooks/useAsync';
import { useNotifications } from '@/hooks/useNotifications';
import { isDemoMode } from '@/services/config';
import { policyService } from '@/services/policies';
import type { Currency, PolicyCopilotResponse, SpendingPolicy, SpendingPolicyInput } from '@/types';
import { errorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/format';

const CURRENCIES: Currency[] = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'];
const LABELS: Record<string, string> = {
  max_auto_amount: 'Auto-approve up to', max_transaction_amount: 'Maximum per transaction', daily_limit: 'Daily limit',
  manual_approval_threshold: 'Manual approval threshold', allowed_currencies: 'Allowed currencies', approved_merchants: 'Approved merchants',
  restricted_merchants: 'Restricted merchants', duplicate_protection: 'Duplicate protection', duplicate_window_minutes: 'Duplicate window (minutes)',
};
const EXAMPLES = ['Lower the auto-approve limit to $100', 'Block LuxWatchOutlet and allow EUR payments', 'Set the daily limit to $2,000'];

function show(v: unknown): string {
  if (Array.isArray(v)) return v.length === 0 ? 'none' : v.join(', ');
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if (v === null || v === undefined) return 'none';
  return String(v);
}
const toInput = ({ updated_at: _u, ...rest }: SpendingPolicy): SpendingPolicyInput => rest;
const lines = (s: string): string[] => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

/* ---------- PolicyCopilot: proposal -> diff -> explicit confirm ---------- */
function Copilot({ onSaved }: { onSaved: (p: SpendingPolicy) => void }) {
  const { notify } = useNotifications();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<PolicyCopilotResponse | null>(null);

  async function propose(instruction: string) {
    if (instruction.trim().length < 3 || busy) return;
    setBusy(true); setError(null); setProposal(null);
    try { setProposal(await policyService.copilot(instruction.trim())); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  async function confirm() {
    if (!proposal) return;
    setSaving(true);
    try {
      const saved = await policyService.update(toInput(proposal.proposed_policy));
      notify({ tone: 'success', title: 'Policy updated', message: `${proposal.diff.length} change${proposal.diff.length === 1 ? '' : 's'} saved. New requests use it immediately.` });
      setProposal(null); setText('');
      onSaved(saved);
    } catch (e) {
      notify({ tone: 'danger', title: 'Could not save the policy', message: errorMessage(e) });
    } finally { setSaving(false); }
  }

  return (
    <Card title="Policy Copilot" description="Describe a change in plain English. You review a diff and must confirm. Nothing is saved automatically.">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); void propose(text); }}>
        <label htmlFor="copilot-input" className="sr-only">Describe the policy change</label>
        <input id="copilot-input" value={text} onChange={(e) => setText(e.target.value)} maxLength={600} disabled={busy} placeholder="e.g. Lower the auto-approve limit to $100" className={inputClass()} />
        <button type="submit" disabled={busy || text.trim().length < 3} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60"><Wand2 className="h-4 w-4" aria-hidden />{busy ? 'Thinking...' : 'Propose change'}</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => <button key={ex} type="button" disabled={busy} onClick={() => { setText(ex); void propose(ex); }} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-ink-muted hover:bg-slate-200 disabled:opacity-60">{ex}</button>)}
      </div>
      {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {proposal && (
        <div className="mt-4 space-y-3 rounded-lg border border-brand/30 bg-brand-soft/40 p-4">
          <div>
            <p className="text-sm font-semibold">{proposal.summary}</p>
            <p className="text-xs text-ink-muted">{proposal.source === 'gemini' ? 'Proposed by Gemini. Validated by AgentGuard before it is shown.' : 'Proposed by the rule-based fallback (not AI-generated).'}</p>
          </div>
          {proposal.warnings.length > 0 && <ul role="alert" className="list-disc space-y-0.5 rounded-lg bg-amber-50 py-2 pl-7 pr-3 text-sm text-amber-900">{proposal.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
          {proposal.diff.length === 0 ? <p className="text-sm text-ink-muted">No changes were proposed. Try rephrasing.</p> : (
            <div className="overflow-x-auto rounded-lg bg-white">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-ink-muted"><tr><th scope="col" className="px-3 py-2">Setting</th><th scope="col" className="px-3 py-2">Current</th><th scope="col" className="px-3 py-2">Proposed</th></tr></thead>
                <tbody>{proposal.diff.map((d) => (
                  <tr key={d.field} className="border-t border-surface-line">
                    <td className="px-3 py-2 font-medium">{LABELS[d.field] ?? d.field}</td>
                    <td className="px-3 py-2 text-ink-muted line-through decoration-slate-300">{show(d.old)}</td>
                    <td className="px-3 py-2 font-semibold text-brand-dark">{show(d.new)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving || proposal.diff.length === 0} onClick={() => void confirm()} className="inline-flex items-center gap-2 rounded-lg bg-ok px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"><ShieldCheck className="h-4 w-4" aria-hidden />{saving ? 'Saving...' : 'Confirm and save'}</button>
            <button type="button" disabled={saving} onClick={() => setProposal(null)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50">Discard</button>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Manual form ---------- */
type Errs = Partial<Record<'auto' | 'max' | 'daily' | 'threshold' | 'window' | 'currencies' | 'merchants', string>>;

function PolicyForm({ policy, onSaved }: { policy: SpendingPolicy; onSaved: (p: SpendingPolicy) => void }) {
  const { notify } = useNotifications();
  const [auto, setAuto] = useState(String(policy.max_auto_amount));
  const [max, setMax] = useState(String(policy.max_transaction_amount));
  const [daily, setDaily] = useState(String(policy.daily_limit));
  const [threshold, setThreshold] = useState(String(policy.manual_approval_threshold));
  const [currencies, setCurrencies] = useState<Currency[]>(policy.allowed_currencies);
  const [approved, setApproved] = useState(policy.approved_merchants.join('\n'));
  const [restricted, setRestricted] = useState(policy.restricted_merchants.join('\n'));
  const [dup, setDup] = useState(policy.duplicate_protection);
  const [win, setWin] = useState(String(policy.duplicate_window_minutes));
  const [errs, setErrs] = useState<Errs>({});
  const [saving, setSaving] = useState(false);

  function validate(): SpendingPolicyInput | null {
    const e: Errs = {};
    const num = (v: string): number => (v.trim() === '' ? NaN : Number(v));
    const a = num(auto), m = num(max), d = num(daily), t = num(threshold), w = num(win);
    if (!(a >= 0)) e.auto = 'Enter 0 or more.';
    if (!(m > 0)) e.max = 'Enter an amount above 0.';
    if (!(d > 0)) e.daily = 'Enter an amount above 0.';
    if (!(t >= 0)) e.threshold = 'Enter 0 or more.';
    if (!Number.isInteger(w) || w < 1 || w > 1440) e.window = 'Whole minutes, 1 to 1440.';
    if (!e.auto && !e.max && a > m) e.auto = 'Cannot exceed the per-transaction maximum.';
    if (currencies.length === 0) e.currencies = 'Allow at least one currency.';
    const ap = lines(approved), re = lines(restricted);
    if (ap.some((x) => re.some((y) => x.toLowerCase() === y.toLowerCase()))) e.merchants = 'A merchant cannot be both approved and restricted.';
    setErrs(e);
    if (Object.keys(e).length > 0) return null;
    return { max_auto_amount: a, max_transaction_amount: m, daily_limit: d, manual_approval_threshold: t, allowed_currencies: currencies, approved_merchants: ap, restricted_merchants: re, duplicate_protection: dup, duplicate_window_minutes: w };
  }
  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    const body = validate();
    if (!body) return;
    setSaving(true);
    try {
      const saved = await policyService.update(body);
      notify({ tone: 'success', title: 'Policy saved', message: 'New purchase requests are evaluated with these rules.' });
      onSaved(saved);
    } catch (e) {
      notify({ tone: 'danger', title: 'Could not save the policy', message: errorMessage(e) });
    } finally { setSaving(false); }
  }
  const toggle = (c: Currency) => setCurrencies((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));
  const money = (id: string, label: string, v: string, set: (s: string) => void, err?: string, hint?: string) => (
    <FormField label={label} htmlFor={id} error={err} hint={hint}><input id={id} inputMode="decimal" value={v} onChange={(e) => set(e.target.value)} className={inputClass(!!err)} aria-invalid={!!err} /></FormField>
  );

  return (
    <Card title="Spending rules" description={policy.updated_at ? `Last updated ${formatDate(policy.updated_at)}` : 'Default policy, never edited'}>
      <form onSubmit={(e) => void save(e)} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          {money('p-auto', 'Auto-approve up to', auto, setAuto, errs.auto, 'Purchases at or below this need no human.')}
          {money('p-max', 'Maximum per transaction', max, setMax, errs.max, 'Anything above is blocked.')}
          {money('p-daily', 'Daily limit', daily, setDaily, errs.daily, 'Total committed per day.')}
          {money('p-threshold', 'Manual approval threshold', threshold, setThreshold, errs.threshold, 'At or above this always needs approval.')}
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Allowed currencies</legend>
          <div className="flex flex-wrap gap-3">{CURRENCIES.map((c) => <label key={c} className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={currencies.includes(c)} onChange={() => toggle(c)} />{c}</label>)}</div>
          {errs.currencies && <p role="alert" className="mt-1 text-xs font-medium text-danger">{errs.currencies}</p>}
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Approved merchants" htmlFor="p-approved" hint="One per line. Others need approval."><textarea id="p-approved" rows={5} value={approved} onChange={(e) => setApproved(e.target.value)} className={inputClass(!!errs.merchants)} /></FormField>
          <FormField label="Restricted merchants" htmlFor="p-restricted" hint="One per line. Always blocked." error={errs.merchants}><textarea id="p-restricted" rows={5} value={restricted} onChange={(e) => setRestricted(e.target.value)} className={inputClass(!!errs.merchants)} /></FormField>
        </div>
        <div className="grid items-end gap-4 sm:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={dup} onChange={(e) => setDup(e.target.checked)} />Duplicate purchase protection</label>
          <FormField label="Duplicate window (minutes)" htmlFor="p-win" error={errs.window}><input id="p-win" inputMode="numeric" value={win} onChange={(e) => setWin(e.target.value)} disabled={!dup} className={inputClass(!!errs.window)} /></FormField>
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{saving ? 'Saving...' : 'Save policy'}</button>
      </form>
    </Card>
  );
}

export default function Policies() {
  const policy = useAsync(() => policyService.get(), []);
  return (
    <>
      <PageHeader title="Spending policies" description="Deterministic rules decide every purchase. AI can propose changes and explain results, but it can never override a rule." />
      {isDemoMode && <div className="mb-5"><DemoBanner>Demo mode: the policy lives in your browser session and the Copilot needs the real backend.</DemoBanner></div>}
      {policy.error ? <Card><ErrorState message={policy.error} onRetry={policy.reload} /></Card>
        : !policy.data ? <div className="space-y-5"><CardSkeleton lines={3} /><CardSkeleton lines={8} /></div>
        : policy.data.allowed_currencies.length === 0 ? <Card><EmptyState title="No policy found" /></Card>
        : (
          <div className="space-y-5">
            <Copilot onSaved={() => policy.reload()} />
            <PolicyForm key={policy.data.updated_at ?? 'initial'} policy={policy.data} onSaved={() => policy.reload()} />
          </div>
        )}
    </>
  );
}
