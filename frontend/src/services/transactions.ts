import type { Narration, Paginated, Transaction, TransactionDetail, TransactionQuery, TransactionTimeline } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoGetTransaction, demoListTransactions } from './demo/transactions';
import { demoUnavailable } from './demo/workflow';

export const transactionService = {
  list(query: TransactionQuery = {}): Promise<Paginated<Transaction>> {
    return isDemoMode ? demoListTransactions(query) : api.get<Paginated<Transaction>>('/transactions', { ...query });
  },
  get(id: string): Promise<TransactionDetail> {
    return isDemoMode ? demoGetTransaction(id) : api.get<TransactionDetail>(`/transactions/${encodeURIComponent(id)}`);
  },
  /** Live timeline (AgentGuard + Agent via MCP + PayPal webhooks). Real backend only. */
  timeline(id: string): Promise<TransactionTimeline> {
    return isDemoMode ? Promise.reject(demoUnavailable('The live timeline')) : api.get<TransactionTimeline>(`/transactions/${encodeURIComponent(id)}/timeline`);
  },
  narrate(id: string): Promise<Narration> {
    return isDemoMode ? Promise.reject(demoUnavailable('Transaction narration')) : api.post<Narration>(`/transactions/${encodeURIComponent(id)}/narrate`);
  },
  simulateWebhook(id: string, eventType: string): Promise<TransactionTimeline> {
    return isDemoMode ? Promise.reject(demoUnavailable('The webhook simulator')) : api.post<TransactionTimeline>(`/transactions/${encodeURIComponent(id)}/simulate-webhook`, { event_type: eventType });
  },
};
