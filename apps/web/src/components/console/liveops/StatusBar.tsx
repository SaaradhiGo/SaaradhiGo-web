'use client';

import type { Kpis } from '@/lib/liveOps';

/**
 * The top strip's KPI chips. A chip is a word and a number; pressing one filters the
 * attention queue to that kind and turns its map layer on. Danger tone only for open SOS.
 */
export type ChipKey = 'online' | 'onTrip' | 'waiting' | 'sos' | 'stuck' | 'short';

const CHIPS: { key: ChipKey; label: string; value: (k: Kpis) => number; fullOnly: boolean }[] = [
  { key: 'online', label: 'Online', value: (k) => k.online, fullOnly: true },
  { key: 'onTrip', label: 'On a trip', value: (k) => k.onTrip, fullOnly: true },
  { key: 'waiting', label: 'Waiting for a driver', value: (k) => k.waiting, fullOnly: true },
  { key: 'sos', label: 'Open SOS', value: (k) => k.sos, fullOnly: true },
  { key: 'stuck', label: 'Stuck trips', value: (k) => k.stuck, fullOnly: true },
  { key: 'short', label: 'Areas short of drivers', value: (k) => k.short, fullOnly: false },
];

export function StatusBar({
  kpis, full, active, onChip,
}: {
  kpis: Kpis; full: boolean; active: ChipKey | null; onChip: (key: ChipKey) => void;
}) {
  return (
    <ul className="lo-kpis" aria-label="Network at a glance">
      {CHIPS.filter((c) => full || !c.fullOnly).map((c) => {
        const n = c.value(kpis);
        const danger = c.key === 'sos' && n > 0;
        return (
          <li key={c.key}>
            <button
              type="button" className={`lo-kpi ${danger ? 'lo-kpi--danger' : ''}`}
              aria-pressed={active === c.key} onClick={() => onChip(c.key)}
            >
              <b>{n}</b><span>{c.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
