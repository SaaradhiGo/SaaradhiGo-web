'use client';

import type { ReactNode } from 'react';
import type { FilterChip, ListView } from '@/components/console/kit/ListPage';
import type { ChipTone } from '@/components/console/kit/StatusChip';
import { type ListFilters, formatWhole } from '@/lib/finance';

/**
 * What the Money pages share on top of the list kit: the filter chips read
 * from the URL filters, the status words and colours, and the per-currency
 * totals line. Totals are never added across currencies.
 */

/** "payment_no_webhook" -> "Payment no webhook". */
export function words(value: string | null | undefined): string {
  if (!value) return '—';
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A payment's status: done is good, failed needs watching, in flight is waiting. */
export function paymentChipTone(status: string): ChipTone {
  switch (status) {
    case 'completed': return 'good';
    case 'failed': return 'caution';
    case 'pending': case 'processing': return 'info';
    default: return 'neutral';
  }
}

/** Views for a list filtered by `status`; the active one carries the server's count. */
export function statusViews(
  statuses: readonly string[], current: string, total: number | null | undefined, allLabel = 'All',
): ListView[] {
  return [
    { key: '', label: allLabel, count: current === '' ? total ?? null : undefined },
    ...statuses.map((s) => ({ key: s, label: words(s), count: current === s ? total ?? null : undefined })),
  ];
}

/** One chip per filter in use (status is a view, so it is not a chip). */
export function financeChips(
  filters: ListFilters,
  go: (next: ListFilters) => void,
  { methodLabel = 'Method', qLabel = 'Search' }: { methodLabel?: string; qLabel?: string } = {},
): FilterChip[] {
  const chips: FilterChip[] = [];
  const drop = (patch: Partial<ListFilters>) => () => go({ ...filters, ...patch, page: 1 });
  if (filters.from && filters.to) {
    chips.push({ key: 'range', label: `${filters.from} to ${filters.to}`, onRemove: drop({ from: '', to: '' }) });
  }
  if (filters.method) chips.push({ key: 'method', label: `${methodLabel}: ${words(filters.method)}`, onRemove: drop({ method: '' }) });
  if (filters.currency) chips.push({ key: 'currency', label: `Currency: ${filters.currency}`, onRemove: drop({ currency: '' }) });
  if (filters.q) chips.push({ key: 'q', label: `${qLabel}: ${filters.q}`, onRemove: drop({ q: '' }) });
  if (filters.scope) chips.push({ key: 'scope', label: `Place: ${filters.scope}`, onRemove: drop({ scope: '' }) });
  return chips;
}

/** The filters as a query string, for "Save this view" (page left out). */
export function savedQuery(query: string): string {
  const q = new URLSearchParams(query);
  q.delete('page');
  return q.toString();
}

/** "₹1,84,200 INR · 412 payments  ·  $9,120 USD · 31 payments", whole units. */
export function CurrencyTotals({
  totals, noun, amount,
}: {
  totals: ReadonlyArray<{ currency: string; count: number } & Record<string, unknown>>;
  noun: string;
  amount: string;
}): ReactNode {
  if (!totals || totals.length === 0) return null;
  return totals.map((t, i) => {
    const minor = t[amount];
    return (
      <span key={t.currency}>
        {i > 0 ? ' · ' : ''}
        {formatWhole(typeof minor === 'number' ? minor : null, t.currency)} over {t.count.toLocaleString('en-IN')} {noun}{t.count === 1 ? '' : 's'}
      </span>
    );
  });
}
