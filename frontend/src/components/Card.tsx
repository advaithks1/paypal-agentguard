import type { ReactNode } from 'react';
import { cn } from '@/utils/format';

interface Props { title?: string; description?: string; action?: ReactNode; children: ReactNode; className?: string; flush?: boolean }

export function Card({ title, description, action, children, className, flush }: Props) {
  return (
    <section className={cn('rounded-card border border-surface-line bg-surface-card shadow-card', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-surface-line px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="text-xs text-ink-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={flush ? '' : 'p-5'}>{children}</div>
    </section>
  );
}
