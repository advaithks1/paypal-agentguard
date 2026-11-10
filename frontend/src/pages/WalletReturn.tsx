import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { walletService } from '@/services/wallet';
import { errorMessage } from '@/utils/errors';

const TOKEN = /^[A-Za-z0-9_-]{3,64}$/;

/** PayPal sends the buyer back with ?approval_token_id=<setup token>. We turn it into a vault token server-side (idempotent). */
export default function WalletReturn() {
  const [params] = useSearchParams();
  const token = params.get('approval_token_id') ?? params.get('token') ?? '';
  const [state, setState] = useState<'working' | 'ok' | 'error'>(TOKEN.test(token) ? 'working' : 'error');
  const [message, setMessage] = useState(TOKEN.test(token) ? '' : 'This page needs the PayPal approval token. Start from the Agent wallet page.');
  const ran = useRef('');

  useEffect(() => {
    if (!TOKEN.test(token) || ran.current === token) return;
    ran.current = token;
    walletService.complete(token).then(() => setState('ok')).catch((e: unknown) => { setMessage(errorMessage(e)); setState('error'); });
  }, [token]);

  return (
    <div className="mx-auto max-w-xl py-6">
      <div className="rounded-card border border-surface-line bg-surface-card p-6 text-center shadow-card sm:p-8" role="status" aria-live="polite">
        {state === 'working' && <><Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" aria-hidden /><h1 className="mt-4 text-xl font-semibold">Saving your consent</h1><p className="mt-1 text-sm text-ink-muted">Asking PayPal Vault for a secure token.</p></>}
        {state === 'ok' && <><CheckCircle2 className="mx-auto h-12 w-12 text-ok" aria-hidden /><h1 className="mt-4 text-xl font-semibold">Agent wallet connected</h1><p className="mt-1 text-sm text-ink-muted">Auto-approved purchases within your limits can now be paid with no redirect. You can revoke access any time.</p></>}
        {state === 'error' && <><XCircle className="mx-auto h-12 w-12 text-danger" aria-hidden /><h1 className="mt-4 text-xl font-semibold">Wallet not connected</h1><p className="mt-1 text-sm text-ink-muted">{message}</p></>}
        <Link to="/wallet" className="mt-5 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">Go to Agent wallet</Link>
      </div>
    </div>
  );
}
