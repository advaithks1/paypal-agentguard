import type { Approval, ApprovalDecision, ApprovalStatus } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoDecide, demoListApprovals } from './demo/workflow';

export const approvalService = {
  list(status?: ApprovalStatus): Promise<Approval[]> {
    return isDemoMode ? demoListApprovals(status) : api.get<Approval[]>('/approvals', { status });
  },
  decide(id: string, decision: ApprovalDecision, note?: string): Promise<Approval> {
    return isDemoMode ? demoDecide(id, decision, note) : api.post<Approval>(`/approvals/${encodeURIComponent(id)}/decide`, { decision, note: note || undefined });
  },
};
