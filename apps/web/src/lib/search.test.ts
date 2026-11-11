/**
 * The pure half of console search: term gating, grouping four answers,
 * hiding a 403, where a row leads, and how the arrow keys walk the list.
 * No DOM. Run with `npm test` (vitest).
 */
import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import {
  DriverHit, GROUPS, Hit, RiderHit, TripHit, VehicleHit, allForbidden, describeHit,
  flattenOptions, groupResponses, groupStateFromError, hrefFor, isUsableTerm,
  moveActive, searchPath, summarize,
} from './search';

const trip: TripHit = {
  type: 'trip', id: 42, status: 'in_progress', city_code: 'IN-TG-HYD', requested_at: '2026-10-28T06:00:00Z',
  rider: { id: 7, full_name: 'Priya S.', phone: '+91••••••1111' },
  driver: { id: 9, full_name: 'Ravi K.', phone: '+91••••••3210' },
};
const driver: DriverHit = {
  type: 'driver', id: 5, status: 'online', approved: true, doc_status: 'approved', city_code: 'IN-TG-HYD',
  user: { id: 9, full_name: 'Ravi Kumar', phone: '+91••••••3210' },
};
const rider: RiderHit = {
  type: 'rider', id: 3, status: 'active', city_code: null, last_trip_id: 42,
  user: { id: 7, full_name: 'Priya Sharma', phone: '+91••••••1111' },
};
const riderWithoutTrips: RiderHit = { ...rider, id: 4, last_trip_id: null };
const vehicle: VehicleHit = {
  type: 'vehicle', id: 11, plate: 'TS 09 AB 1234', status: 'active', make: 'Maruti Dzire',
  city_code: 'IN-TG-HYD', driver_id: 5, driver: { id: 9, full_name: 'Ravi K.', phone: '+91••••••3210' },
};

const ok = (results: Hit[]) => ({ status: 'fulfilled' as const, value: { kind: 'name' as const, results } });
const failed = (status: number, message = 'nope', fromServer = true) =>
  ({ status: 'rejected' as const, reason: new ApiError(status, 'X', message, fromServer) });

describe('isUsableTerm', () => {
  it('needs two characters, or a single digit', () => {
    expect(isUsableTerm('')).toBe(false);
    expect(isUsableTerm(' ')).toBe(false);
    expect(isUsableTerm('r')).toBe(false);
    expect(isUsableTerm('7')).toBe(true);
    expect(isUsableTerm('ra')).toBe(true);
    expect(isUsableTerm('  +91 98765 43210 ')).toBe(true);
  });
});

describe('searchPath', () => {
  it('encodes the term and asks for a per-group limit', () => {
    expect(searchPath('drivers', ' +91 98765 43210 ')).toBe('/search/admin/drivers/?q=%2B91%2098765%2043210&limit=6');
    expect(searchPath('trips', '42', 3)).toBe('/search/admin/trips/?q=42&limit=3');
  });

  it('covers four groups, each behind its own capability', () => {
    expect(GROUPS.map((g) => [g.key, g.need])).toEqual([
      ['trips', 'trip.read'], ['drivers', 'driver.read'], ['riders', 'rider.read'], ['vehicles', 'driver.read'],
    ]);
  });
});

describe('groupResponses', () => {
  it('reads each answer into its group', () => {
    const state = groupResponses({
      trips: ok([trip]), drivers: ok([driver]), riders: ok([rider]), vehicles: ok([]),
    });
    expect(state.trips).toEqual({ status: 'ok', hits: [trip], kind: 'name' });
    expect(state.vehicles.hits).toEqual([]);
  });

  it('hides a group the server refuses with 403, and a group skipped as not held', () => {
    const state = groupResponses({
      trips: failed(403), drivers: ok([driver]), riders: 'skipped', vehicles: ok([vehicle]),
    });
    expect(state.trips.status).toBe('forbidden');
    expect(state.riders.status).toBe('forbidden');
    expect(allForbidden(state)).toBe(false);
    expect(flattenOptions(state).map((o) => o.group)).toEqual(['drivers', 'vehicles']);
  });

  it('knows when every group is forbidden', () => {
    const state = groupResponses({
      trips: failed(403), drivers: failed(403), riders: 'skipped', vehicles: failed(403),
    });
    expect(allForbidden(state)).toBe(true);
    expect(summarize(state, 'ravi')).toBe('You do not have access to search.');
  });

  it('reports other failures as errors the row can explain', () => {
    expect(groupStateFromError(new ApiError(429, 'THROTTLED', 'slow down', true)))
      .toEqual({ status: 'error', hits: [], error: 'Too many searches; wait a moment.' });
    expect(groupStateFromError(new ApiError(502, 'UNKNOWN_ERROR', 'HTTP 502', false)).error).toBe('Could not search.');
    expect(groupStateFromError(new TypeError('fetch failed')).error).toBe('Could not reach the server.');
    // A 400 is the server declining the term (too short); nothing to show, nothing wrong.
    expect(groupStateFromError(new ApiError(400, 'SEARCH_TERM_TOO_SHORT', 'Type more', true)).status).toBe('ok');
  });
});

describe('flattenOptions and moveActive', () => {
  const state = groupResponses({
    trips: ok([trip]), drivers: ok([driver]), riders: ok([rider, riderWithoutTrips]), vehicles: ok([vehicle]),
  });

  it('walks the groups in display order with a running index', () => {
    const options = flattenOptions(state);
    expect(options.map((o) => [o.index, o.group, o.hit.id])).toEqual([
      [0, 'trips', 42], [1, 'drivers', 5], [2, 'riders', 3], [3, 'riders', 4], [4, 'vehicles', 11],
    ]);
  });

  it('wraps at both ends and starts from the right end', () => {
    expect(moveActive(-1, 1, 5)).toBe(0);
    expect(moveActive(-1, -1, 5)).toBe(4);
    expect(moveActive(4, 1, 5)).toBe(0);
    expect(moveActive(0, -1, 5)).toBe(4);
    expect(moveActive(2, 1, 5)).toBe(3);
    expect(moveActive(2, 1, 0)).toBe(-1);
  });
});

describe('hrefFor', () => {
  it('opens trips and drivers directly, riders by their latest trip, vehicles by their driver', () => {
    expect(hrefFor(trip)).toBe('/trips/42');
    expect(hrefFor(driver)).toBe('/drivers/5');
    expect(hrefFor(rider)).toBe('/riders/7');
    expect(hrefFor(riderWithoutTrips)).toBe('/riders/7');
    expect(hrefFor(vehicle)).toBe('/drivers/5');
    expect(hrefFor({ ...vehicle, driver_id: null, driver: null })).toBeNull();
  });
});

describe('describeHit', () => {
  it('shows the phone exactly as the server returned it', () => {
    expect(describeHit(driver).detail).toBe('+91••••••3210');
    expect(describeHit(trip).detail).toBe('Rider Priya S. · +91••••••1111 — Driver Ravi K. · +91••••••3210');
    expect(describeHit(vehicle)).toEqual({
      title: 'TS 09 AB 1234', meta: 'Maruti Dzire · active · IN-TG-HYD', detail: 'Driver Ravi K. · +91••••••3210',
    });
  });

  it('says where a rider leads, or that they lead nowhere yet', () => {
    expect(describeHit(rider).meta).toBe('rider · latest trip #42');
    expect(describeHit(riderWithoutTrips).meta).toBe('rider · no trips yet');
  });

  it('labels a driver still in KYC', () => {
    expect(describeHit({ ...driver, approved: false, doc_status: 'pending' }).meta).toBe('KYC pending · online · IN-TG-HYD');
  });
});

describe('summarize', () => {
  it('counts per group for the live region', () => {
    const state = groupResponses({
      trips: ok([trip]), drivers: ok([driver]), riders: ok([]), vehicles: failed(500),
    });
    expect(summarize(state, 'ravi')).toBe('2 results: 1 trips, 1 drivers; vehicles could not be searched');
  });

  it('says when nothing matched', () => {
    const state = groupResponses({ trips: ok([]), drivers: ok([]), riders: ok([]), vehicles: ok([]) });
    expect(summarize(state, 'zzz')).toBe('No results for zzz');
  });
});
