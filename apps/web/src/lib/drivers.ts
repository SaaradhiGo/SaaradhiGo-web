/**
 * The Drivers & KYC module's client logic, kept out of the pages so it can
 * be tested.
 *
 *   * filters <-> the URL <-> the server's query string, one mapping (the
 *     Command Centre links here with `?approved=false` and `?status=online`,
 *     which keep working);
 *   * which actions to draw for this operator on this driver (the server's
 *     per-driver answer wins);
 *   * how long a driver has waited, in words.
 *
 * Writes reuse the Trips module's answer handling (`interpretWrite`): a 202
 * is "Sent for approval · request #N", never "done".
 */
import type { AdminAccess } from './adminScope';
import { can } from './adminScope';

export type DriverTab = 'all' | 'queue';

export type DriverFilters = {
  tab: DriverTab;
  kycState: string[];
  scope: string;
  online: boolean;
  vehicleType: string;
  expiringWithin: string;
  ratingMin: string;
  ratingMax: string;
  joinedFrom: string;
  joinedTo: string;
  suspended: boolean;
  flagged: boolean;
  /** Kept for the Command Centre's links. */
  approved: '' | 'true' | 'false';
  status: string;
  id: string;
  ordering: string;
  page: number;
  pageSize: number;
};

export const DEFAULT_DRIVER_FILTERS: DriverFilters = {
  tab: 'all', kycState: [], scope: '', online: false, vehicleType: '', expiringWithin: '',
  ratingMin: '', ratingMax: '', joinedFrom: '', joinedTo: '', suspended: false, flagged: false,
  approved: '', status: '', id: '', ordering: '-id', page: 1, pageSize: 50,
};

export const KYC_STATE_OPTIONS = [
  ['pending', 'Awaiting documents'],
  ['in_review', 'In review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
  ['expired', 'Expired documents'],
] as const;

export const DRIVER_SORT_OPTIONS = [
  ['-id', 'Newest first'],
  ['-joined', 'Joined (newest)'],
  ['joined', 'Joined (oldest)'],
  ['-rating', 'Highest rated'],
  ['rating', 'Lowest rated'],
  ['-trips', 'Most trips'],
  ['waiting', 'Waiting longest'],
  ['license_expiry', 'Licence expiring first'],
] as const;

/** A rating band is one select in the UI and two numbers on the wire. */
export const RATING_BANDS = [
  ['', '', 'Any rating'],
  ['0', '2.99', 'Below 3'],
  ['3', '3.99', '3 to 4'],
  ['4', '4.49', '4 to 4.5'],
  ['4.5', '5', '4.5 and above'],
] as const;

export const EXPIRY_WINDOWS = [['', 'Any'], ['7', '7 days'], ['30', '30 days'], ['60', '60 days']] as const;
export const DRIVER_PAGE_SIZES = [20, 50, 100] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^\d+$/;
const RATING = /^\d(\.\d{1,2})?$/;

/** Filters from the page URL. Anything malformed is dropped, not guessed. */
export function driverFiltersFromSearch(params: URLSearchParams): DriverFilters {
  const states = new Set<string>(KYC_STATE_OPTIONS.map(([v]) => v));
  const sorts = new Set<string>(DRIVER_SORT_OPTIONS.map(([v]) => v));
  const windows = new Set<string>(EXPIRY_WINDOWS.map(([v]) => v));
  const date = (v: string | null) => (v && DATE.test(v) ? v : '');
  const rating = (v: string | null) => (v && RATING.test(v) && Number(v) <= 5 ? v : '');
  const page = Number(params.get('page'));
  const size = Number(params.get('page_size'));
  const approved = params.get('approved');
  const expiring = params.get('expiring_within') ?? '';
  return {
    tab: params.get('tab') === 'queue' ? 'queue' : 'all',
    kycState: (params.get('kyc_state') ?? '').split(',').filter((s) => states.has(s)),
    scope: params.get('scope') ?? '',
    online: params.get('online') === 'true',
    vehicleType: params.get('vehicle_type') ?? '',
    expiringWithin: windows.has(expiring) ? expiring : '',
    ratingMin: rating(params.get('rating_min')),
    ratingMax: rating(params.get('rating_max')),
    joinedFrom: date(params.get('joined_from')),
    joinedTo: date(params.get('joined_to')),
    suspended: params.get('suspended') === 'true',
    flagged: params.get('flagged') === 'true',
    approved: approved === 'true' || approved === 'false' ? approved : '',
    status: /^[a-z ]{1,20}$/.test(params.get('status') ?? '') ? (params.get('status') as string) : '',
    id: ID.test(params.get('id') ?? '') ? (params.get('id') as string) : '',
    ordering: sorts.has(params.get('ordering') ?? '') ? (params.get('ordering') as string) : DEFAULT_DRIVER_FILTERS.ordering,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (DRIVER_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_DRIVER_FILTERS.pageSize,
  };
}

/**
 * The query string for both the page URL and the API. Defaults are left
 * out, so a shared link stays short and "no filter" is the empty string.
 */
export function driverFiltersToQuery(f: DriverFilters): string {
  const q = new URLSearchParams();
  if (f.tab === 'queue') q.set('tab', 'queue');
  if (f.kycState.length) q.set('kyc_state', f.kycState.join(','));
  if (f.scope) q.set('scope', f.scope);
  if (f.online) q.set('online', 'true');
  if (f.vehicleType.trim()) q.set('vehicle_type', f.vehicleType.trim());
  if (f.expiringWithin) q.set('expiring_within', f.expiringWithin);
  if (f.ratingMin) q.set('rating_min', f.ratingMin);
  if (f.ratingMax) q.set('rating_max', f.ratingMax);
  if (f.joinedFrom) q.set('joined_from', f.joinedFrom);
  if (f.joinedTo) q.set('joined_to', f.joinedTo);
  if (f.suspended) q.set('suspended', 'true');
  if (f.flagged) q.set('flagged', 'true');
  if (f.approved) q.set('approved', f.approved);
  if (f.status) q.set('status', f.status);
  if (f.id.trim()) q.set('id', f.id.trim());
  if (f.ordering && f.ordering !== DEFAULT_DRIVER_FILTERS.ordering) q.set('ordering', f.ordering);
  if (f.page > 1) q.set('page', String(f.page));
  if (f.pageSize !== DEFAULT_DRIVER_FILTERS.pageSize) q.set('page_size', String(f.pageSize));
  return q.toString();
}

/** The list API path. `tab` is the page's, not the server's; page_size is always sent. */
export function driversApiPath(f: DriverFilters): string {
  const q = new URLSearchParams(driverFiltersToQuery(f));
  q.delete('tab');
  q.set('page_size', String(f.pageSize));
  return `/driver/admin/?${q.toString()}`;
}

/** The KYC queue: its own order (longest waiting first), so only city and paging apply. */
export function queueApiPath(f: DriverFilters): string {
  const q = new URLSearchParams();
  if (f.scope) q.set('scope', f.scope);
  if (f.page > 1) q.set('page', String(f.page));
  q.set('page_size', String(f.pageSize));
  return `/driver/admin/kyc-queue/?${q.toString()}`;
}

/** How many filters narrow the list (tab, sort and paging are not filters). */
export function activeDriverFilterCount(f: DriverFilters): number {
  return [
    f.kycState.length > 0, Boolean(f.scope), f.online, Boolean(f.vehicleType.trim()),
    Boolean(f.expiringWithin), Boolean(f.ratingMin || f.ratingMax),
    Boolean(f.joinedFrom || f.joinedTo), f.suspended, f.flagged, Boolean(f.approved),
    Boolean(f.status), Boolean(f.id.trim()),
  ].filter(Boolean).length;
}

/** The band a min/max pair came from, for the select's value. */
export function ratingBandValue(f: Pick<DriverFilters, 'ratingMin' | 'ratingMax'>): string {
  const band = RATING_BANDS.find(([min, max]) => min === f.ratingMin && max === f.ratingMax);
  return band ? `${band[0]}|${band[1]}` : '|';
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** What the server says this operator may do here (detail `actions`). */
export type DriverActions = {
  review_documents: boolean;
  approve: boolean;
  approve_blocked: boolean;
  suspend: boolean;
  reinstate: boolean;
  note: boolean;
  vehicles: boolean;
  deactivate: boolean;
  reveal: boolean;
  suspend_reasons?: Record<string, string>;
};

export type DriverActionKey = 'approve' | 'suspend' | 'reinstate' | 'note' | 'deactivate';

/**
 * The buttons to draw, in rail order. The server's per-driver answer wins;
 * without one (an older backend) fall back to what the operator holds
 * anywhere, which only ever shows a control the server may then refuse.
 */
export function visibleDriverActions(
  actions: DriverActions | null | undefined,
  access: AdminAccess | null,
  driver: { approved: boolean; suspended?: boolean },
): DriverActionKey[] {
  const out: DriverActionKey[] = [];
  if (actions) {
    if (actions.approve) out.push('approve');
    if (actions.suspend) out.push('suspend');
    if (actions.reinstate) out.push('reinstate');
    if (actions.note) out.push('note');
    if (actions.deactivate) out.push('deactivate');
    return out;
  }
  const kyc = can(access, 'driver.kyc');
  const write = can(access, 'driver.write');
  if ((kyc || write) && !driver.approved) out.push('approve');
  if (write && !driver.suspended) out.push('suspend');
  if (write && driver.suspended) out.push('reinstate');
  if (kyc || write) out.push('note');
  if (can(access, 'driver.deactivate')) out.push('deactivate');
  return out;
}

/** May this operator tick rows for a bulk suspend / reinstate? */
export function canBulkDrivers(access: AdminAccess | null): boolean {
  return Boolean(access) && can(access, 'driver.write');
}

export const FALLBACK_SUSPEND_REASONS: Record<string, string> = {
  documents: 'Document problem', safety: 'Safety concern', fraud: 'Suspected fraud',
  conduct: 'Conduct / complaints', rider_complaints: 'Repeated rider complaints',
  other: 'Other (note required)',
};

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export type KycTone = 'good' | 'bad' | 'wait' | 'neutral';

export const KYC_LABEL: Record<string, [string, KycTone]> = {
  pending: ['Awaiting documents', 'neutral'],
  in_review: ['In review', 'wait'],
  approved: ['Approved', 'good'],
  rejected: ['Rejected', 'bad'],
};

export const REVIEW_LABEL: Record<string, [string, KycTone]> = {
  approved: ['Approved', 'good'],
  rejected: ['Rejected', 'bad'],
  not_reviewed: ['Not reviewed', 'wait'],
  missing: ['Missing', 'neutral'],
};

/** "3d 4h", "5h 12m", "8m" — how long somebody has been waiting. */
export function waitingLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—';
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(m, 1)}m`;
}

/** The person's display name, never their number: the server masks a contact-shaped name. */
export function driverName(user: { full_name?: string | null } | null | undefined, id: number): string {
  return user?.full_name?.trim() || `Driver #${id}`;
}
