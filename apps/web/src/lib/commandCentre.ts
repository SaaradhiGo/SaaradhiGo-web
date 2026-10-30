/**
 * The Command Centre's data: what the overview and alerts endpoints send,
 * and how a number from them is shown.
 *
 * MONEY IS NEVER ADDED ACROSS CURRENCIES. The server sends one entry per
 * currency in integer minor units; this file turns each into its own tile
 * in the locale that currency is read in (₹1,23,456.00 in en-IN, $1,234.56
 * in en-US) and never produces a combined figure. There is deliberately no
 * `total` helper here.
 *
 * A RATE WITH NOTHING TO DIVIDE BY IS null, NOT 0. The server already says
 * so; every formatter here keeps the distinction, because "0 % unfulfilled"
 * and "no requests yet" are different facts and an operator acts on the
 * first.
 *
 * DELTAS ARE DRAWN FROM WHAT THE SERVER SENT. Each figure arrives as
 * `{now, last_week}`; `delta()` compares the two and answers null when the
 * comparison is meaningless (no last-week counterpart, or last week was
 * zero), so a tile shows no trend rather than an invented one.
 */

import { ApiError, api } from '@/lib/api';
import { withScope } from '@/lib/adminScope';

export type Window = 'today' | '24h' | '7d';
export const WINDOWS: ReadonlyArray<{ key: Window; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '24h', label: '24 h' },
  { key: '7d', label: '7 d' },
];

export type Pair = { now: number | null; last_week: number | null };
export type MoneyPair = { now_minor: number; last_week_minor: number | null };
export type MoneyByCurrency = Record<string, MoneyPair>;

export type CityRow = {
  code: string;
  name: string;
  status: string;
  country: string;
  currency: string;
  timezone: string;
  window: { key: Window; start: string; end: string; last_week_start: string; last_week_end: string };
  trips: { requested: Pair; accepted: Pair; completed: Pair; cancelled: Pair; unfulfilled: Pair };
  rates: { unfulfilled_rate: Pair; acceptance_rate: Pair; avg_eta_minutes: Pair };
  /** Absent when the caller holds no `finance.read`. */
  money?: { collected: MoneyByCurrency; withdrawals_pending_sum: MoneyByCurrency };
  drivers: { online_now: Pair; online_source: 'presence' | 'db'; active: Pair };
  riders: { active_24h: Pair };
  queues: {
    /** Live SOS: absent unless the caller can respond (safety.respond or City Ops). */
    sos_open?: Pair;
    sos_oldest_open_minutes?: number;
    sos_raised?: Pair;
    tickets_open: Pair;
    tickets_raised: Pair;
    withdrawals_pending?: Pair;
    withdrawals_oldest_pending_hours?: number;
    withdrawals_requested?: Pair;
    kyc_awaiting: Pair;
    alerts_open: Pair;
  };
};

export type Overview = {
  /** Aggregate money tiles per city (finance.aggregate); absent from an older server. */
  finance?: import('./financeActions').FinanceBlock;
  window: Window;
  generated_at: string;
  scope: string | null;
  money_visible: boolean;
  sos_visible?: boolean;
  definitions: Record<string, string>;
  cities: CityRow[];
  cached?: boolean;
};

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type OperatorAlert = {
  id: number;
  kind: string;
  severity: AlertSeverity;
  title: string;
  payload: {
    city?: string;
    city_name?: string;
    metric?: string;
    metric_label?: string;
    unit?: 'percent' | 'minutes' | 'hours' | 'count';
    direction?: 'above' | 'below';
    window?: string;
    value?: number | null;
    threshold?: string | null;
    sos_id?: number;
    [key: string]: unknown;
  };
  source_type: string;
  source_id: string;
  city: string | null;
  city_name: string | null;
  created_at: string;
  acknowledged_at: string | null;
  acknowledged_by: number | null;
  acknowledged_note: string;
  /** The capability that may take it; null means nobody can, over the API. */
  ack_permission: string | null;
};

export type AlertsPage = {
  count: number;
  open_count: number;
  limit: number;
  offset: number;
  results: OperatorAlert[];
};

// ---------------------------------------------------------------------------
// Locale and currency
// ---------------------------------------------------------------------------

/**
 * Which locale a country's numbers are read in. India groups by lakh
 * (12,34,567); the US by thousand (1,234,567). Unknown countries fall back
 * to the browser's own rather than to either market's habit.
 */
const LOCALES: Record<string, string> = { IN: 'en-IN', US: 'en-US' };

export function localeFor(country: string | null | undefined): string | undefined {
  if (!country) return undefined;
  return LOCALES[country.toUpperCase()];
}

/** The country a currency belongs to, for formatting an amount on its own. */
const CURRENCY_COUNTRY: Record<string, string> = { INR: 'IN', USD: 'US' };

/** Minor units per major unit. Both live currencies use two decimals. */
const EXPONENT: Record<string, number> = { INR: 2, USD: 2 };

export function minorToMajor(minor: number, currency: string): number {
  const exp = EXPONENT[currency.toUpperCase()] ?? 2;
  return minor / 10 ** exp;
}

/**
 * One amount in one currency, in that currency's own locale: "₹2,100.00",
 * "$40.00". Never called with a sum of two currencies, because nothing in
 * this file can produce one.
 */
export function formatMoneyMinor(minor: number | null | undefined, currency: string): string | null {
  if (minor === null || minor === undefined || !Number.isFinite(minor)) return null;
  const code = currency.toUpperCase();
  const locale = localeFor(CURRENCY_COUNTRY[code]) ?? undefined;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2,
    }).format(minorToMajor(minor, code));
  } catch {
    return `${code} ${minorToMajor(minor, code).toFixed(2)}`;
  }
}

/** A count in the country's locale: 12,345 (en-US) or 12,345 / 1,23,456 (en-IN). */
export function formatCount(value: number | null | undefined, country?: string | null): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat(localeFor(country)).format(value);
  } catch {
    return String(value);
  }
}

/** A percentage with one decimal: "20.0%". null stays null. */
export function formatRate(value: number | null | undefined, country?: string | null): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat(localeFor(country), {
      style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1,
    }).format(value / 100);
  } catch {
    return `${value.toFixed(1)}%`;
  }
}

/** "10.0 min" -- the ETA as the brief writes it. null stays null. */
export function formatMinutes(value: number | null | undefined, country?: string | null): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const digits = new Intl.NumberFormat(localeFor(country), {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  }).format(value);
  return `${digits} min`;
}

// ---------------------------------------------------------------------------
// Deltas
// ---------------------------------------------------------------------------

export type Delta = {
  /** Positive is "more than last week". */
  value: number;
  /** `pct` for counts and money (relative); `pp` for rates (absolute points). */
  unit: 'pct' | 'pp';
  /** Whether more is better, for the colour. */
  good: boolean | null;
};

/**
 * The movement since the same window last week, or null when there is no
 * honest comparison: no last-week value, or a last-week value of zero
 * (a change from 0 to anything is not a percentage).
 *
 * `direction` says which way is good: `up` for completed trips and
 * collected money, `down` for cancellations and the unfulfilled rate,
 * `none` for figures that are neither.
 */
export function delta(
  now: number | null | undefined,
  then: number | null | undefined,
  kind: 'count' | 'rate' = 'count',
  direction: 'up' | 'down' | 'none' = 'none',
): Delta | null {
  if (now === null || now === undefined || then === null || then === undefined) return null;
  if (!Number.isFinite(now) || !Number.isFinite(then)) return null;
  let value: number;
  let unit: Delta['unit'];
  if (kind === 'rate') {
    value = now - then;
    unit = 'pp';
  } else {
    if (then === 0) return null;
    value = ((now - then) / then) * 100;
    unit = 'pct';
  }
  const good = direction === 'none' || value === 0 ? null : (value > 0) === (direction === 'up');
  return { value, unit, good };
}

/** "▲ 12%" / "▼ 3.0 pp" / "■ 0%". */
export function formatDelta(d: Delta | null, country?: string | null): string | null {
  if (!d) return null;
  const arrow = d.value > 0 ? '▲' : d.value < 0 ? '▼' : '■';
  const magnitude = Math.abs(d.value);
  const digits = new Intl.NumberFormat(localeFor(country), {
    minimumFractionDigits: d.unit === 'pp' ? 1 : 0,
    maximumFractionDigits: d.unit === 'pp' ? 1 : 0,
  }).format(magnitude);
  return `${arrow} ${digits}${d.unit === 'pp' ? ' pp' : '%'}`;
}

// ---------------------------------------------------------------------------
// Money tiles: one per currency, by construction
// ---------------------------------------------------------------------------

export type MoneyTile = {
  currency: string;
  label: string;
  value: string;
  delta: Delta | null;
};

/**
 * One tile per currency the server reported. Two currencies make two tiles;
 * there is no code path that puts them in one.
 */
export function moneyTiles(
  money: MoneyByCurrency | null | undefined,
  label: string,
  direction: 'up' | 'down' | 'none' = 'up',
): MoneyTile[] {
  if (!money) return [];
  return Object.keys(money).sort().map((currency) => {
    const pair = money[currency];
    return {
      currency,
      label: `${label} (${currency})`,
      value: formatMoneyMinor(pair.now_minor, currency) ?? '—',
      delta: delta(pair.now_minor, pair.last_week_minor, 'count', direction),
    };
  });
}

// ---------------------------------------------------------------------------
// Alerts: words for a threshold crossing
// ---------------------------------------------------------------------------

export function alertUnit(unit: string | undefined): string {
  switch (unit) {
    case 'percent': return '%';
    case 'minutes': return ' min';
    case 'hours': return ' h';
    default: return '';
  }
}

/** "20% vs 15% line" -- the value against its threshold, or the title. */
export function alertMeasure(alert: OperatorAlert): string | null {
  const p = alert.payload;
  if (p.value === undefined || p.value === null || !p.threshold) return null;
  const unit = alertUnit(p.unit);
  const value = typeof p.value === 'number'
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(p.value)
    : String(p.value);
  return `${value}${unit} vs ${p.threshold}${unit} line`;
}

// ---------------------------------------------------------------------------
// Fetching
// ---------------------------------------------------------------------------

export const OVERVIEW_PATH = '/command-centre/admin/overview/';
export const ALERTS_PATH = '/command-centre/admin/alerts/';

export function overviewPath(window: Window, city?: string | null): string {
  const base = `${OVERVIEW_PATH}?window=${window}`;
  // A city chosen on the page narrows further than the top bar's region;
  // the server intersects it with what the operator holds either way.
  return city ? `${base}&scope=${encodeURIComponent(city)}` : withScope(base);
}

export function alertsPath(city?: string | null): string {
  const base = `${ALERTS_PATH}?open=1&limit=50`;
  return city ? `${base}&city=${encodeURIComponent(city)}` : withScope(base);
}

export async function fetchOverview(window: Window, city?: string | null): Promise<Overview> {
  return api.get<Overview>(overviewPath(window, city));
}

export async function fetchAlerts(city?: string | null): Promise<AlertsPage> {
  return api.get<AlertsPage>(alertsPath(city));
}

export async function acknowledgeAlert(id: number, note = ''): Promise<OperatorAlert> {
  return api.post<OperatorAlert>(`${ALERTS_PATH}${id}/acknowledge/`, { note });
}

export function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && err.status === 403;
}

export function messageFor(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.fromServer ? err.message : fallback;
}

export const CITY_KEY = 'saaradhi_cc_city';
export const WINDOW_KEY = 'saaradhi_cc_window';

export function readStored(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key) || null;
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    /* private mode: the choice simply is not remembered */
  }
}

export function isWindow(value: string | null | undefined): value is Window {
  return value === 'today' || value === '24h' || value === '7d';
}
