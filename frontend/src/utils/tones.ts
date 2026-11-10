export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-brand-soft text-brand-dark ring-blue-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
};
export const toneIconClasses: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  info: 'bg-brand-soft text-brand',
  success: 'bg-emerald-50 text-emerald-600',
  warning: 'bg-amber-50 text-amber-600',
  danger: 'bg-red-50 text-red-600',
};
