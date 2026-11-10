import { AlertTriangle, Ban, Banknote, Bot, CheckCircle2, Circle, FileText, Lock, RotateCcw, ShieldCheck, Sparkles, Unlock, Webhook } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { transactionService } from '@/services/transactions';
import type { Narration, TimelineEvent, TransactionTimeline as TimelineData } from '@/types';
import { errorMessage } from '@/utils/errors';
import { formatDate } from '@/utils/format';

const POLL_MS = 3000;
const ICONS: Record<string, LucideIcon> = {
  request: FileText, policy: ShieldCheck, approval: CheckCircle2, order: Banknote, authorize: Lock, capture: Banknote,
  void: Unlock, refund: RotateCcw, webhook: Webhook, agent: Bot, blocked: Ban, info: Circle,
};
const SIM_EVENTS = ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.AUTHORIZATION.CREATED', 'PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.AUTHORIZATION.VOIDED'];
const ID_LABELS: [keyof TimelineEvent['paypal_ids'], string][] = [['order_id', 'Order'], ['authorization_id', 'Auth'], ['capture_id', 'Capture'], ['event_id', 'Event']];

function Row({ e }: { e: TimelineEvent }) {
  const Icon = ICONS[e.icon] ?? Circle;
  const paypal = e.source === 'PayPal webhook';
  const ids = ID_LABELS.filter(([k]) => e.paypal_ids[k]);
  return (
    <li className="relative pb-4 pl-9 last:pb-0">
      <span className={`absolute left-0 top-0 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${paypal ? (e.simulated ? 'bg-amber-100 text-amber-700' : 'bg-[#0070e0] text-white') : e.source === 'Agent via MCP' ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className={`rounded-lg px-3 py-2 ${e.highlight ? 'border border-blue-200 bg-blue-50' : e.simulated ? 'border border-dashed border-amber-300 bg-amber-50' : ''}`}>
        <p className="text-sm font-medium">{e.title}</p>
        {e.detail && <p className="break-words text-xs text-ink-muted">{e.detail}</p>}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-ink-muted">
          <span className="font-semibold">{e.source}</span><span>{formatDate(e.at)}</span>
          {e.verified === true && <span className="text-ok">signature verified</span>}
          {e.simulated && <span className="font-semibold text-amber-700">SANDBOX SIMULATION</span>}
        </p>
        {ids.length > 0 && <p className="mt-0.5 break-all font-mono text-[10px] text-ink-muted">{ids.map(([k, l]) => `${l}: ${e.paypal_ids[k]}`).join('  ')}</p>}
      </div>
    </li>
  );
}

/** Vertical timeline for one transaction. Polls every 3 seconds while the transaction is still moving. */
export function TransactionTimeline({ id }: { id: string }) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [story, setStory] = useState<Narration | null>(null);
  const [busy, setBusy] = useState<'story' | 'sim' | null>(null);
  const [simType, setSimType] = useState<string>('PAYMENT.AUTHORIZATION.CREATED');
  const live = useRef(true);

  const load = useCallback(async () => {
    try {
      const t = await transactionService.timeline(id);
      setData(t);
      setError(null);
      live.current = t.live;
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    live.current = true;
    void load();
    const h = window.setInterval(() => { if (live.current && !document.hidden) void load(); }, POLL_MS);
    return () => window.clearInterval(h);
  }, [load]);

  async function narrate() {
    setBusy('story');
    try { setStory(await transactionService.narrate(id)); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }
  async function simulate() {
    setBusy('sim');
    try { setData(await transactionService.simulateWebhook(id, simType)); setStory(null); } catch (e) { setError(errorMessage(e)); } finally { setBusy(null); }
  }

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">Timeline
          {data && (data.live
            ? <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />Live</span>
            : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">Final</span>)}
        </h3>
        <button type="button" disabled={busy !== null || !data || data.events.length === 0} onClick={() => void narrate()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-50 disabled:opacity-60"><Sparkles className="h-3.5 w-3.5" aria-hidden />{busy === 'story' ? 'Writing...' : 'Narrate this transaction'}</button>
      </div>
      {error && <p className="mb-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs text-danger"><AlertTriangle className="h-4 w-4" aria-hidden />{error}</p>}
      {story && (
        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2.5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{story.source === 'gemini' ? 'Narrated by Gemini' : 'Rule-based summary (not AI-generated)'}</p>
          <p className="text-sm">{story.narration}</p>
        </div>
      )}
      {!data && !error && <p className="text-sm text-ink-muted">Loading timeline...</p>}
      {data && data.events.length === 0 && <p className="text-sm text-ink-muted">No events yet.</p>}
      {data && data.events.length > 0 && (
        <ol className="relative before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-surface-line">
          {data.events.map((e) => <Row key={e.id} e={e} />)}
        </ol>
      )}
      {data?.sandbox && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-xs">
          <span className="font-semibold text-amber-800">PayPal Sandbox helper</span>
          <span className="text-amber-800">Adds a clearly labelled, unverified event to this timeline only. It never changes the payment.</span>
          <select aria-label="Simulated event" value={simType} onChange={(ev) => setSimType(ev.target.value)} className="rounded border border-amber-300 bg-white px-1.5 py-1">
            {SIM_EVENTS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button type="button" disabled={busy !== null} onClick={() => void simulate()} className="rounded-lg bg-amber-600 px-3 py-1 font-semibold text-white hover:bg-amber-700 disabled:opacity-60">{busy === 'sim' ? 'Adding...' : 'Simulate'}</button>
        </div>
      )}
    </section>
  );
}
