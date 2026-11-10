import { Ban } from 'lucide-react';
import { Link } from 'react-router-dom';

/** The buyer left PayPal without paying. Nothing was captured; the open order can be resumed or left to expire. */
export default function PaypalCancel() {
  return (
    <div className="mx-auto max-w-xl py-6">
      <div className="flex flex-col items-center rounded-card border border-surface-line bg-surface-card p-6 text-center shadow-card sm:p-8">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-amber-50 text-warn"><Ban className="h-8 w-8" aria-hidden /></span>
        <h1 className="mt-4 text-xl font-semibold">Payment cancelled</h1>
        <p className="mt-1 text-sm text-ink-muted">You left PayPal without paying, so no money moved. The request stays approved. You can resume it from the Approval centre or Purchase requests whenever you like.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to="/approvals" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Approval centre</Link>
          <Link to="/purchase-requests" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Purchase requests</Link>
          <Link to="/" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}
