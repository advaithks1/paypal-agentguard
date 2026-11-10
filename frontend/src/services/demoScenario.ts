import type { DemoScenarioResponse } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoScenario } from './demo/workflow';

export const demoService = {
  /** Creates 4 contrasting requests (auto-approved, needs approval, blocked merchant, prompt injection). No payment is made. */
  async runScenario(): Promise<DemoScenarioResponse> {
    if (isDemoMode) return { items: await demoScenario() };
    return api.post<DemoScenarioResponse>('/demo/run-scenario');
  },
};
