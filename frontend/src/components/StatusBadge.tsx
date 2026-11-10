import type { ApprovalStatus, MerchantStatus, PaymentStatus, PolicyDecision, RequestStatus } from '@/types';
import { cn } from '@/utils/format';
import { toneClasses, type BadgeTone } from '@/utils/tones';

export type AnyStatus = RequestStatus | ApprovalStatus | PaymentStatus | PolicyDecision | MerchantStatus;

const MAP: Record<AnyStatus, { label: string; tone: BadgeTone }> = {
  submitted: { label: 'Submitted', tone: 'neutral' },
  evaluating: { label: 'Evaluating', tone: 'info' },
  pending_approval: { label: 'Pending approval', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  blocked: { label: 'Blocked', tone: 'danger' },
  paid: { label: 'Paid', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  not_required: { label: 'Not required', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'warning' },
  not_started: { label: 'Not started', tone: 'neutral' },
  order_created: { label: 'Order created', tone: 'info' },
  buyer_approved: { label: 'Buyer approved', tone: 'info' },
  authorized: { label: 'Funds held', tone: 'info' },
  partially_captured: { label: 'Partly captured', tone: 'warning' },
  expired: { label: 'Hold expired', tone: 'neutral' },
  captured: { label: 'Captured', tone: 'success' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  voided: { label: 'Voided', tone: 'neutral' },
  auto_approved: { label: 'Auto-approved', tone: 'success' },
  needs_approval: { label: 'Needs approval', tone: 'warning' },
  trusted: { label: 'Trusted', tone: 'success' },
  restricted: { label: 'Restricted', tone: 'danger' },
  unreviewed: { label: 'Unreviewed', tone: 'neutral' },
};

export function StatusBadge({ status, className }: { status: AnyStatus; className?: string }) {
  const { label, tone } = MAP[status];
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', toneClasses[tone], className)}>
      {label}
    </span>
  );
}
