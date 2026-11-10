import type { HealthStatus } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoHealth } from './demo/workflow';

export const healthService = {
  get(): Promise<HealthStatus> {
    return isDemoMode ? demoHealth() : api.get<HealthStatus>('/health');
  },
};
