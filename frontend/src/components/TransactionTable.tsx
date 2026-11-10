import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { SortDir, Transaction, TransactionSortKey } from '@/types';
import { formatDate, formatMoney } from '@/utils/format';
import { SourceBadge } from './DemoBadge';
import { RiskBadge } from './RiskBadge';
import { StatusBadge } from './StatusBadge';

interface Props {
  rows: Transaction[];
  onSelect: (t: Transaction) => void;
  sortKey?: TransactionSortKey;
  sortDir?: SortDir;
  onSort?: (k: TransactionSortKey) => void;
  compact?: boolean;
}

interface Col { key?: TransactionSortKey; label: string; right?: boolean; compactHide?: boolean }
const COLS: Col[] = [
  { label: 'Transaction ID' },
  { key: 'merchant', label: 'Merchant' },
  { key: 'amount', label: 'Amount', right: true },
  { label: 'Currency', compactHide: true },
  { key: 'risk_score', label: 'Risk score' },
  { label: 'Policy decision' },
  { label: 'Payment status', compactHide: true },
  { key: 'created_at', label: 'Date' },
];

function SortButton({ label, sortKey, active, dir, onSort }: { label: string; sortKey: TransactionSortKey; active: boolean; dir: SortDir; onSort: (k: TransactionSortKey) => void }) {
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide hover:text-ink">
      {label}<Icon className={`h-3.5 w-3.5 ${active ? 'text-brand' : 'text-slate-400'}`} aria-hidden />
    </button>
  );
}

export function TransactionTable({ rows, onSelect, sortKey, sortDir = 'desc', onSort, compact }: Props) {
  const cols = COLS.filter((c) => !(compact && c.compactHide));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs text-ink-muted">
          <tr>
            {cols.map((c) => {
              const active = c.key !== undefined && c.key === sortKey;
              return (
                <th key={c.label} scope="col" aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={`whitespace-nowrap px-4 py-2.5 font-semibold uppercase tracking-wide ${c.right ? 'text-right' : ''}`}>
                  {c.key && onSort ? <SortButton label={c.label} sortKey={c.key} active={active} dir={sortDir} onSort={onSort} /> : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} onClick={() => onSelect(t)} className="cursor-pointer border-t border-surface-line hover:bg-slate-50">
              <td className="whitespace-nowrap px-4 py-3">
                <button type="button" onClick={(e) => { e.stopPropagation(); onSelect(t); }} className="font-mono text-xs font-medium text-brand hover:underline">{t.id}</button>
                <SourceBadge source={t.data_source} className="ml-1.5" />
              </td>
              <td className="px-4 py-3 font-medium">{t.merchant}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{formatMoney(t.amount, t.currency)}</td>
              {!compact && <td className="px-4 py-3 text-ink-muted">{t.currency}</td>}
              <td className="px-4 py-3"><RiskBadge category={t.risk_category} score={t.risk_score} /></td>
              <td className="px-4 py-3"><StatusBadge status={t.policy_decision} /></td>
              {!compact && <td className="px-4 py-3"><StatusBadge status={t.payment_status} /></td>}
              <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDate(t.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
