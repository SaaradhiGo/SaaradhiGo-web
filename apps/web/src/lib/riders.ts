/**
 * The Riders module's client logic, kept out of the pages so it can be
 * tested.
 *
 *   * filters <-> the URL <-> the server's query string, one mapping;
 *   * which actions to draw for this operator on this rider (the server's
 *     per-rider answer wins).
 *
 * A rider's id here is their ACCOUNT id: the one Trips calls `rider_id`
 * and the reveal endpoint takes for `target_type: 'rider'`.
 *
 * A rider's city is the city of their latest trip (the server decides
 * scope that way); a rider with no trip has no city.
 *
 * Writes reuse the Trips module's answer handling (`interpretWrite`): a 202
 * is "Sent for approval · request #N", never "done".
 */
import type { AdminAccess } from './adminScope';
import { can } from './adminScope';

export type RiderFilters = {
  scope: string;
  joinedFrom: string;
  joinedTo: string;
  lastTripFrom: string;
  lastTripTo: string;
  tripsMin: string;
  tripsMax: string;
  hasOpenTicket: boolean;
  hadSos: boolean;
  blocked: boolean;
  flagged: boolean;
  lowRating: boolean;
  id: string;
  ordering: string;
  page: number;
  pageSize: number;
};

export const DEFAULT_RIDER_FILTERS: RiderFilters = {
  scope: '', joinedFrom: '', joinedTo: '', lastTripFrom: '', lastTripTo: '', tripsMin: '',
  tripsMax: '', hasOpenTicket: false, hadSos: false, blocked: false, flagged: false,
  lowRating: false, id: '', ordering: '-id', page: 1, pageSize: 50,
};

export const RIDER_SORT_OPTIONS = [
  ['-id', 'Newest first'],
  ['-joined', 'Joined (newest)'],
  ['joined', 'Joined (oldest)'],
  ['-trips', 'Most trips'],
  ['-last_trip', 'Rode most recently'],
  ['last_trip', 'Rode longest ago'],
  ['rating', 'Lowest rated'],
] as const;

/** A completed-trips band is one select in the UI and two numbers on the wire. */
export const TRIP_BANDS = [
  ['', '', 'Any number'],
  ['0', '0', 'None completed'],
  ['1', '5', '1 to 5'],
  ['6', '20', '6 to 20'],
  ['21', '', 'More than 20'],
] as const;

export const RIDER_PAGE_SIZES = [20, 50, 100] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^\d+$/;
const COUNT = /^\d{1,6}$/;

/** Filters from the page URL. Anything malformed is dropped, not guessed. */
export function riderFiltersFromSearch(params: URLSearchParams): RiderFilters {
  const sorts = new Set<string>(RIDER_SORT_OPTIONS.map(([v]) => v));
  const date = (v: string | null) => (v && DATE.test(v) ? v : '');
  const count = (v: string | null) => (v && COUNT.test(v) ? v : '');
  const page = Number(params.get('page'));
  const size = Number(params.get('page_size'));
  return {
    scope: params.get('scope') ?? '',
    joinedFrom: date(params.get('joined_from')),
    joinedTo: date(params.get('joined_to')),
    lastTripFrom: date(params.get('last_trip_from')),
    lastTripTo: date(params.get('last_trip_to')),
    tripsMin: count(params.get('trips_min')),
    tripsMax: count(params.get('trips_max')),
    hasOpenTicket: params.get('has_open_ticket') === 'true',
    hadSos: params.get('had_sos') === 'true',
    blocked: params.get('blocked') === 'true',
    flagged: params.get('flagged') === 'true',
    lowRating: params.get('low_rating') === 'true',
    id: ID.test(params.get('id') ?? '') ? (params.get('id') as string) : '',
    ordering: sorts.has(params.get('ordering') ?? '') ? (params.get('ordering') as string) : DEFAULT_RIDER_FILTERS.ordering,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (RIDER_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_RIDER_FILTERS.pageSize,
  };
}

/**
 * The query string for both the page URL and the API. Defaults are left
 * out, so a shared link stays short and "no filter" is the empty string.
 */
export function riderFiltersToQuery(f: RiderFilters): string {
  const q = new URLSearchParams();
  if (f.scope) q.set('scope', f.scope);
  if (f.joinedFrom) q.set('joined_from', f.joinedFrom);
  if (f.joinedTo) q.set('joined_to', f.joinedTo);
  if (f.lastTripFrom) q.set('last_trip_from', f.lastTripFrom);
  if (f.lastTripTo) q.set('last_trip_to', f.lastTripTo);
  if (f.tripsMin) q.set('trips_min', f.tripsMin);
  if (f.tripsMax) q.set('trips_max', f.tripsMax);
  if (f.hasOpenTicket) q.set('has_open_ticket', 'true');
  if (f.hadSos) q.set('had_sos', 'true');
  if (f.blocked) q.set('blocked', 'true');
  if (f.flagged) q.set('flagged', 'true');
  if (f.lowRating) q.set('low_rating', 'true');
  if (f.id.trim()) q.set('id', f.id.trim());
  if (f.ordering && f.ordering !== DEFAULT_RIDER_FILTERS.ordering) q.set('ordering', f.ordering);
  if (f.page > 1) q.set('page', String(f.page));
  if (f.pageSize !== DEFAULT_RIDER_FILTERS.pageSize) q.set('page_size', String(f.pageSize));
  return q.toString();
}

/** The list API path; page_size is always sent. */
export function ridersApiPath(f: RiderFilters): string {
  const q = new URLSearchParams(riderFiltersToQuery(f));
  q.set('page_size', String(f.pageSize));
  return `/rider/admin/?${q.toString()}`;
}

/** How many filters narrow the list (sort and paging are not filters). */
export function activeRiderFilterCount(f: RiderFilters): number {
  return [
    Boolean(f.scope), Boolean(f.joinedFrom || f.joinedTo), Boolean(f.lastTripFrom || f.lastTripTo),
    Boolean(f.tripsMin || f.tripsMax), f.hasOpenTicket, f.hadSos, f.blocked, f.flagged,
    f.lowRating, Boolean(f.id.trim()),
  ].filter(Boolean).length;
}

/** The band a min/max pair came from, for the select's value. */
export function tripBandValue(f: Pick<RiderFilters, 'tripsMin' | 'tripsMax'>): string {
  const band = TRIP_BANDS.find(([min, max]) => min === f.tripsMin && max === f.tripsMax);
  return band ? `${band[0]}|${band[1]}` : '|';
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** What the server says this operator may do here (detail `actions`). */
export type RiderActions = {
  block: boolean;
  unblock: boolean;
  note: boolean;
  flag: boolean;
  unflag: boolean;
  sign_out: boolean;
  reveal: boolean;
  block_reasons?: Record<string, string>;
  flag_reasons?: Record<string, string>;
};

export type RiderActionKey = 'block' | 'unblock' | 'flag' | 'unflag' | 'sign_out' | 'note';

/**
 * The buttons to draw, in rail order. The server's per-rider answer wins;
 * without one (an older backend) fall back to what the operator holds
 * anywhere, which only ever shows a control the server may then refuse.
 */
export function visibleRiderActions(
  actions: RiderActions | null | undefined,
  access: AdminAccess | null,
  rider: { blocked: boolean; flagged?: boolean },
): RiderActionKey[] {
  if (actions) {
    const order: RiderActionKey[] = ['block', 'unblock', 'flag', 'unflag', 'sign_out', 'note'];
    return order.filter((k) => actions[k]);
  }
  if (!can(access, 'rider.write')) return [];
  const out: RiderActionKey[] = [rider.blocked ? 'unblock' : 'block', 'flag'];
  if (rider.flagged) out.push('unflag');
  out.push('sign_out', 'note');
  return out;
}

/** May this operator tick rows for a bulk block / unblock? */
export function canBulkRiders(access: AdminAccess | null): boolean {
  return Boolean(access) && can(access, 'rider.write');
}

export const FALLBACK_BLOCK_REASONS: Record<string, string> = {
  fraud: 'Suspected fraud', abuse: 'Abuse of drivers or staff', safety: 'Safety concern',
  payment: 'Unpaid dues / payment abuse', chargebacks: 'Repeated chargebacks',
  other: 'Other (note required)',
};

export const FALLBACK_FLAG_REASONS: Record<string, string> = {
  fraud_suspicion: 'Fraud suspicion', promo_abuse: 'Promo / referral abuse',
  payment_risk: 'Payment risk', safety: 'Safety', other: 'Other',
};

/** The person's display name, never their number: the server masks a contact-shaped name. */
export function riderName(user: { full_name?: string | null } | null | undefined, id: number): string {
  return user?.full_name?.trim() || `Rider #${id}`;
}
