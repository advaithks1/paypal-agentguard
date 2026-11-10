import { Bot, ExternalLink, ShieldOff, Wallet } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/Card';
import { PayPalBadge } from '@/components/DemoBadge';
import { inputClass } from '@/components/FormField';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { useAsync } from '@/hooks/useAsync';
import { useNotifications } from '@/hooks/useNotifications';
import { isDemoMode } from '@/services/config';
import { walletService } from '@/services/wallet';
import type { AgentWallet as WalletT } from '@/types';
import { errorMessage } from '@/utils/errors';
import { formatDate, formatMoney } from '@/utils/format';

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60';

export default function AgentWallet() {
  const { notify } = useNotifications();
  const wallet = useAsync(() => walletService.get(), []);
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const w = wallet.data;

  async function connect() {
    setBusy(true);
    try {
      const { approval_url: url } = await walletService.connect();
      if (!url.startsWith('https://')) throw new Error('PayPal did not return a safe approval link.');
      window.location.assign(url);
    } catch (e) {
      notify({ tone: 'danger', title: 'Could not connect PayPal', message: errorMessage(e) });
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      await walletService.revoke();
      notify({ tone: 'success', title: 'Agent access revoked', message: 'The PayPal vault token was deleted. Agents can no longer charge without a human.' });
      setConfirmRevoke(false);
      wallet.reload();
    } catch (e) {
      notify({ tone: 'danger', title: 'Could not revoke', message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader title="Agent wallet" description="Let AI agents pay without a PayPal redirect, but only inside the limits you set. Over a limit, the request goes to the Approval centre instead." />
      {wallet.loading && !w && <p className="text-sm text-ink-muted">Loading wallet...</p>}
      {wallet.error && <Card><ErrorState title={isDemoMode ? 'Needs the real backend' : 'Could not load the wallet'} message={isDemoMode ? 'The agent wallet uses PayPal Vault, so it is disabled in demo mode (set VITE_DATA_MODE=api).' : wallet.error} onRetry={isDemoMode ? undefined : wallet.reload} /></Card>}
      {w && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="PayPal connection" action={<PayPalBadge source={w.data_source} />}>
            <div className="space-y-3 p-5 text-sm">
              <p className="flex items-center gap-2"><Wallet className="h-4 w-4 text-brand" aria-hidden />Status: <strong>{w.status === 'active' ? 'Connected' : w.status === 'revoked' ? 'Revoked' : w.status === 'pending' ? 'Waiting for PayPal consent' : 'Not connected'}</strong></p>
              {w.status === 'active' ? (
                <>
                  <p className="text-ink-muted">Connected {w.connected_at ? formatDate(w.connected_at) : ''}. Only a PayPal vault id is stored, never your credentials.</p>
                  <button type="button" disabled={busy} onClick={() => setConfirmRevoke(true)} className={`${btn} border border-red-200 bg-white text-danger hover:bg-red-50`}><ShieldOff className="h-4 w-4" aria-hidden />Revoke agent access</button>
                </>
              ) : (
                <>
                  <p className="text-ink-muted">One-time consent in PayPal Sandbox. After that, auto-approved purchases inside your limits are charged with no redirect.</p>
                  <button type="button" disabled={busy} onClick={() => void connect()} className={`${btn} bg-[#0070e0] text-white hover:bg-[#003087]`}><ExternalLink className="h-4 w-4" aria-hidden />{busy ? 'Contacting PayPal...' : 'Connect PayPal for agent spending'}</button>
                  <p className="text-xs text-ink-muted">If PayPal says Vault is not enabled, open developer.paypal.com, Apps &amp; Credentials, select your sandbox app and turn on the Vault feature.</p>
                </>
              )}
            </div>
          </Card>

          <Card title="Daily budget">
            <div className="p-5">
              <p className="text-3xl font-semibold tabular-nums">{formatMoney(w.budget.remaining_today, w.budget.currency)}</p>
              <p className="text-xs text-ink-muted">left today of {formatMoney(w.budget.daily_cap, w.budget.currency)} ({formatMoney(w.budget.spent_today, w.budget.currency)} spent by agents)</p>
              <div role="progressbar" aria-label="Daily agent budget used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w.budget.daily_cap ? (w.budget.spent_today / w.budget.daily_cap) * 100 : 0)} className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${Math.min(100, w.budget.daily_cap ? (w.budget.spent_today / w.budget.daily_cap) * 100 : 0)}%` }} />
              </div>
            </div>
          </Card>

          <GuardrailForm w={w} onSaved={wallet.reload} />

          <Card title="Recent autonomous charges" description="Paid by an agent through PayPal Vault.">
            {w.recent_charges.length === 0 ? <p className="p-5 text-sm text-ink-muted">No autonomous charges yet. Ask the shopping agent: <em>&ldquo;Buy a USB-C cable from Amazon for $25 using my agent wallet&rdquo;</em> on <Link to="/purchase-requests" className="text-brand hover:underline">Purchase requests</Link>.</p> : (
              <ul className="divide-y divide-surface-line">
                {w.recent_charges.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{c.item} <span className="font-normal text-ink-muted">at {c.merchant}</span></p>
                      <p className="mt-0.5 inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700"><Bot className="h-3 w-3" aria-hidden />Charged by agent, no human click</p>
                    </div>
                    <div className="text-right"><p className="tabular-nums font-semibold">{formatMoney(c.amount, c.currency)}</p><StatusBadge status={c.status} /></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      <Modal open={confirmRevoke} onClose={() => (busy ? undefined : setConfirmRevoke(false))} title="Revoke agent access?"
        footer={<>
          <button type="button" disabled={busy} onClick={() => setConfirmRevoke(false)} className={`${btn} border border-slate-300 hover:bg-slate-50`}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => void revoke()} className={`${btn} bg-danger text-white hover:opacity-90`}>{busy ? 'Revoking...' : 'Revoke'}</button>
        </>}>
        <p className="text-sm">PayPal will delete the vault token. Agents will need a human approval for every purchase until you connect again.</p>
      </Modal>
    </div>
  );
}

function GuardrailForm({ w, onSaved }: { w: WalletT; onSaved: () => void }) {
  const { notify } = useNotifications();
  const g = w.guardrails;
  const [daily, setDaily] = useState(String(g.daily_cap));
  const [per, setPer] = useState(String(g.per_transaction_cap));
  const [merchants, setMerchants] = useState(g.allowed_merchants.join(', '));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDaily(String(g.daily_cap)); setPer(String(g.per_transaction_cap)); setMerchants(g.allowed_merchants.join(', ')); }, [g.daily_cap, g.per_transaction_cap, g.allowed_merchants]);

  async function save() {
    setBusy(true);
    try {
      await walletService.saveGuardrails({ daily_cap: Number(daily), per_transaction_cap: Number(per), allowed_merchants: merchants.split(',').map((m) => m.trim()).filter(Boolean) });
      notify({ tone: 'success', title: 'Agent limits saved', message: 'Enforced on the server before every vault charge.' });
      onSaved();
    } catch (e) {
      notify({ tone: 'danger', title: 'Could not save limits', message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Agent spending guardrails" description="Checked by the policy engine before any autonomous charge.">
      <div className="space-y-3 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="g-daily" className="mb-1 block text-sm font-medium">Daily cap (USD)</label><input id="g-daily" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} className={inputClass()} /></div>
          <div><label htmlFor="g-per" className="mb-1 block text-sm font-medium">Per transaction (USD)</label><input id="g-per" inputMode="decimal" value={per} onChange={(e) => setPer(e.target.value)} className={inputClass()} /></div>
        </div>
        <div><label htmlFor="g-m" className="mb-1 block text-sm font-medium">Allowed merchants <span className="font-normal text-ink-muted">(comma separated, empty = any)</span></label><input id="g-m" value={merchants} onChange={(e) => setMerchants(e.target.value)} className={inputClass()} placeholder="Amazon, Figma" /></div>
        <button type="button" disabled={busy || !(Number(daily) > 0) || !(Number(per) > 0)} onClick={() => void save()} className={`${btn} bg-brand text-white hover:bg-brand-dark`}>{busy ? 'Saving...' : 'Save limits'}</button>
      </div>
    </Card>
  );
}
