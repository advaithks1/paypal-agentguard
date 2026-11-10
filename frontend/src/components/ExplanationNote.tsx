import { Bot, Cog } from 'lucide-react';
import type { DataSource, ExplanationSource } from '@/types';

/** Labels who wrote an explanation. Rule-based text is never presented as AI output. */
export function ExplanationNote({ text, source, dataSource }: { text: string | null; source?: ExplanationSource; dataSource?: DataSource }) {
  if (!text) return null;
  const demo = dataSource === 'demo';
  const ai = source === 'gemini';
  const label = ai ? 'Explained by Gemini' : demo ? 'Simulated demo explanation' : 'Rule-based explanation (not AI-generated)';
  const Icon = ai ? Bot : Cog;
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <p className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
        <Icon className="h-3.5 w-3.5" aria-hidden />{label}
      </p>
      <p className="text-sm">{text}</p>
      <p className="mt-1 text-[11px] text-ink-muted">The decision comes from deterministic policy rules. {ai ? 'Gemini only explains it.' : ''}</p>
    </div>
  );
}
