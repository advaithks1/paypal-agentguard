import { ArrowLeftRight, BarChart3, Bot, CheckCircle2, KeyRound, LayoutDashboard, Radar, ScrollText, Settings, ShieldCheck, ShoppingCart, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem { path: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { path: '/purchase-requests', label: 'Purchase requests', icon: ShoppingCart },
  { path: '/approvals', label: 'Approval centre', icon: CheckCircle2 },
  { path: '/wallet', label: 'Agent wallet', icon: Bot },
  { path: '/agents', label: 'Agents', icon: KeyRound },
  { path: '/policies', label: 'Spending policies', icon: ShieldCheck },
  { path: '/risk', label: 'Risk intelligence', icon: Radar },
  { path: '/merchants', label: 'Merchants', icon: Store },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/audit-logs', label: 'Audit logs', icon: ScrollText },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => (i.path === '/' ? pathname === '/' : pathname.startsWith(i.path)));
}
