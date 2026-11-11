/**
 * Reports & Analytics (module 14): the console's client logic, kept out of the pages so it can be
 * tested.
 *
 *   * a date range is checked here the way the server checks it (at most 400 days, end not before
 *     start) so a bad range is explained, not bounced;
 *   * money is minor units plus a currency, formatted PER CURRENCY (`formatMinor`: ₹12,34,567.50
 *     and $1,234,567.50 each in their own grouping);
 *   * a total is NEVER summed across currencies: `sumByCurrency` keeps one bucket per currency
 *     code, and every chart draws one panel per currency;
 *   * the query string, the URL and the API path have one mapping.
 */
import { formatMinor } from './trips';

export { formatMinor };

export const MAX_RANGE_DAYS = 400;
export const DEFAULT_RANGE_DAYS = 30;
export const GRANULARITIES = ['day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

export type ColumnType = 'count' | 'money' | 'percent' | 'seconds' | 'hours' | 'km' | 'minutes' | 'text';
export type ReportColumn = { key: string; label: string; type: ColumnType };
export type Row = Record<string, string | number | null | undefined> & { period: string };
export type ReportCard = {
  key: string; area: string; title: string; description: string; money: boolean;
  groups: string[]; default_group: string;
};
export type CityInfo = { code: string; name: string; currency: string; timezone: string };
export type Catalogue = {
  areas: Array<{ area: string; reports: ReportCard[] }>;
  cities: CityInfo[]; vehicle_types: string[]; granularities: Granularity[];
  max_range_days: number; as_of: string | null;
};
export type Cohort = { week: string; size: number; retained: number[]; percent: Array<number | null> };
export type ReportBody = {
  report: ReportCard & { definitions: string[] };
  params: { from: string; to: string; granularity: Granularity; city: string; vehicle: string; group_by: string };
  scope: { cities: CityInfo[] };
  currencies: string[];
  as_of: string | null;
  columns: ReportColumn[];
  rows: Row[];
  totals: Array<Record<string, string | number | null | undefined>>;
  cohorts?: Cohort[];
  extra: {
    funnel?: Array<{ stage: string; count: number }>;
    incident_categories?: Array<{ kind: string; count: number }>;
    sos_types?: Array<{ kind: string; count: number }>;
    kinds?: Array<{ kind: string; raised: number; confirmed: number; dismissed: number }>;
  };
};

// ---------------------------------------------------------------------------
// Dates and the range
// ---------------------------------------------------------------------------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (v: string | null | undefined): v is string => Boolean(v && DATE.test(v));

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayLocal(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

export function rangeDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

/** Why a range cannot be sent, or null if it can (the server's rule, stated first). */
export function rangeProblem(from: string, to: string): string | null {
  if (!isDate(from) || !isDate(to)) return 'Pick both dates.';
  if (to < from) return 'The end date is before the start date.';
  if (rangeDays(from, to) > MAX_RANGE_DAYS) return `Choose at most ${MAX_RANGE_DAYS} days.`;
  return null;
}

export const isGranularity = (v: string | null | undefined): v is Granularity =>
  (GRANULARITIES as readonly string[]).includes(v ?? '');

/** Why the granularity cannot be used with this range, or null. A day-by-day series over a long
 *  range is legal but unreadable; we say so rather than refuse it. */
export function granularityNote(granularity: Granularity, from: string, to: string): string | null {
  if (!isDate(from) || !isDate(to)) return null;
  const days = rangeDays(from, to);
  if (granularity === 'day' && days > 120) {
    return `${days} daily points is a lot to read; weekly or monthly may be clearer.`;
  }
  if (granularity === 'month' && days < 28) return 'Under a month: the single monthly point covers only part of it.';
  return null;
}

export const RANGE_PRESETS = [
  { label: 'Last 7 days', days: 7 }, { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 }, { label: 'Last 12 months', days: 365 },
] as const;

export function presetRange(days: number, today: string = todayLocal()) {
  return { from: shiftDate(today, -(days - 1)), to: today };
}

// ---------------------------------------------------------------------------
// The query
// ---------------------------------------------------------------------------

export type ReportFilters = {
  from: string; to: string; granularity: Granularity; city: string; vehicle: string; group: string;
};

export function filtersFromParams(get: (k: string) => string | null, fallback: { from: string; to: string },
  defaultGroup: string): ReportFilters {
  const from = get('from'); const to = get('to'); const g = get('granularity');
  return {
    from: isDate(from) ? from : fallback.from,
    to: isDate(to) ? to : fallback.to,
    granularity: isGranularity(g) ? g : 'day',
    city: get('city') ?? '', vehicle: get('vehicle') ?? '', group: get('group_by') ?? defaultGroup,
  };
}

export function filtersToQuery(f: ReportFilters): string {
  const q = new URLSearchParams({ from: f.from, to: f.to, granularity: f.granularity });
  if (f.city) q.set('city', f.city);
  if (f.vehicle) q.set('vehicle', f.vehicle);
  if (f.group) q.set('group_by', f.group);
  return q.toString();
}

export const reportPath = (key: string, f: ReportFilters) => `/reports/admin/${key}/?${filtersToQuery(f)}`;
export const exportPath = (key: string, f: ReportFilters) => `/reports/admin/${key}/export/?${filtersToQuery(f)}`;

// ---------------------------------------------------------------------------
// Money: per currency, always
// ---------------------------------------------------------------------------

export type CurrencyBucket = { currency: string } & Record<string, number | string>;

/** One total per currency over `rows` for the named columns; never one number across two currencies.
 *  A row with no currency is grouped as "unknown", not folded into another bucket. */
export function sumByCurrency(
  rows: ReadonlyArray<Record<string, string | number | null | undefined>>, columns: readonly string[],
): CurrencyBucket[] {
  const buckets = new Map<string, CurrencyBucket>();
  for (const row of rows) {
    const currency = String(row.currency ?? '').toUpperCase() || 'unknown';
    let bucket = buckets.get(currency);
    if (!bucket) {
      bucket = { currency } as CurrencyBucket;
      for (const c of columns) bucket[c] = 0;
      buckets.set(currency, bucket);
    }
    for (const c of columns) {
      const v = row[c];
      if (typeof v === 'number' && Number.isFinite(v)) bucket[c] = (bucket[c] as number) + v;
    }
  }
  // Real codes in code order, the unknown bucket last.
  return [...buckets.values()].sort((a, b) => Number(a.currency === 'unknown') - Number(b.currency === 'unknown')
    || a.currency.localeCompare(b.currency));
}

/** The rows of one currency, in period order: one chart panel per currency. */
export function rowsOfCurrency(rows: Row[], currency: string | null): Row[] {
  return rows.filter((r) => (currency === null ? true : String(r.currency ?? '') === currency));
}

/** The currencies a body carries, in code order ([] for a report with no money). */
export function currenciesOf(body: Pick<ReportBody, 'rows' | 'totals'>): string[] {
  const set = new Set<string>();
  for (const r of [...body.rows, ...body.totals]) if (r.currency) set.add(String(r.currency));
  return [...set].sort();
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

export function secondsWords(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60); const rest = s % 60;
  if (m < 60) return rest ? `${m} min ${rest} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

/** A cell, as the table and the tooltip write it. Null is a dash, never a zero. */
export function formatCell(col: ReportColumn, value: unknown, currency?: string | null): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value !== 'number') return String(value);
  switch (col.type) {
    case 'money': return formatMinor(value, currency ?? null);
    case 'percent': return `${value.toFixed(1)}%`;
    case 'seconds': return secondsWords(value);
    case 'hours': return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} h`;
    case 'km': return `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} km`;
    case 'minutes': return `${value.toLocaleString('en-US', { maximumFractionDigits: 0 })} min`;
    default: return value.toLocaleString('en-US');
  }
}

/** "2026-10-05" as a week or month label for the axis. */
export function periodLabel(period: string, granularity: Granularity): string {
  const d = new Date(`${period}T00:00:00Z`);
  if (granularity === 'month') return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// ---------------------------------------------------------------------------
// Chart data
// ---------------------------------------------------------------------------

export type Series = { name: string; values: Array<number | null> };
export type Pivot = { periods: string[]; series: Series[] };

/** Rows -> periods x series for one metric. The series are the group values (vehicle or city) in
 *  first-seen order, so a colour follows the entity and not its rank; rows with no group form one
 *  series named `fallback`. */
export function pivot(rows: Row[], metric: string, fallback: string): Pivot {
  const periods = [...new Set(rows.map((r) => r.period))].sort();
  const names: string[] = [];
  const cell = new Map<string, number | null>();
  for (const r of rows) {
    const name = String(r.vehicle ?? r.city ?? fallback);
    if (!names.includes(name)) names.push(name);
    const v = r[metric];
    cell.set(`${name}|${r.period}`, typeof v === 'number' ? v : null);
  }
  return {
    periods,
    series: names.map((name) => ({ name, values: periods.map((p) => cell.get(`${name}|${p}`) ?? null) })),
  };
}

/** The largest stacked total, for the y axis. */
export function stackMax(p: Pivot): number {
  let max = 0;
  p.periods.forEach((_, i) => {
    max = Math.max(max, p.series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  });
  return max;
}

/** A round axis ceiling and tick values for a maximum (nice numbers: 1, 2, 5 times a power of ten). */
export function niceScale(max: number, ticks = 4): { top: number; ticks: number[] } {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / ticks;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + step / 1000; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return { top, ticks: out };
}

/** The metric each report draws by default. */
export const CHART_DEFAULT: Record<string, string> = {
  trips: 'trips_completed', revenue: 'rider_paid_minor', promotions_cost: 'total_cost_minor',
  payouts: 'paid_minor', supply: 'active_drivers', riders: 'active_riders', support: 'opened',
  safety: 'incidents', fraud: 'raised',
};

/** Columns worth drawing: counts, money, hours (not percentages or averages). */
export function chartableColumns(columns: ReportColumn[]): ReportColumn[] {
  return columns.filter((c) => ['count', 'money', 'hours', 'km', 'minutes'].includes(c.type));
}

export const STAGE_WORDS: Record<string, string> = {
  requested: 'Requested', accepted: 'Accepted', completed: 'Completed',
};

/** "Not vehicle-specific" for the rollup rows that belong to no vehicle class. */
export function groupWord(name: string): string {
  return name === 'unattributed' ? 'Not vehicle-specific' : name;
}
