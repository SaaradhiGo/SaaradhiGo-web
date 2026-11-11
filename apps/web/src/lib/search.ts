/**
 * Console search: the pure half.
 *
 * Everything the search box needs that is not React lives here so it can
 * be tested without a DOM: which endpoints to call, how to read what they
 * answer, how to turn four answers into groups, where a result leads, and
 * how arrow keys move through the list.
 *
 * FOUR ENDPOINTS, FOUR CAPABILITIES. The server gates each result type
 * on its own capability (`trip.read`, `driver.read`, `rider.read`,
 * `driver.read`) and answers 403 for one the operator does not hold. A
 * forbidden group is not an error to show -- it is a group this operator
 * does not have -- so it is hidden, and if every group is hidden the box
 * says so once.
 *
 * WHAT COMES BACK IS ALREADY SAFE TO SHOW. Phones arrive masked for every
 * caller; names arrive masked unless the operator holds `pii.view`. The
 * console renders them as returned and never reconstructs anything.
 */
import { ApiError, api } from '@/lib/api';
import { AdminAccess, can, withScope } from '@/lib/adminScope';

export type SearchKind = 'number' | 'phone' | 'plate' | 'name' | 'unsupported';
export type GroupKey = 'trips' | 'drivers' | 'riders' | 'vehicles';

export type Person = { id: number; full_name: string; phone: string };

export type TripHit = {
  type: 'trip'; id: number; status: string; city_code: string | null;
  requested_at: string | null; rider: Person | null; driver: Person | null;
};
export type DriverHit = {
  type: 'driver'; id: number; status: string; approved: boolean; doc_status: string;
  city_code: string | null; user: Person;
};
export type RiderHit = {
  type: 'rider'; id: number; status: string; city_code: null;
  last_trip_id: number | null; user: Person;
};
export type VehicleHit = {
  type: 'vehicle'; id: number; plate: string; status: string; make: string;
  city_code: string | null; driver_id: number | null; driver: Person | null;
};
export type Hit = TripHit | DriverHit | RiderHit | VehicleHit;

export type SearchResponse = { kind: SearchKind; results: Hit[] };

export const GROUPS: { key: GroupKey; label: string; path: string; need: string }[] = [
  { key: 'trips', label: 'Trips', path: '/search/admin/trips/', need: 'trip.read' },
  { key: 'drivers', label: 'Drivers', path: '/search/admin/drivers/', need: 'driver.read' },
  { key: 'riders', label: 'Riders', path: '/search/admin/riders/', need: 'rider.read' },
  { key: 'vehicles', label: 'Vehicles', path: '/search/admin/vehicles/', need: 'driver.read' },
];

export const DEBOUNCE_MS = 250;
export const PER_GROUP = 6;

/**
 * Mirrors the server's own rule: two characters, or a single digit (the
 * first trips in any database have one-digit ids). Anything shorter is not
 * sent, so a half-typed letter does not cost four requests.
 */
export function isUsableTerm(raw: string): boolean {
  const q = raw.trim();
  return q.length >= 2 || /^\d$/.test(q);
}

export function searchPath(group: GroupKey, q: string, limit = PER_GROUP): string {
  const spec = GROUPS.find((g) => g.key === group)!;
  return withScope(`${spec.path}?q=${encodeURIComponent(q.trim())}&limit=${limit}`);
}

export type GroupStatus = 'ok' | 'forbidden' | 'error' | 'loading';
export type GroupState = { status: GroupStatus; hits: Hit[]; kind?: SearchKind; error?: string };
export type SearchState = Record<GroupKey, GroupState>;

export const EMPTY_STATE: SearchState = {
  trips: { status: 'loading', hits: [] },
  drivers: { status: 'loading', hits: [] },
  riders: { status: 'loading', hits: [] },
  vehicles: { status: 'loading', hits: [] },
};

/** What a failed request means for its group. */
export function groupStateFromError(err: unknown): GroupState {
  if (err instanceof ApiError) {
    if (err.status === 403) return { status: 'forbidden', hits: [] };
    if (err.status === 429) return { status: 'error', hits: [], error: 'Too many searches; wait a moment.' };
    if (err.status === 400) return { status: 'ok', hits: [] };
    return { status: 'error', hits: [], error: err.fromServer ? err.message : 'Could not search.' };
  }
  return { status: 'error', hits: [], error: 'Could not reach the server.' };
}

/**
 * Four settled requests -> one state. A group the operator is already
 * known not to hold is forbidden without a request; see `runSearch`.
 */
export function groupResponses(
  settled: Record<GroupKey, PromiseSettledResult<SearchResponse> | 'skipped'>,
): SearchState {
  const out = { ...EMPTY_STATE };
  for (const { key } of GROUPS) {
    const r = settled[key];
    if (r === 'skipped') out[key] = { status: 'forbidden', hits: [] };
    else if (r.status === 'fulfilled') {
      out[key] = { status: 'ok', hits: Array.isArray(r.value?.results) ? r.value.results : [], kind: r.value?.kind };
    } else out[key] = groupStateFromError(r.reason);
  }
  return out;
}

/**
 * Fire the four requests in parallel and settle them into a state.
 * Groups whose capability the operator is KNOWN not to hold are skipped
 * (no request) and reported as forbidden; a 403 from the server does the
 * same for anything the client could not know.
 */
export async function runSearch(q: string, access: AdminAccess | null): Promise<SearchState> {
  const entries = await Promise.all(GROUPS.map(async ({ key, need }) => {
    if (access && !can(access, need)) return [key, 'skipped'] as const;
    const result = await Promise.allSettled([api.get<SearchResponse>(searchPath(key, q))]);
    return [key, result[0]] as const;
  }));
  return groupResponses(Object.fromEntries(entries) as Record<GroupKey, PromiseSettledResult<SearchResponse> | 'skipped'>);
}

export function visibleGroups(state: SearchState) {
  return GROUPS.filter((g) => state[g.key].status !== 'forbidden');
}

export function allForbidden(state: SearchState): boolean {
  return visibleGroups(state).length === 0;
}

export function isLoading(state: SearchState): boolean {
  return GROUPS.some((g) => state[g.key].status === 'loading');
}

export type Option = { group: GroupKey; hit: Hit; href: string | null; index: number };

/** Every option in display order, so arrow keys have one flat list to walk. */
export function flattenOptions(state: SearchState): Option[] {
  const out: Option[] = [];
  for (const { key } of GROUPS) {
    const g = state[key];
    if (g.status !== 'ok') continue;
    for (const hit of g.hits) out.push({ group: key, hit, href: hrefFor(hit), index: out.length });
  }
  return out;
}

/** Arrow-key movement: wraps at both ends; -1 means nothing is active. */
export function moveActive(current: number, delta: number, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return (((current + delta) % count) + count) % count;
}

/**
 * Where a result opens.
 *
 * Trips, drivers and riders have pages (a rider's page is keyed by their
 * account id, `user.id`). There is no vehicle page yet, so a vehicle opens
 * its driver.
 */
export function hrefFor(hit: Hit): string | null {
  switch (hit.type) {
    case 'trip': return `/trips/${hit.id}`;
    case 'driver': return `/drivers/${hit.id}`;
    case 'rider': return `/riders/${hit.user.id}`;
    case 'vehicle': return hit.driver_id ? `/drivers/${hit.driver_id}` : null;
  }
}

function person(p: Person | null | undefined, role: string): string {
  if (!p) return '';
  const name = p.full_name?.trim();
  return `${role} ${name ? `${name} · ` : ''}${p.phone}`;
}

export type Described = { title: string; meta: string; detail: string };

/** The three lines of a row: what, where/which state, who. Phones as returned. */
export function describeHit(hit: Hit): Described {
  switch (hit.type) {
    case 'trip':
      return {
        title: `Trip #${hit.id}`,
        meta: [hit.status.replace(/_/g, ' '), hit.city_code].filter(Boolean).join(' · '),
        detail: [person(hit.rider, 'Rider'), person(hit.driver, 'Driver')].filter(Boolean).join(' — '),
      };
    case 'driver':
      return {
        title: hit.user.full_name?.trim() || hit.user.phone,
        meta: [
          hit.approved ? 'approved' : `KYC ${hit.doc_status}`,
          hit.status, hit.city_code,
        ].filter(Boolean).join(' · '),
        detail: hit.user.phone,
      };
    case 'rider':
      return {
        title: hit.user.full_name?.trim() || hit.user.phone,
        meta: [hit.status === 'flagged' ? 'flagged for review' : 'rider',
          hit.last_trip_id ? `latest trip #${hit.last_trip_id}` : 'no trips yet'].join(' · '),
        detail: hit.user.phone,
      };
    case 'vehicle':
      return {
        title: hit.plate,
        meta: [hit.make, hit.status.replace(/_/g, ' '), hit.city_code].filter(Boolean).join(' · '),
        detail: person(hit.driver, 'Driver'),
      };
  }
}

/** One line for the live region: what a screen reader hears when results land. */
export function summarize(state: SearchState, q: string): string {
  if (!q.trim()) return '';
  if (isLoading(state)) return 'Searching';
  if (allForbidden(state)) return 'You do not have access to search.';
  const groups = visibleGroups(state).filter((g) => state[g.key].hits.length > 0);
  const total = groups.reduce((n, g) => n + state[g.key].hits.length, 0);
  const errors = visibleGroups(state).filter((g) => state[g.key].status === 'error');
  if (total === 0 && errors.length === 0) return `No results for ${q.trim()}`;
  const parts = groups.map((g) => `${state[g.key].hits.length} ${g.label.toLowerCase()}`);
  const err = errors.length ? `; ${errors.map((g) => g.label.toLowerCase()).join(', ')} could not be searched` : '';
  return `${total} result${total === 1 ? '' : 's'}: ${parts.join(', ')}${err}`;
}
