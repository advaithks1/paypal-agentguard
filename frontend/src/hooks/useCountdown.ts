import { useEffect, useState } from 'react';

/** Seconds left until an ISO timestamp (ticks every second). Null when there is no deadline. */
export function useCountdown(iso: string | null | undefined): number | null {
  const target = iso ? new Date(iso).getTime() : null;
  const calc = () => (target === null || Number.isNaN(target) ? null : Math.max(0, Math.floor((target - Date.now()) / 1000)));
  const [left, setLeft] = useState<number | null>(calc);
  useEffect(() => {
    setLeft(calc());
    if (target === null) return;
    const t = window.setInterval(() => setLeft(calc()), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso]);
  return left;
}

export function formatCountdown(seconds: number): string {
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${seconds % 60}s`;
}
