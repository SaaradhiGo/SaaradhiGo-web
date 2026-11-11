import { describe, expect, it } from 'vitest';
import type { AdminAccess } from './adminScope';
import {
  DEFAULT_RIDER_FILTERS, activeRiderFilterCount, canBulkRiders, riderFiltersFromSearch,
  riderFiltersToQuery, riderName, ridersApiPath, tripBandValue, visibleRiderActions,
  type RiderActions,
} from './riders';

const access = (permissions: string[]): AdminAccess => ({
  id: 1, email: 'op@example.test', full_name: 'Op', is_superuser: false, is_break_glass: false,
  permissions, roles: [], scopes: [], access_model: 'scoped',
} as unknown as AdminAccess);

const server = (patch: Partial<RiderActions>): RiderActions => ({
  block: false, unblock: false, note: false, flag: false, unflag: false, sign_out: false,
  reveal: false, ...patch,
});

describe('rider filters <-> query string', () => {
  it('maps every filter to the server parameter it means', () => {
    const q = riderFiltersToQuery({
      ...DEFAULT_RIDER_FILTERS, scope: 'IN-TG-HYD', joinedFrom: '2026-10-01', joinedTo: '2026-10-31',
      lastTripFrom: '2026-10-20', lastTripTo: '2026-10-28', tripsMin: '6', tripsMax: '20',
      hasOpenTicket: true, hadSos: true, blocked: true, flagged: true, lowRating: true, id: ' 23 ',
      ordering: '-last_trip', page: 3, pageSize: 20,
    });
    expect(Object.fromEntries(new URLSearchParams(q))).toEqual({
      scope: 'IN-TG-HYD', joined_from: '2026-10-01', joined_to: '2026-10-31',
      last_trip_from: '2026-10-20', last_trip_to: '2026-10-28', trips_min: '6', trips_max: '20',
      has_open_ticket: 'true', had_sos: 'true', blocked: 'true', flagged: 'true', low_rating: 'true',
      id: '23', ordering: '-last_trip', page: '3', page_size: '20',
    });
  });

  it('leaves defaults out, so "no filter" is the empty string', () => {
    expect(riderFiltersToQuery(DEFAULT_RIDER_FILTERS)).toBe('');
    expect(activeRiderFilterCount(DEFAULT_RIDER_FILTERS)).toBe(0);
  });

  it('round-trips through the URL and drops what is malformed', () => {
    const f = riderFiltersFromSearch(new URLSearchParams(
      'blocked=true&trips_min=0&trips_max=0&joined_from=2026/10/01&last_trip_to=2026-10-28'
      + '&ordering=name&page=-2&page_size=7&id=12a&had_sos=yes',
    ));
    expect(f).toEqual({
      ...DEFAULT_RIDER_FILTERS, blocked: true, tripsMin: '0', tripsMax: '0', lastTripTo: '2026-10-28',
    });
    expect(riderFiltersFromSearch(new URLSearchParams(riderFiltersToQuery(f)))).toEqual(f);
    expect(activeRiderFilterCount(f)).toBe(3);
    expect(tripBandValue(f)).toBe('0|0');
  });

  it('always sends a page size to the API', () => {
    expect(ridersApiPath(DEFAULT_RIDER_FILTERS)).toBe('/rider/admin/?page_size=50');
    expect(ridersApiPath({ ...DEFAULT_RIDER_FILTERS, flagged: true, page: 2 }))
      .toBe('/rider/admin/?flagged=true&page=2&page_size=50');
  });
});

describe('role-aware actions', () => {
  it('follows the server answer when there is one', () => {
    expect(visibleRiderActions(server({ block: true, flag: true, sign_out: true, note: true }), access([]), { blocked: false }))
      .toEqual(['block', 'flag', 'sign_out', 'note']);
    expect(visibleRiderActions(server({ unblock: true, unflag: true }), access(['rider.block']), { blocked: true }))
      .toEqual(['unblock', 'unflag']);
  });

  it('a read-only role sees no actions', () => {
    expect(visibleRiderActions(server({}), access(['rider.read', 'pii.view']), { blocked: false })).toEqual([]);
    expect(visibleRiderActions(undefined, access(['rider.read']), { blocked: false })).toEqual([]);
  });

  it('without a server answer falls back to each capability', () => {
    expect(visibleRiderActions(undefined, access(['rider.block', 'rider.flag', 'rider.signout', 'rider.note']), { blocked: true, flagged: true }))
      .toEqual(['unblock', 'flag', 'unflag', 'sign_out', 'note']);
    expect(visibleRiderActions(undefined, access(['rider.note', 'rider.flag', 'rider.signout']), { blocked: false }))
      .toEqual(['flag', 'sign_out', 'note']);
    expect(visibleRiderActions(undefined, access(['rider.note']), { blocked: false })).toEqual(['note']);
  });

  it('bulk is for rider.block only', () => {
    expect(canBulkRiders(access(['rider.read']))).toBe(false);
    expect(canBulkRiders(access(['rider.read', 'rider.flag', 'rider.note']))).toBe(false);
    expect(canBulkRiders(access(['rider.read', 'rider.block']))).toBe(true);
    expect(canBulkRiders(null)).toBe(false);
  });

  it('never shows a number as a name', () => {
    expect(riderName({ full_name: '  ' }, 23)).toBe('Rider #23');
    expect(riderName({ full_name: 'L•••• D••' }, 23)).toBe('L•••• D••');
  });
});
