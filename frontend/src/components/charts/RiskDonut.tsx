import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { RiskCategory } from '@/types';
import { RISK_COLORS } from '@/utils/chartColors';
import { RISK_LABEL } from '../RiskBadge';
import { EmptyState } from '../States';

const ORDER: RiskCategory[] = ['low', 'medium', 'high', 'critical'];

export function RiskDonut({ distribution }: { distribution: Record<RiskCategory, number> }) {
  const data = ORDER.map((k) => ({ key: k, name: RISK_LABEL[k], value: distribution[k] }));
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyState title="No risk data yet" />;
  return (
    <div>
      <div className="h-44" role="img" aria-label={`Risk distribution: ${data.map((d) => `${d.name} ${d.value}`).join(', ')}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
              {data.map((d) => <Cell key={d.key} fill={RISK_COLORS[d.key]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-2 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: RISK_COLORS[d.key] }} aria-hidden />
            <span className="text-ink-muted">{d.name}</span><span className="ml-auto font-semibold tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
