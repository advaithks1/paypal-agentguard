import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CHART_COLORS } from '@/utils/chartColors';
import { shortDate } from '@/utils/format';

export interface HistoryPoint { date: string; approved: number; blocked: number }

export function HistoryBarChart({ data }: { data: HistoryPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
        <XAxis dataKey="date" tickFormatter={(d: string) => shortDate(d)} tickLine={false} axisLine={false} fontSize={12} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
        <Tooltip labelFormatter={(l) => shortDate(String(l))} cursor={{ fill: '#f1f5f9' }} />
        <Legend iconType="circle" />
        <Bar dataKey="approved" name="Approved" stackId="a" fill={CHART_COLORS.approved} />
        <Bar dataKey="blocked" name="Blocked" stackId="a" fill={CHART_COLORS.blocked} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
