import type { Merchant } from '@/types';

/** DEMO DATA: fictional trust scores and limits. Not real merchant intelligence. */
export const DEMO_MERCHANTS: Merchant[] = [
  { id: 'm-aws', name: 'Amazon Web Services', category: 'Cloud infrastructure', status: 'trusted', trust_score: 96, per_transaction_limit: 2000, monthly_limit: 10000, currency: 'USD' },
  { id: 'm-notion', name: 'Notion Labs', category: 'Software subscriptions', status: 'trusted', trust_score: 93, per_transaction_limit: 500, monthly_limit: 2000, currency: 'USD' },
  { id: 'm-figma', name: 'Figma', category: 'Software subscriptions', status: 'trusted', trust_score: 94, per_transaction_limit: 500, monthly_limit: 2000, currency: 'USD' },
  { id: 'm-do', name: 'DigitalOcean', category: 'Cloud infrastructure', status: 'trusted', trust_score: 91, per_transaction_limit: 1000, monthly_limit: 5000, currency: 'USD' },
  { id: 'm-staples', name: 'Staples', category: 'Office supplies', status: 'trusted', trust_score: 88, per_transaction_limit: 800, monthly_limit: 3000, currency: 'USD' },
  { id: 'm-gws', name: 'Google Workspace', category: 'Software subscriptions', status: 'trusted', trust_score: 97, per_transaction_limit: 1500, monthly_limit: 6000, currency: 'USD' },
  { id: 'm-zoom', name: 'Zoom', category: 'Software subscriptions', status: 'trusted', trust_score: 90, per_transaction_limit: 400, monthly_limit: 1500, currency: 'USD' },
  { id: 'm-canva', name: 'Canva', category: 'Design', status: 'trusted', trust_score: 89, per_transaction_limit: 300, monthly_limit: 1200, currency: 'USD' },
  { id: 'm-abiz', name: 'Amazon Business', category: 'Procurement', status: 'trusted', trust_score: 85, per_transaction_limit: 1500, monthly_limit: 6000, currency: 'USD' },
  { id: 'm-nova', name: 'NovaDeals Marketplace', category: 'Marketplace', status: 'unreviewed', trust_score: 48, per_transaction_limit: null, monthly_limit: null, currency: 'USD' },
  { id: 'm-gift', name: 'QuickGiftCards.io', category: 'Gift cards', status: 'restricted', trust_score: 22, per_transaction_limit: 0, monthly_limit: 0, currency: 'USD' },
  { id: 'm-lux', name: 'LuxWatchOutlet', category: 'Luxury goods', status: 'restricted', trust_score: 18, per_transaction_limit: 0, monthly_limit: 0, currency: 'USD' },
];
