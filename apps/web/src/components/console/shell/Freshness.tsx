'use client';

import { useEffect, useState } from 'react';
import { CONSOLE_DATA_LOADED } from '@/lib/api';

/** After this long without a successful read the figures are called stale. */
export const STALE_AFTER_MS = 90_000;

export function freshnessText(lastMs: number | null, nowMs: number): { text: string; stale: boolean } {
  if (lastMs === null) return { text: 'Loading…', stale: false };
  const s = Math.max(0, Math.round((nowMs - lastMs) / 1000));
  const ago = s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`;
  const stale = nowMs - lastMs > STALE_AFTER_MS;
  return { text: stale ? `Not updating · last ${ago}` : `Updated ${ago}`, stale };
}

/**
 * "Updated 5 s ago" (design board A): the last time the console heard from the
 * server. It turns amber and says "Not updating" when the reads stop, so an
 * operator never mistakes a frozen screen for a quiet night.
 */
export function Freshness() {
  const [last, setLast] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const onLoad = (e: Event) => setLast((e as CustomEvent<number>).detail ?? Date.now());
    window.addEventListener(CONSOLE_DATA_LOADED, onLoad);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.removeEventListener(CONSOLE_DATA_LOADED, onLoad); window.clearInterval(tick); };
  }, []);
  const { text, stale } = freshnessText(last, now);
  return (
    <span className={`ops-fresh${stale ? ' ops-fresh--stale' : ''}`} role="status" aria-live="off">
      <span className="ops-fresh__dot" aria-hidden="true" />
      {text}
    </span>
  );
}
