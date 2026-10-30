/**
 * The Finance module's client logic (module 7, part A), kept out of the pages
 * so it can be tested.
 *
 *   * money is in MINOR UNITS plus a currency, formatted per currency
 *     (`formatMinor` from trips.ts); the console never sees a float;
 *   * a total is ALWAYS grouped by currency. `groupByCurrency` is the only way
 *     this module adds two amounts, and it refuses to add across currencies by
 *     construction (one bucket per currency code);
 *   * filters <-> the URL <-> the server's query string, one mapping;
 *   * the words for statuses and reconciliation kinds, so a page does not
 *     invent its own.
 */
import { can, type AdminAccess } from './adminScope';
import { formatMinor } from './trips';

export { formatMinor };

// ---------------------------------------------------------------------------
// Currency grouping
// ---------------------------------------------------------------------------

export type CurrencyTotal<K extends string> = { currency: string; count: number } & Record<K, number>;

/**
 * One total per currency over `rows`, for the named integer columns.
 *
 * Rows with no currency are grouped under "unknown" rather than folded into
 * another bucket: an amount whose currency we cannot name is not a rupee and
 * not a dollar. The result is sorted by currency code so the order never
 * depends on which row arrived first.
 */
export function groupByCurrency<R extends { currency?: string | null }, K extends string>(
  rows: readonly R[],
  columns: readonly K[],
  value: (row: R, column: K) => number | null | undefined,
): CurrencyTotal<K>[] {
  const buckets = new Map<string, CurrencyTotal<K>>();
  for (const row of rows) {
    const currency = (row.currency ?? '').toUpperCase() || 'unknown';
    let bucket = buckets.get(currency);
    if (!bucket) {
      bucket = { currency, count: 0 } as CurrencyTotal<K>;
      for (const c of columns) (bucket as Record<string, number>)[c] = 0;
      buckets.set(currency, bucket);
    }
    bucket.count += 1;
    for (const c of columns) {
      const v = value(row, c);
      if (typeof v === 'number' && Number.isFinite(v)) (bucket as Record<string, number>)[c] += v;
    }
  }
  return [...buckets.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isDate = (v: string | null | undefined): v is string => Boolean(v && DATE.test(v));

/** A date a number of days before another, as YYYY-MM-DD (calendar arithmetic, UTC). */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today as YYYY-MM-DD in the browser's own calendar. */
export function todayLocal(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** The longest range the server will aggregate in one request. */
export const MAX_RANGE_DAYS = 92;

export function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Why a range cannot be sent, or null if it can. */
export function rangeProblem(from: string, to: string): string | null {
  if (!isDate(from) || !isDate(to)) return 'Pick both dates.';
  if (to < from) return 'The end date is before the start date.';
  if (rangeDays(from, to) > MAX_RANGE_DAYS) return `Choose at most ${MAX_RANGE_DAYS} days.`;
  return null;
}

export const RANGE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 14 days', days: 14 },
  { label: 'Last 30 days', days: 30 },
] as const;

export function presetRange(days: number, today: string = todayLocal()): { from: string; to: string } {
  return { from: shiftDate(today, -(days - 1)), to: today };
}

// ---------------------------------------------------------------------------
// Filters <-> URL <-> API
// ---------------------------------------------------------------------------

export type ListFilters = {
  from: string;
  to: string;
  status: string;
  method: string;
  currency: string;
  q: string;
  /** A place narrowing the view (`?scope=`); the server refuses one the operator does not hold. */
  scope: string;
  page: number;
};

export const EMPTY_FILTERS: ListFilters = {
  from: '', to: '', status: '', method: '', currency: '', q: '', scope: '', page: 1,
};

export function filtersFromSearch(params: URLSearchParams): ListFilters {
  const page = Number(params.get('page'));
  const date = (v: string | null) => (isDate(v) ? v : '');
  const currency = (params.get('currency') ?? '').toUpperCase();
  return {
    from: date(params.get('from')),
    to: date(params.get('to')),
    status: params.get('status') ?? '',
    method: params.get('method') ?? '',
    currency: /^[A-Z]{3}$/.test(currency) ? currency : '',
    q: (params.get('q') ?? '').trim(),
    scope: (params.get('scope') ?? '').trim(),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

/** The query string for both the page URL and the API; defaults are left out. */
export function filtersToQuery(f: ListFilters): string {
  const q = new URLSearchParams();
  if (f.from) q.set('from', f.from);
  if (f.to) q.set('to', f.to);
  if (f.status) q.set('status', f.status);
  if (f.method) q.set('method', f.method);
  if (f.currency) q.set('currency', f.currency);
  if (f.q) q.set('q', f.q);
  if (f.scope) q.set('scope', f.scope);
  if (f.page > 1) q.set('page', String(f.page));
  return q.toString();
}

export function activeFilterCount(f: ListFilters, ignore: readonly (keyof ListFilters)[] = []): number {
  const skip = new Set<string>(['page', ...ignore]);
  return (Object.keys(f) as (keyof ListFilters)[]).filter((k) => !skip.has(k) && Boolean(f[k])).length;
}

/** The API path for a list or an export: same filters, same meaning. */
export function apiPath(base: string, f: ListFilters, extra: Record<string, string | number> = {}): string {
  const q = new URLSearchParams(filtersToQuery(f));
  q.delete('page');
  if (f.page > 1) q.set('page', String(f.page));
  for (const [k, v] of Object.entries(extra)) q.set(k, String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** The payout tabs, in the order the server sends them; the words are the server's too. */
export const PAYOUT_TABS = [
  'pending', 'approved', 'processed', 'completed', 'failed', 'unresolved', 'rejected',
] as const;
export type PayoutStatus = (typeof PAYOUT_TABS)[number];

export const PAYOUT_LABEL: Record<string, string> = {
  pending: 'Pending approval',
  approved: 'Approved',
  processed: 'Processing',
  completed: 'Paid',
  failed: 'Failed',
  unresolved: 'Unresolved',
  rejected: 'Rejected',
};

export type Tone = 'good' | 'bad' | 'wait' | 'neutral';

export function payoutTone(status: string): Tone {
  switch (status) {
    case 'completed': return 'good';
    case 'failed': case 'unresolved': return 'bad';
    case 'pending': case 'approved': case 'processed': return 'wait';
    default: return 'neutral';
  }
}

export function paymentTone(status: string): Tone {
  switch (status) {
    case 'completed': return 'good';
    case 'failed': return 'bad';
    case 'pending': case 'processing': return 'wait';
    default: return 'neutral';
  }
}

export const PAYMENT_STATUSES = ['pending', 'processing', 'completed', 'failed', 'refunded'] as const;
export const PAYMENT_METHODS = ['online', 'cash', 'wallet', 'deferred'] as const;

/** "3 h 20 min", "2 d 4 h": how long a payout has waited. */
export function ageLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ${minutes % 60 ? `${minutes % 60} min` : ''}`.trim();
  const days = Math.floor(hours / 24);
  return `${days} d ${hours % 24 ? `${hours % 24} h` : ''}`.trim();
}

/** What a ledger entry is called on the statement. */
export const LEDGER_KIND: Record<string, string> = {
  settlement: 'Trip settlement',
  withdrawal_requested: 'Withdrawal requested',
  withdrawal_rejected: 'Withdrawal rejected (returned)',
  withdrawal_returned: 'Payout failed (returned)',
  withdrawal_paid: 'Payout paid',
  withdrawal_rejected_decision: 'Withdrawal rejected',
  adjustment: 'Fare adjustment',
};

/** The two wallet purposes a settlement line comes from. */
export const LEDGER_PURPOSE: Record<string, string> = {
  adjustment: 'Balance adjustment',
  trip_earnings: 'Trip earnings (online trip)',
  trip_commission: 'Commission on a cash trip',
};

export const RECON_KIND_LABEL: Record<string, string> = {
  payment_no_webhook: 'Payment captured without a confirming webhook',
  webhook_no_payment: 'Confirming webhook with no captured payment',
  amount_mismatch: 'Amount or currency differs between payment and webhook',
  trip_no_settlement: 'Completed trip with no settlement',
  settlement_gross_mismatch: "Settlement gross differs from the trip's final fare",
  payout_webhook_not_paid: 'Payout marked processed by webhook, withdrawal not paid',
  payout_stuck: 'Payout stuck in processing',
};

// ---------------------------------------------------------------------------
// Who may do what (hiding is not security; the server refuses regardless)
// ---------------------------------------------------------------------------

export const canExport = (access: AdminAccess | null) => can(access, 'finance.export');
export const canResolve = (access: AdminAccess | null) => can(access, 'finance.adjust');
export const canActOnPayouts = (access: AdminAccess | null) => can(access, 'finance.payout');

// ---------------------------------------------------------------------------
// Payout rows: what the drawer needs
// ---------------------------------------------------------------------------

export type OverviewRow = {
  city: { code: string; name: string } | null;
  day: string;
  currency: string;
  gross_minor: number;
  commission_minor: number;
  driver_net_minor: number;
  refunds_minor: number;
  payouts_paid_minor: number;
  payouts_pending_minor: number;
  payouts_failed_minor: number;
};

export const OVERVIEW_COLUMNS = [
  ['gross_minor', 'Gross collected'],
  ['commission_minor', 'Commission'],
  ['driver_net_minor', 'Driver net'],
  ['refunds_minor', 'Refunds'],
  ['payouts_paid_minor', 'Payouts paid'],
  ['payouts_pending_minor', 'Payouts pending'],
  ['payouts_failed_minor', 'Payouts failed'],
] as const;

/** A city label that never prints "null": rows with no city are "Unplaced". */
export const cityName = (c: { name: string } | null | undefined) => c?.name ?? 'Unplaced';

/**
 * A signed ledger amount: credits read "+", debits "−". The server sends
 * signed integers (credit positive, debit negative).
 */
export function signedMoney(minor: number | null | undefined, currency: string | null | undefined): string {
  return formatMinor(minor, currency, { signed: true });
}
