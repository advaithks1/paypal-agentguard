import type { DashboardSummary } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoDashboardSummary } from './demo/dashboard';

export const dashboardService = {
  getSummary(): Promise<DashboardSummary> {
    return isDemoMode ? demoDashboardSummary() : api.get<DashboardSummary>('/dashboard/summary');
  },
};
