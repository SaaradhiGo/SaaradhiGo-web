'use client';

import { useMemo, useState } from 'react';
import type { History, HistoryPeriod } from './earnings';
import type { PeriodState } from '@/components/area/driver/PeriodSwitcher';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (s: string) => new Date(`${s}T12:00:00Z`);
const add = (d: Date, days: number) => new Date(d.getTime() + days * 86400000);

/** The local calendar day (yyyy-mm-dd) a timestamp falls on, in the trip's own zone. */
export function localDay(at: string | null | undefined, timeZone?: string | null): string | null {
  if (!at) return null;
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(at));
  } catch { return at.slice(0, 10); }
}

function bounds(period: HistoryPeriod, anchor: string): [string, string, string, string] {
  const d = day(anchor);
  const y = d.getUTCFullYear(); const m = d.getUTCMonth();
  if (period === 'day') return [anchor, anchor, iso(add(d, -1)), iso(add(d, 1))];
  if (period === 'week') {
    const start = add(d, -((d.getUTCDay() + 6) % 7));
    return [iso(start), iso(add(start, 6)), iso(add(start, -7)), iso(add(start, 7))];
  }
  if (period === 'month') {
    const start = new Date(Date.UTC(y, m, 1, 12)); const end = new Date(Date.UTC(y, m + 1, 0, 12));
    return [iso(start), iso(end), iso(new Date(Date.UTC(y, m - 1, 1, 12))), iso(new Date(Date.UTC(y, m + 1, 1, 12)))];
  }
  if (period === 'taxyear') {
    const fy = m >= 3 ? y : y - 1;
    return [`${fy}-04-01`, `${fy + 1}-03-31`, `${fy - 1}-04-01`, `${fy + 1}-04-01`];
  }
  return [`${y}-01-01`, `${y}-12-31`, `${y - 1}-01-01`, `${y + 1}-01-01`];
}

/**
 * The driver Trips period switcher's state for a rider (11 Nov): the same Day, Week, Month, Year
 * and Custom range, with the bounds worked out here because a rider has no earnings history.
 */
export function useRiderPeriod(initial: HistoryPeriod = 'month'): PeriodState {
  const today = iso(new Date());
  const [period, setPeriod] = useState<HistoryPeriod>(initial);
  const [anchor, setAnchor] = useState<string | undefined>(undefined);
  const [range, setRange] = useState<{ start: string; end: string } | null>(null);
  const data = useMemo<History | null>(() => {
    if (period === 'custom') {
      return range ? { period, start: range.start, end: range.end, timezone: '', currency: '', today, joined: null,
        has_prev: false, has_next: false, prev: range.start, next: range.end, summary: {} as History['summary'],
        chart: { unit: 'day', bars: [] } } : null;
    }
    const [start, end, prev, next] = bounds(period, anchor ?? today);
    return { period, start, end, timezone: '', currency: '', today, joined: null, has_prev: true, has_next: next <= today,
      prev, next, summary: {} as History['summary'], chart: { unit: 'day', bars: [] } };
  }, [period, anchor, range, today]);
  return {
    period, range, setRange, setAnchor,
    pick: (p) => { setPeriod(p); setAnchor(undefined); if (p !== 'custom') setRange(null); },
    hist: { state: 'ok', data, retry: () => {} },
  };
}
