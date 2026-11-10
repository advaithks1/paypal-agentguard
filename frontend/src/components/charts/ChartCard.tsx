import type { ReactNode } from 'react';
import type { DataSource } from '@/types';
import { Card } from '../Card';
import { DemoBadge } from '../DemoBadge';

export function ChartCard({ title, description, source, children, height = 'h-64' }: { title: string; description?: string; source?: DataSource; children: ReactNode; height?: string }) {
  return (
    <Card title={title} description={description} action={source ? <DemoBadge source={source} /> : undefined}>
      <div className={height}>{children}</div>
    </Card>
  );
}
