import type { AuditLog, AuditLogQuery, Paginated } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoAudit } from './demo/workflow';

export const auditService = {
  list(query: AuditLogQuery = {}): Promise<Paginated<AuditLog>> {
    return isDemoMode ? demoAudit(query.action, query.page, query.page_size) : api.get<Paginated<AuditLog>>('/audit-logs', { ...query });
  },
};
