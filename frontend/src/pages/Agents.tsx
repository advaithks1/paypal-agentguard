import { Bot, Copy, KeyRound, ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { Card } from '@/components/Card';
import { inputClass } from '@/components/FormField';
import { Modal } from '@/components/Modal';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/States';
import { StatusBadge } from '@/components/StatusBadge';
import { useAsync } from '@/hooks/useAsync';
import { useNotifications } from '@/hooks/useNotifications';
import { agentsService } from '@/services/agents';
import { isDemoMode } from '@/services/config';
import type { AgentIdentity } from '@/types';
import { errorMessage } from '@/utils/errors';
import { formatDate, formatMoney } from '@/utils/format';

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60';

export default function Agents() {
  const { notify } = useNotifications();
  const agents = useAsync(() => agentsService.list(), []);
  const [name, setName] = useState('');
  const [per, setPer] = useState('');
  const [daily, setDaily] = useState('');
  const [busy, setBusy] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<AgentIdentity | null>(null);
  const [toRevoke, setToRevoke] = useState<AgentIdentity | null>(null);
  const activity = useAsync(() => (selected ? agentsService.activity(selected.id) : Promise.resolve(null)), [selected?.id]);

  async function create() {
    setBusy(true);
    try {
      const body: { name: string; daily_cap?: number; per_transaction_cap?: number } = { name: name.trim() };
      if (daily) body.daily_cap = Number(daily);
      if (per) body.per_transaction_cap = Number(per);
      const res = await agentsService.create(body);
      setNewKey(res.api_key);
      setName(''); setDaily(''); setPer('');
      agents.reload();
    } catch (e) {
      notify({ tone: 'danger', title: 'Could not create agent', message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(a: AgentIdentity) {
    setBusy(true);
    try {
      await agentsService.revoke(a.id);
      notify({ tone: 'success', title: 'Key revoked', message: `${a.name} can no longer call AgentGuard.` });
      setToRevoke(null);
      agents.reload();
      if (selected?.id === a.id) activity.reload();
    } catch (e) {
      notify({ tone: 'danger', title: 'Could not revoke', message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  const list = agents.data ?? [];
  return (
    <div>
      <PageHeader title="Agents" description="Give each AI agent its own API key. Agents connect over MCP and can only request purchases. The policy engine and you decide." />
      {agents.error && <Card><ErrorState title={isDemoMode ? 'Needs the real backend' : 'Could not load agents'} message={isDemoMode ? 'Agent keys and MCP activity need the real backend (set VITE_DATA_MODE=api).' : agents.error} onRetry={isDemoMode ? undefined : agents.reload} /></Card>}
      {!agents.error && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Create an agent" description="The key is shown once. Limits are optional and enforced before any vault charge.">
            <div className="space-y-3 p-5 text-sm">
              <label className="block"><span className="mb-1 block font-medium">Agent name</span>
                <input className={inputClass()} value={name} maxLength={60} placeholder="e.g. claude-shopper" onChange={(e) => setName(e.target.value)} /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="mb-1 block font-medium">Per-purchase cap</span><input className={inputClass()} inputMode="decimal" value={per} placeholder="default 50" onChange={(e) => setPer(e.target.value)} /></label>
                <label className="block"><span className="mb-1 block font-medium">Daily cap</span><input className={inputClass()} inputMode="decimal" value={daily} placeholder="default 100" onChange={(e) => setDaily(e.target.value)} /></label>
              </div>
              <button type="button" disabled={busy || name.trim().length < 2} onClick={() => void create()} className={`${btn} bg-brand text-white hover:bg-brand-dark`}><KeyRound className="h-4 w-4" aria-hidden />{busy ? 'Creating...' : 'Create agent and key'}</button>
              <p className="text-xs text-ink-muted">MCP setup and a Claude Desktop config are in <code>docs/MCP.md</code>. Agents have no tool to approve or pay.</p>
            </div>
          </Card>

          <Card title="Your agents">
            {agents.loading && list.length === 0 ? <p className="p-5 text-sm text-ink-muted">Loading agents...</p>
              : list.length === 0 ? <p className="p-5 text-sm text-ink-muted">No agents yet. Create one to get an API key.</p> : (
                <ul className="divide-y divide-surface-line">
                  {list.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                      <button type="button" onClick={() => setSelected(a)} className="min-w-0 text-left">
                        <p className="flex items-center gap-2 font-medium"><Bot className="h-4 w-4 text-brand" aria-hidden />{a.name}</p>
                        <p className="text-xs text-ink-muted"><code>{a.key_prefix}...</code> · {a.calls_total} calls · {a.purchase_requests} requests · last used {a.last_used_at ? formatDate(a.last_used_at) : 'never'}</p>
                      </button>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${a.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{a.status === 'active' ? 'Active' : 'Revoked'}</span>
                        {a.status === 'active' && <button type="button" onClick={() => setToRevoke(a)} className={`${btn} border border-red-200 bg-white px-3 py-1 text-danger hover:bg-red-50`}><ShieldOff className="h-4 w-4" aria-hidden />Revoke</button>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        </div>
      )}

      {selected && (
        <div className="mt-4">
          <Card title={`Activity: ${selected.name}`} description="Every MCP call and decision for this agent (source: Agent via MCP / AgentGuard).">
            {activity.loading && !activity.data && <p className="p-5 text-sm text-ink-muted">Loading activity...</p>}
            {activity.error && <p className="p-5 text-sm text-danger">{activity.error}</p>}
            {activity.data && (
              <div className="grid gap-4 p-5 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Purchase requests</h3>
                  {activity.data.requests.length === 0 ? <p className="text-sm text-ink-muted">None yet.</p> : (
                    <ul className="space-y-2 text-sm">
                      {activity.data.requests.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2"><span className="break-words">{r.item} <span className="text-ink-muted">at {r.merchant}</span></span><span className="flex items-center gap-2 tabular-nums">{formatMoney(r.amount, r.currency)}<StatusBadge status={r.status} /></span></li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Recent events</h3>
                  {activity.data.events.length === 0 ? <p className="text-sm text-ink-muted">No calls yet.</p> : (
                    <ul className="max-h-72 space-y-2 overflow-auto text-sm">
                      {activity.data.events.map((e) => (
                        <li key={e.id}><p className="break-words">{e.detail}</p><p className="text-xs text-ink-muted">{e.source} · {formatDate(e.created_at)}</p></li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal open={newKey !== null} onClose={() => setNewKey(null)} title="Copy your API key now"
        footer={<button type="button" onClick={() => setNewKey(null)} className={`${btn} bg-brand text-white hover:bg-brand-dark`}>I saved it</button>}>
        <p className="text-sm">This key is shown once and cannot be recovered. Put it in <code>AGENTGUARD_API_KEY</code> for your MCP client.</p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 p-2">
          <code className="min-w-0 flex-1 break-all text-xs">{newKey}</code>
          <button type="button" aria-label="Copy key" onClick={() => { if (newKey) void navigator.clipboard.writeText(newKey).then(() => notify({ tone: 'success', title: 'Copied', message: 'API key copied to the clipboard.' })); }} className={`${btn} border border-slate-300 px-2 py-1 hover:bg-white`}><Copy className="h-4 w-4" aria-hidden /></button>
        </div>
      </Modal>

      <Modal open={toRevoke !== null} onClose={() => (busy ? undefined : setToRevoke(null))} title="Revoke this key?"
        footer={<>
          <button type="button" disabled={busy} onClick={() => setToRevoke(null)} className={`${btn} border border-slate-300 hover:bg-slate-50`}>Cancel</button>
          <button type="button" disabled={busy} onClick={() => toRevoke && void revoke(toRevoke)} className={`${btn} bg-danger text-white hover:opacity-90`}>{busy ? 'Revoking...' : 'Revoke'}</button>
        </>}>
        <p className="text-sm">{toRevoke?.name} will be rejected immediately on every MCP call. This cannot be undone; create a new agent to issue a new key.</p>
      </Modal>
    </div>
  );
}
