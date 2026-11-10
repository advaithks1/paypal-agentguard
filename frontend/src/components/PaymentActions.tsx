import { ExternalLink, Lock, RefreshCw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { formatCountdown, useCountdown } from '@/hooks/useCountdown';
import { useNotifications } from '@/hooks/useNotifications';
import { isDemoMode } from '@/services/config';
import { paymentService } from '@/services/payments';
import type { PurchaseRequest } from '@/types';
import { errorMessage } from '@/utils/errors';
import { formatDate, formatMoney } from '@/utils/format';
import { Modal } from './Modal';
import { PayPalBadge } from './DemoBadge';
import { StatusBadge } from './StatusBadge';

interface Props { request: PurchaseRequest; onChanged?: () => void }

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60';

/** PayPal checkout + refund for one purchase request. Amounts always come from the backend, never from this UI. */
export function PaymentActions({ request, onChanged }: Props) {
  const { notify } = useNotifications();
  const payment = useAsync(() => paymentService.byRequest(request.id), [request.id, request.payment_status]);
  const [busy, setBusy] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const p = payment.data;
  const left = useCountdown(p?.funds_held ? p.authorization_expires_at : null);
  const [partial, setPartial] = useState('');

  const held = Boolean(p?.funds_held);
  const payable = request.status === 'approved' && request.payment_status !== 'captured' && request.payment_status !== 'refunded' && !held;
  const holdable = request.status === 'pending_approval' && !held && p?.status !== 'voided' && p?.status !== 'expired';
  const dead = request.status === 'blocked' || request.status === 'rejected';

  async function pay() {
    setBusy(true);
    try {
      // approved: one-step CAPTURE. Still waiting for a human: AUTHORIZE (hold funds, charge nothing).
      const order = await paymentService.createOrder(request.id, request.status === 'approved' ? 'capture' : undefined);
      if (!order.approval_url || !order.approval_url.startsWith('https://')) throw new Error('PayPal did not return an approval link.');
      notify({ tone: 'info', title: 'Redirecting to PayPal', message: 'Approve the payment with your sandbox buyer account.' });
      window.location.assign(order.approval_url);
    } catch (e) {
      notify({ tone: 'danger', title: 'Could not start PayPal checkout', message: errorMessage(e) });
      setBusy(false);
    }
  }

  async function run(label: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      notify({ tone: 'success', title: label, message: ok });
      payment.reload();
      onChanged?.();
    } catch (e) {
      notify({ tone: 'danger', title: `${label} failed`, message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function refund() {
    if (!p) return;
    setBusy(true);
    try {
      await paymentService.refund(p.id);
      notify({ tone: 'success', title: 'Refund issued', message: `${formatMoney(p.amount, p.currency)} refunded through PayPal Sandbox.` });
      setConfirmRefund(false);
      payment.reload();
      onChanged?.();
    } catch (e) {
      notify({ tone: 'danger', title: 'Refund failed', message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {p && (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs uppercase tracking-wide text-ink-muted">Payment</dt><dd className="mt-0.5 flex flex-wrap items-center gap-1.5"><StatusBadge status={p.status} /><PayPalBadge source={p.data_source} />{p.autonomous && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">Charged by agent, no human click</span>}</dd></div>
          <div><dt className="text-xs uppercase tracking-wide text-ink-muted">Amount</dt><dd className="mt-0.5 tabular-nums">{formatMoney(p.amount, p.currency)}</dd></div>
          <div className="col-span-2"><dt className="text-xs uppercase tracking-wide text-ink-muted">PayPal order</dt><dd className="mt-0.5 break-all font-mono text-xs">{p.paypal_order_id ?? 'none'}</dd></div>
          {p.captured_at && <div className="col-span-2"><dt className="text-xs uppercase tracking-wide text-ink-muted">Captured</dt><dd className="mt-0.5">{formatDate(p.captured_at)}</dd></div>}
        </dl>
      )}

      {p && held && (
        <div className={`rounded-lg border p-3 text-sm ${p.expiring_soon ? 'border-amber-300 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
          <p className="flex flex-wrap items-center gap-1.5 font-semibold"><Lock className="h-4 w-4" aria-hidden />Funds held by PayPal<PayPalBadge source={p.data_source} /></p>
          <p className="mt-1">{p.hold_explanation ?? 'PayPal is holding this amount. Nothing is charged until a human approves.'}
            {p.hold_explanation_source && <span className="ml-1 text-xs text-ink-muted">({p.hold_explanation_source === 'gemini' ? 'Gemini' : 'rules'})</span>}</p>
          <p className="mt-1 tabular-nums">{formatMoney(p.remaining_authorized, p.currency)} still held{p.captured_amount > 0 ? ` · ${formatMoney(p.captured_amount, p.currency)} captured` : ''}</p>
          {left !== null && <p className={`mt-0.5 text-xs ${p.expiring_soon ? 'font-semibold text-warn' : 'text-ink-muted'}`}>{left === 0 ? 'Hold expired' : `${p.expiring_soon ? 'Expiring soon: ' : 'Expires in '}${formatCountdown(left)}`}</p>}
          {request.status === 'pending_approval' && <p className="mt-2 text-xs text-ink-muted">Approve to allow the capture. Reject and PayPal releases the hold automatically.</p>}
          {request.status === 'approved' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy} onClick={() => void run('Captured', () => paymentService.captureAuthorization(p.id), 'Held funds captured through PayPal Sandbox.')} className={`${btn} bg-ok text-white hover:opacity-90`}>Capture {formatMoney(p.remaining_authorized, p.currency)}</button>
              <input aria-label="Partial capture amount" inputMode="decimal" placeholder="Partial" value={partial} onChange={(e) => setPartial(e.target.value)} className="w-24 rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              <button type="button" disabled={busy || !(Number(partial) > 0)} onClick={() => void run('Partially captured', () => paymentService.captureAuthorization(p.id, Number(partial)), `${partial} captured; the rest stays held.`)} className={`${btn} border border-slate-300 bg-white hover:bg-slate-50`}>Capture part</button>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void run('Hold released', () => paymentService.voidAuthorization(p.id), 'PayPal released the held funds. Nothing was charged.')} className={`${btn} border border-red-200 bg-white text-danger hover:bg-red-50`}>Void hold</button>
            {p.status === 'authorized' && p.captured_amount === 0 && (
              <button type="button" disabled={busy} onClick={() => void run('Hold renewed', () => paymentService.reauthorize(p.id), 'PayPal renewed the hold.')} className={`${btn} border border-slate-300 bg-white hover:bg-slate-50`}><RefreshCw className="h-4 w-4" aria-hidden />Reauthorize</button>
            )}
          </div>
        </div>
      )}

      {holdable && (
        <div>
          <button type="button" disabled={busy || isDemoMode} onClick={() => void pay()} className={`${btn} bg-[#0070e0] text-white hover:bg-[#003087]`}>
            <Lock className="h-4 w-4" aria-hidden />{busy ? 'Contacting PayPal...' : 'Hold funds with PayPal (no charge)'}
          </button>
          <p className="mt-1.5 text-xs text-ink-muted">{isDemoMode ? 'Holding funds needs the real backend (VITE_DATA_MODE=api).' : 'PayPal Sandbox reserves the amount. Nothing is charged until you approve.'}</p>
        </div>
      )}

      {dead && <p className="text-sm text-ink-muted">No payment can be made for a {request.status} request.</p>}

      {payable && (
        <div>
          <button type="button" disabled={busy || isDemoMode} onClick={() => void pay()} className={`${btn} bg-[#0070e0] text-white hover:bg-[#003087]`}>
            <ExternalLink className="h-4 w-4" aria-hidden />{busy ? 'Contacting PayPal...' : p?.status === 'order_created' ? 'Continue to PayPal' : 'Pay with PayPal'}
          </button>
          {isDemoMode
            ? <p className="mt-1.5 text-xs text-ink-muted">PayPal checkout is only available with the real backend (VITE_DATA_MODE=api).</p>
            : <p className="mt-1.5 text-xs text-ink-muted">You will be sent to PayPal Sandbox to approve with a test buyer account. No real money moves.</p>}
        </div>
      )}

      {p?.status === 'captured' && (
        <button type="button" disabled={busy} onClick={() => setConfirmRefund(true)} className={`${btn} border border-slate-300 bg-white hover:bg-slate-50`}>
          <Undo2 className="h-4 w-4" aria-hidden />Refund payment
        </button>
      )}

      <Modal open={confirmRefund} onClose={() => (busy ? undefined : setConfirmRefund(false))} title="Refund this payment?"
        footer={<>
          <button type="button" disabled={busy} onClick={() => setConfirmRefund(false)} className={`${btn} border border-slate-300 hover:bg-slate-50`}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => void refund()} className={`${btn} bg-danger text-white hover:opacity-90`}>{busy ? 'Refunding...' : 'Refund in full'}</button>
        </>}>
        <p className="text-sm">{p ? `${formatMoney(p.amount, p.currency)} will be refunded to the buyer through the PayPal Sandbox API.` : ''} This cannot be undone.</p>
      </Modal>
    </div>
  );
}
