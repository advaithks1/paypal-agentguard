import type { PolicyCopilotResponse, SpendingPolicy, SpendingPolicyInput } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoCopilot, demoGetPolicy, demoPutPolicy } from './demo/workflow';

export const policyService = {
  get(): Promise<SpendingPolicy> {
    return isDemoMode ? demoGetPolicy() : api.get<SpendingPolicy>('/policies');
  },
  update(policy: SpendingPolicyInput): Promise<SpendingPolicy> {
    return isDemoMode ? demoPutPolicy(policy) : api.put<SpendingPolicy>('/policies', policy);
  },
  /** PROPOSAL ONLY. Nothing is saved until the user confirms with `update`. */
  copilot(instruction: string): Promise<PolicyCopilotResponse> {
    return isDemoMode ? demoCopilot() : api.post<PolicyCopilotResponse>('/policies/copilot', { instruction });
  },
};
