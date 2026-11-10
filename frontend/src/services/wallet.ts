import type { AgentWallet } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoUnavailable } from './demo/workflow';

const unavailable = <T>(what: string): Promise<T> => Promise.reject(demoUnavailable(what));

/** The agent wallet is a PayPal Vault feature: it only exists with the real backend. Demo mode says so instead of faking it. */
export const walletService = {
  get(): Promise<AgentWallet> {
    return isDemoMode ? unavailable('The agent wallet') : api.get<AgentWallet>('/wallet');
  },
  connect(): Promise<{ approval_url: string; setup_token_id: string }> {
    return isDemoMode ? unavailable('Connecting PayPal') : api.post('/wallet/connect');
  },
  complete(setupTokenId: string): Promise<AgentWallet> {
    return isDemoMode ? unavailable('Connecting PayPal') : api.post<AgentWallet>('/wallet/complete', { setup_token_id: setupTokenId });
  },
  revoke(): Promise<AgentWallet> {
    return isDemoMode ? unavailable('Revoking agent access') : api.post<AgentWallet>('/wallet/revoke');
  },
  saveGuardrails(g: { daily_cap: number; per_transaction_cap: number; allowed_merchants: string[] }): Promise<AgentWallet> {
    return isDemoMode ? unavailable('Agent limits') : api.put<AgentWallet>('/wallet/guardrails', g);
  },
};
