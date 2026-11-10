import { FlaskConical } from 'lucide-react';
import type { DataSource } from '@/types';
import { cn } from '@/utils/format';

/** Renders only for demo data, so fabricated records are never mistaken for real PayPal activity. */
export function DemoBadge({ source, className }: { source: DataSource; className?: string }) {
  if (source !== 'demo') return null;
  return (
    <span title="Demonstration data, not a real PayPal payment or backend result" className={cn('inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet-700 ring-1 ring-inset ring-violet-200', className)}>
      <FlaskConical className="h-3 w-3" aria-hidden /> Demo
    </span>
  );
}

export function DemoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}

/** Shown only for records that touched the PayPal sandbox (or live) API. */
export function PayPalBadge({ source, className }: { source: DataSource; className?: string }) {
  if (source !== 'paypal_sandbox' && source !== 'paypal_live') return null;
  const live = source === 'paypal_live';
  return (
    <span title={live ? 'This record touched the live PayPal API' : 'Real PayPal Sandbox API call, test money only'}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        live ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-sky-50 text-sky-800 ring-sky-200', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> {live ? 'PayPal Live' : 'PayPal Sandbox'}
    </span>
  );
}

/** Demo badge for demo records, PayPal badge for PayPal records, nothing for plain backend records. */
export function SourceBadge({ source, className }: { source: DataSource; className?: string }) {
  return <><DemoBadge source={source} className={className} /><PayPalBadge source={source} className={className} /></>;
}
