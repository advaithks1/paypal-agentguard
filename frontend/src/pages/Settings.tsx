import { CheckCircle2, MinusCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/Card';
import { DemoBanner } from '@/components/DemoBadge';
import { PageHeader } from '@/components/PageHeader';
import { CardSkeleton } from '@/components/Skeleton';
import { ErrorState } from '@/components/States';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/hooks/useAuth';
import { API_BASE_URL } from '@/services/api';
import { DATA_MODE, isDemoMode } from '@/services/config';
import { healthService } from '@/services/health';

function Row({ label, ok, children }: { label: string; ok?: boolean; children: ReactNode }) {
  const Icon = ok ? CheckCircle2 : MinusCircle;
  return (
    <li className="flex items-start gap-3 py-3">
      {ok !== undefined && <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${ok ? 'text-ok' : 'text-slate-400'}`} aria-hidden />}
      <div className="min-w-0"><p className="text-sm font-medium">{label}</p><p className="text-sm text-ink-muted">{children}</p></div>
    </li>
  );
}

export default function Settings() {
  const { user, logout } = useAuth();
  const health = useAsync(() => healthService.get(), []);
  const h = health.data;
  return (
    <>
      <PageHeader title="Settings" description="Account details and the status of the integrations behind AgentGuard." />
      {isDemoMode && <div className="mb-5"><DemoBanner>Demo mode: integration status below is not from a real backend.</DemoBanner></div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Integrations" description="Live status from the backend /health endpoint. Secrets are never sent to the browser.">
          {health.error ? <ErrorState title="Backend unreachable" message={health.error} onRetry={health.reload} /> : !h ? <CardSkeleton lines={4} /> : (
            <ul className="divide-y divide-surface-line">
              <Row label="PayPal" ok={h.paypal_configured}>{h.paypal_configured ? `Credentials configured. Mode: ${h.paypal_mode === 'sandbox' ? 'Sandbox (test money only)' : 'LIVE'}.` : 'Not configured. Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to backend/.env to enable checkout.'}</Row>
              <Row label="PayPal webhook verification" ok={h.paypal_webhook_verification}>{h.paypal_webhook_verification ? 'PAYPAL_WEBHOOK_ID set. Webhooks are signature-verified.' : 'Not set. Payments still complete through return-URL capture.'}</Row>
              <Row label="Gemini" ok={h.gemini_configured}>{h.gemini_configured ? `Configured. Model: ${h.gemini_model}. It parses requests and explains decisions.` : 'Not configured. AgentGuard falls back to rule-based parsing and explanations, labelled as such.'}</Row>
              <Row label="Policy engine" ok>Deterministic and always on. It makes every decision.</Row>
            </ul>
          )}
        </Card>
        <Card title="Account and app">
          <ul className="divide-y divide-surface-line">
            <Row label="Signed in as">{user ? `${user.full_name} (${user.email})` : 'Unknown'}</Row>
            <Row label="Data mode">{DATA_MODE === 'api' ? 'api (real backend)' : 'demo (simulated, in-browser)'}</Row>
            <Row label="API base URL">{isDemoMode ? 'Not used in demo mode' : API_BASE_URL}</Row>
          </ul>
          <button type="button" onClick={logout} className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50">Sign out</button>
        </Card>
      </div>
    </>
  );
}
