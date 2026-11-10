'use client';

import { ApiError } from '@/lib/api';
import { areaGet, areaToken } from './api';

/**
 * Earnings history (10 Nov v2): any period since the driver joined, every month, and monthly
 * statements, all from the settlement ledger (servers/driver/earnings_history.py). Amounts are
 * decimal strings in `currency`.
 */
export type HistoryPeriod = 'day' | 'week' | 'month' | 'year' | 'taxyear' | 'custom';
export type HistorySummary = {
  trips: number; days_driven: number; fares: string; avg_fare: string; commission: string; daily_fee: string;
  platform_fee: string; tips: string; tip_riders: number; earned: string; paid_to_bank: string; payouts: number;
  cash_collected: string; unresolved_trips: number; fee_note: string; tips_enabled: boolean;
};
export type History = {
  period: HistoryPeriod; start: string; end: string; timezone: string; currency: string; today: string;
  joined: string | null; has_prev: boolean; has_next: boolean; prev: string; next: string;
  summary: HistorySummary;
  chart: { unit: 'hour' | 'day' | 'month'; bars: { key: string; earned: string; trips: number }[] };
};
export type MonthRow = {
  month: string; so_far: boolean; trips: number; fares: string; platform_fee: string; tips: string; earned: string;
  paid_to_bank: string; payouts: number; cash_collected: string;
};
export type Months = { currency: string; joined: string; months: MonthRow[] };

export function history(period: HistoryPeriod, date?: string, range?: { start: string; end: string }) {
  const q = new URLSearchParams({ period });
  if (date) q.set('date', date);
  if (range) { q.set('start', range.start); q.set('end', range.end); }
  return areaGet<History>(`/driver/earnings/history/?${q}`);
}
export const months = () => areaGet<Months>('/driver/earnings/months/');

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

/** A month's statement as a file (`pdf` or `csv`), saved through a Blob: a link cannot carry the token. */
export async function downloadStatement(month: string, as: 'pdf' | 'csv') {
  const token = await areaToken();
  const resp = await fetch(`${BASE}/driver/earnings/statement/?month=${month}&as=${as}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!resp.ok) throw new ApiError(resp.status, 'STATEMENT_FAILED', `HTTP ${resp.status}`, false, null);
  const url = URL.createObjectURL(await resp.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = `saaradhigo-statement-${month}.${as}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
