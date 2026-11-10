import type { Paginated, PurchaseRequest, PurchaseRequestCreate, PurchaseRequestQuery } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoCreateRequest, demoGetRequest, demoListRequests } from './demo/workflow';

export const purchaseRequestService = {
  list(query: PurchaseRequestQuery = {}): Promise<Paginated<PurchaseRequest>> {
    return isDemoMode ? demoListRequests(query) : api.get<Paginated<PurchaseRequest>>('/purchase-requests', { ...query });
  },
  get(id: string): Promise<PurchaseRequest> {
    return isDemoMode ? demoGetRequest(id) : api.get<PurchaseRequest>(`/purchase-requests/${encodeURIComponent(id)}`);
  },
  create(body: PurchaseRequestCreate): Promise<PurchaseRequest> {
    return isDemoMode ? Promise.resolve(demoCreateRequest(body, null, null)) : api.post<PurchaseRequest>('/purchase-requests', body);
  },
};
