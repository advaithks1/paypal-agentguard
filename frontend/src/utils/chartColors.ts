import type { RiskCategory } from '@/types';

export const CHART_COLORS = { approved: '#0f9d6b', blocked: '#d9364a', pending: '#d98a0b', brand: '#0070e0', grid: '#e3e8f1' } as const;
export const RISK_COLORS: Record<RiskCategory, string> = { low: '#0f9d6b', medium: '#d98a0b', high: '#ea580c', critical: '#d9364a' };
