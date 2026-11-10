import type { AgentActivity, AgentCreated, AgentIdentity } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoUnavailable } from './demo/workflow';

const unavailable = <T>(what: string): Promise<T> => Promise.reject(demoUnavailable(what));

/** Agent API keys and MCP activity need the real backend; demo mode says so instead of faking it. */
export const agentsService = {
  list(): Promise<AgentIdentity[]> {
    return isDemoMode ? unavailable('Agent identities') : api.get<AgentIdentity[]>('/agents');
  },
  create(body: { name: string; daily_cap?: number; per_transaction_cap?: number; allowed_merchants?: string[] }): Promise<AgentCreated> {
    return isDemoMode ? unavailable('Creating agent keys') : api.post<AgentCreated>('/agents', body);
  },
  revoke(id: string): Promise<AgentIdentity> {
    return isDemoMode ? unavailable('Revoking agent keys') : api.post<AgentIdentity>(`/agents/${encodeURIComponent(id)}/revoke`);
  },
  activity(id: string): Promise<AgentActivity> {
    return isDemoMode ? unavailable('Agent activity') : api.get<AgentActivity>(`/agents/${encodeURIComponent(id)}/activity`);
  },
};
