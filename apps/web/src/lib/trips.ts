/**
 * The Trips module's client logic, kept out of the pages so it can be tested.
 *
 *   * filters <-> the URL <-> the server's query string, one mapping;
 *   * money in MINOR UNITS, formatted per currency and locale (the console
 *     shows the exact amount, paise and cents included: an operator
 *     refunding ₹500.50 must see the 50);
 *   * times in the TRIP'S city time zone, which the server sends;
 *   * which actions to draw for this operator on this trip;
 *   * what a write's answer means: done now, or sent to a checker (HTTP 202).
 */
import type { AdminAccess } from './adminScope';
import { can } from './adminScope';

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type TripFilters = {
  status: string[];
  dateFrom: string;
  dateTo: string;
  scope: string;
  paymentMethod: string;
  vehicleType: string;
  stale: boolean;
  flagged: boolean;
  hasSos: boolean;
  id: string;
  ordering: string;
  page: number;
  pageSize: number;
};

export const DEFAULT_FILTERS: TripFilters = {
  status: [], dateFrom: '', dateTo: '', scope: '', paymentMethod: '', vehicleType: '',
  stale: false, flagged: false, hasSos: false, id: '', ordering: '-requested_at',
  page: 1, pageSize: 50,
};

export const STATUS_OPTIONS = [
  ['requested', 'Requested'],
  ['accepted', 'Accepted'],
  ['reached', 'Driver arrived'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
  ['cancelled', 'Cancelled'],
] as const;

export const SORT_OPTIONS = [
  ['-requested_at', 'Newest first'],
  ['requested_at', 'Oldest first'],
  ['-fare', 'Highest fare'],
  ['fare', 'Lowest fare'],
  ['status', 'Status'],
] as const;

export const PAGE_SIZES = [20, 50, 100] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^\d+$/;

/** Filters from the page URL. Anything malformed is dropped, not guessed. */
export function filtersFromSearch(params: URLSearchParams): TripFilters {
  const known = new Set<string>(STATUS_OPTIONS.map(([v]) => v));
  const sorts = new Set<string>(SORT_OPTIONS.map(([v]) => v));
  const date = (v: string | null) => (v && DATE.test(v) ? v : '');
  const page = Number(params.get('page'));
  const size = Number(params.get('page_size'));
  return {
    status: (params.get('status') ?? '').split(',').filter((s) => known.has(s)),
    dateFrom: date(params.get('date_from')),
    dateTo: date(params.get('date_to')),
    scope: params.get('scope') ?? '',
    paymentMethod: params.get('payment_method') ?? '',
    vehicleType: params.get('vehicle_type') ?? '',
    stale: params.get('stale') === 'true',
    flagged: params.get('flagged') === 'true',
    hasSos: params.get('has_sos') === 'true',
    id: ID.test(params.get('id') ?? '') ? (params.get('id') as string) : '',
    ordering: sorts.has(params.get('ordering') ?? '') ? (params.get('ordering') as string) : DEFAULT_FILTERS.ordering,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_FILTERS.pageSize,
  };
}

/**
 * The query string for both the page URL and the API. Defaults are left out,
 * so a shared link stays short and "no filter" is the empty string.
 */
export function filtersToQuery(f: TripFilters): string {
  const q = new URLSearchParams();
  if (f.status.length) q.set('status', f.status.join(','));
  if (f.dateFrom) q.set('date_from', f.dateFrom);
  if (f.dateTo) q.set('date_to', f.dateTo);
  if (f.scope) q.set('scope', f.scope);
  if (f.paymentMethod) q.set('payment_method', f.paymentMethod);
  if (f.vehicleType) q.set('vehicle_type', f.vehicleType);
  if (f.stale) q.set('stale', 'true');
  if (f.flagged) q.set('flagged', 'true');
  if (f.hasSos) q.set('has_sos', 'true');
  if (f.id.trim()) q.set('id', f.id.trim());
  if (f.ordering && f.ordering !== DEFAULT_FILTERS.ordering) q.set('ordering', f.ordering);
  if (f.page > 1) q.set('page', String(f.page));
  if (f.pageSize !== DEFAULT_FILTERS.pageSize) q.set('page_size', String(f.pageSize));
  return q.toString();
}

/** The API path; page_size is always sent so the server's default cannot drift. */
export function tripsApiPath(f: TripFilters): string {
  const q = new URLSearchParams(filtersToQuery(f));
  q.set('page_size', String(f.pageSize));
  return `/ride/admin/trips/?${q.toString()}`;
}

/** How many filters narrow the list (sort and paging are not filters). */
export function activeFilterCount(f: TripFilters): number {
  return [
    f.status.length > 0, Boolean(f.dateFrom || f.dateTo), Boolean(f.scope),
    Boolean(f.paymentMethod), Boolean(f.vehicleType), f.stale, f.flagged, f.hasSos,
    Boolean(f.id.trim()),
  ].filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Money in minor units
// ---------------------------------------------------------------------------

/** Digits after the point, per ISO 4217 (the server's base.money.CURRENCIES). */
const EXPONENT: Record<string, number> = { INR: 2, USD: 2, JPY: 0, KWD: 3 };
const LOCALE: Record<string, string> = { INR: 'en-IN', USD: 'en-US' };

export function exponentOf(currency: string | null | undefined): number {
  return EXPONENT[(currency ?? '').toUpperCase()] ?? 2;
}

/**
 * "₹1,23,456.50" from 12345650 INR; "$25.00" from 2500 USD.
 *
 * The integer is split into whole and fractional parts as text, so no
 * division touches the amount. Returns '—' for no amount; a missing fare is
 * not a zero.
 */
export function formatMinor(
  minor: number | null | undefined,
  currency: string | null | undefined,
  { signed = false }: { signed?: boolean } = {},
): string {
  if (minor === null || minor === undefined || !Number.isInteger(minor)) return '—';
  const code = (currency ?? '').toUpperCase() || 'INR';
  const exp = exponentOf(code);
  const negative = minor < 0;
  const digits = String(Math.abs(minor)).padStart(exp + 1, '0');
  const whole = digits.slice(0, digits.length - exp) || '0';
  const fraction = exp ? digits.slice(digits.length - exp) : '';
  let text: string;
  try {
    // The amount reaches Intl as the decimal TEXT "1234.50" read once, never
    // as a quotient, so it is the exact value at the currency's own scale.
    text = new Intl.NumberFormat(LOCALE[code] ?? 'en', {
      style: 'currency', currency: code, minimumFractionDigits: exp, maximumFractionDigits: exp,
    }).format(Number(fraction ? `${whole}.${fraction}` : whole));
  } catch {
    text = `${code} ${whole}${fraction ? `.${fraction}` : ''}`;
  }
  if (negative) return `−${text}`;
  return signed && minor > 0 ? `+${text}` : text;
}

/**
 * An operator-typed amount ("500", "500.5", "1,200.00") as integer minor
 * units, or null if it is not a valid positive amount in that currency.
 * Parsed as text so "0.1 + 0.2" never happens to money.
 */
export function parseMajorToMinor(
  input: string,
  currency: string | null | undefined,
  { allowNegative = false }: { allowNegative?: boolean } = {},
): number | null {
  const exp = exponentOf(currency);
  const text = input.replace(/[\s,]/g, '');
  const match = /^([-+]?)(\d+)(?:\.(\d*))?$/.exec(text);
  if (!match) return null;
  const [, sign, whole, frac = ''] = match;
  if (frac.length > exp) return null;
  if (sign === '-' && !allowNegative) return null;
  const minor = Number(whole) * 10 ** exp + Number((frac + '0'.repeat(exp)).slice(0, exp) || 0);
  if (!Number.isSafeInteger(minor) || minor === 0) return null;
  return sign === '-' ? -minor : minor;
}

// ---------------------------------------------------------------------------
// Time in the trip's city
// ---------------------------------------------------------------------------

/**
 * The short name of a city's zone as people there say it: "IST", "CDT".
 * Indian English names Indian zones; US English names the rest.
 */
export function cityZoneLabel(timeZone: string | null | undefined): string {
  if (!timeZone) return '';
  try {
    const locale = timeZone.startsWith('Asia/') ? 'en-IN' : 'en-US';
    return new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' })
      .formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    return '';
  }
}

/**
 * "02 Oct, 01:30" in the given IANA zone (the trip's city), 24-hour;
 * with `zone: true`, "02 Oct, 01:30 IST".
 */
export function cityTime(
  iso: string | null | undefined,
  timeZone: string | null | undefined,
  { zone = false }: { zone?: boolean } = {},
): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  let text: string;
  try {
    text = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone ?? undefined, day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(d);
  } catch {
    return iso.replace('T', ' ').slice(0, 16);
  }
  const label = zone ? cityZoneLabel(timeZone) : '';
  return label ? `${text} ${label}` : text;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** What the server says this operator may do here (detail `actions`). */
export type TripActions = {
  cancel: boolean; flag: boolean; note: boolean; refund: boolean;
  refund_action_key: 'support.refund' | 'finance.refund' | null;
  adjust: boolean; reveal: boolean;
  cancel_reasons?: Record<string, string>;
  flag_reasons?: Record<string, string>;
};

export type ActionKey = 'cancel' | 'refund' | 'adjust' | 'flag' | 'note';

/**
 * The buttons to draw, in rail order. The server's per-trip answer wins;
 * without one (an older backend) fall back to what the operator holds
 * anywhere, which only ever shows a control the server may then refuse.
 */
export function visibleActions(actions: TripActions | null | undefined, access: AdminAccess | null): ActionKey[] {
  const has = (key: ActionKey, permission: string) =>
    actions ? Boolean(actions[key]) : can(access, permission);
  const out: ActionKey[] = [];
  if (has('cancel', 'trip.write')) out.push('cancel');
  if (has('refund', 'support.refund')) out.push('refund');
  if (has('adjust', 'finance.adjust')) out.push('adjust');
  if (has('flag', 'trip.write')) out.push('flag');
  if (has('note', 'trip.write')) out.push('note');
  return out;
}

/** Money columns in the list: finance, and the city ops who run the trips. */
export function canSeeMoneyColumns(access: AdminAccess | null): boolean {
  if (!access) return false;
  return can(access, 'trip.read') && (can(access, 'finance.read') || can(access, 'trip.write'));
}

export const BULK_CHECKER_ABOVE = 50;

// ---------------------------------------------------------------------------
// A write's answer
// ---------------------------------------------------------------------------

export type ApprovalBody = {
  state?: string;
  approval_request?: { id: number; status?: string; action_key?: string } | null;
  duplicate?: boolean;
  result?: unknown;
};

export type WriteOutcome =
  | { kind: 'pending'; requestId: number; message: string }
  | { kind: 'done'; requestId: number | null; message: string };

/**
 * Done now (200) or waiting for a checker (202).
 *
 * The client cannot read the HTTP status through `api.post`, so the server
 * says it in the body as well: `state: 'pending_approval'` with the request.
 */
export function interpretWrite(body: ApprovalBody | null | undefined, doneMessage: string): WriteOutcome {
  const request = body?.approval_request ?? null;
  if (body?.state === 'pending_approval' || request?.status === 'requested') {
    const id = request?.id ?? 0;
    return { kind: 'pending', requestId: id, message: `Sent for approval · request #${id}` };
  }
  return { kind: 'done', requestId: request?.id ?? null, message: doneMessage };
}

/** One key per dialog opening: a double click or a retry is the same request. */
export function newIdempotencyKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export const words = (s: string | null | undefined) => (s ?? '—').replace(/_/g, ' ');
