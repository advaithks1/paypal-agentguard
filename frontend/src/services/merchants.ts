import type { Merchant } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { DEMO_MERCHANTS } from './demo/merchants';
import { delay } from './demo/util';

export const merchantService = {
  async list(): Promise<Merchant[]> {
    if (!isDemoMode) return api.get<Merchant[]>('/merchants');
    await delay(250);
    return DEMO_MERCHANTS;
  },
};
