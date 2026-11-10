import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PayPalBadge } from '@/components/DemoBadge';
import { StatusBadge } from '@/components/StatusBadge';
import { useNotifications } from '@/hooks/useNotifications';
import { ApiError } from '@/services/api';
import { paymentService } from '@/services/payments';
import type { Payment } from '@/types';
import { errorMessage } from '@/utils/errors';
import { formatDate, formatMoney } from '@/utils/format';

type View = { kind: 'working' } | { kind: 'done'; payment: Payment } | { kind: 'error'; message: string; code?: string };
const ORDER_ID = /^[A-Za-z0-9_-]{3,64}$/;

/** PayPal sends the buyer here with ?token=<orderId>. We capture server-side (idempotent: reloading is safe). */
export default function PaypalReturn() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { notify } = useNotifications();
  const [view, setView] = useState<View>(ORDER_ID.test(token) ? { kind: 'working' } : { kind: 'error', message: 'This page needs a PayPal order token. Start a payment from the Approval centre or Purchase requests.', code: 'missing_token' });
  const [attempt, setAttempt] = useState(0);
  const ran = useRef<string>('');

  useEffect(() => {
    if (!ORDER_ID.test(token)) return;
    const key = `${token}:${attempt}`;
    if (ran.current === key) return; // React StrictMode runs effects twice in dev; capture once per attempt
    ran.current = key;
    setView({ kind: 'working' });
    paymentService.authorize(token)
      .catch((e: unknown) => (e instanceof ApiError && e.code === 'use_capture_flow' ? paymentService.capture(token) : Promise.reject(e)))
      .then((payment) => {
        setView({ kind: 'done', payment });
        if (payment.status === 'authorized') notify({ tone: 'success', title: 'Funds held by PayPal', message: `${formatMoney(payment.amount, payment.currency)} is held, not charged. Approve it in the Approval centre to capture.` });
        if (payment.status === 'captured' || payment.status === 'refunded') notify({ tone: 'success', title: 'Payment captured', message: `${formatMoney(payment.amount, payment.currency)} paid through PayPal Sandbox.` });
      })
      .catch((e: unknown) => {
        const msg = errorMessage(e);
        setView({ kind: 'error', message: msg, code: e instanceof ApiError ? e.code : undefined });
        notify({ tone: 'danger', title: 'Payment was not completed', message: msg });
      });
  }, [token, attempt, notify]);

  return (
    <div className="mx-auto max-w-xl py-6">
      <div className="rounded-card border border-surface-line bg-surface-card p-6 shadow-card sm:p-8" role="status" aria-live="polite">
        {view.kind === 'working' && (
          <div className="flex flex-col items-center py-6 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-brand" aria-hidden />
            <h1 className="mt-4 text-xl font-semibold">Finishing your payment</h1>
            <p className="mt-1 text-sm text-ink-muted">Confirming with PayPal. Please do not close this page.</p>
          </div>
        )}
        {view.kind === 'done' && <Done payment={view.payment} onRetry={() => setAttempt((n) => n + 1)} />}
        {view.kind === 'error' && (
          <div className="flex flex-col items-center py-2 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-red-50 text-danger"><XCircle className="h-8 w-8" aria-hidden /></span>
            <h1 className="mt-4 text-xl font-semibold">Payment not completed</h1>
            <p className="mt-1 text-sm text-ink-muted">{view.message}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {view.code !== 'missing_token' && <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Try again</button>}
              <Link to="/approvals" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Approval centre</Link>
              <Link to="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Back to dashboard</Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Done({ payment: p, onRetry }: { payment: Payment; onRetry: () => void }) {
  const held = p.status === 'authorized' || p.status === 'partially_captured';
  const ok = held || p.status === 'captured' || p.status === 'refunded';
  const Icon = ok ? CheckCircle2 : Clock;
  return (
    <div className="flex flex-col items-center text-center">
      <span className={`grid h-14 w-14 place-items-center rounded-full ${ok ? 'bg-emerald-50 text-ok' : 'bg-amber-50 text-warn'}`}><Icon className="h-8 w-8" aria-hidden /></span>
      <h1 className="mt-4 text-xl font-semibold">{held ? 'Funds held by PayPal' : p.status === 'refunded' ? 'Payment was refunded' : ok ? 'Payment successful' : 'Payment still pending'}</h1>
      <p className="mt-1 text-sm text-ink-muted">{held ? 'PayPal is holding the money. Nothing has been charged yet: it is captured only after a human approves, and released if rejected or expired.' : ok ? 'PayPal confirmed the payment. The transaction, audit log and dashboard are updated.' : 'PayPal has not completed this payment yet. If you approved it, try again in a moment.'}</p>
      <dl className="mt-5 w-full space-y-2 rounded-lg bg-slate-50 p-4 text-left text-sm">
        <div className="flex justify-between gap-3"><dt className="text-ink-muted">Amount</dt><dd className="font-semibold tabular-nums">{formatMoney(p.amount, p.currency)}</dd></div>
        <div className="flex items-center justify-between gap-3"><dt className="text-ink-muted">Status</dt><dd className="flex items-center gap-1.5"><StatusBadge status={p.status} /><PayPalBadge source={p.data_source} /></dd></div>
        <div className="flex justify-between gap-3"><dt className="text-ink-muted">PayPal order</dt><dd className="break-all font-mono text-xs">{p.paypal_order_id}</dd></div>
        {p.captured_at && <div className="flex justify-between gap-3"><dt className="text-ink-muted">Captured</dt><dd>{formatDate(p.captured_at)}</dd></div>}
      </dl>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {held && <Link to="/approvals" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Go to Approval centre</Link>}
        {!ok && <button type="button" onClick={onRetry} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Check again</button>}
        <Link to="/" className={ok ? 'rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark' : 'rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50'}>Back to dashboard</Link>
        <Link to="/transactions" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Transactions</Link>
        <Link to="/audit-logs" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Audit log</Link>
      </div>
    </div>
  );
}
