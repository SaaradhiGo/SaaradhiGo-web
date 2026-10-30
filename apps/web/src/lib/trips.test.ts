import { describe, expect, it } from 'vitest';
import type { AdminAccess } from './adminScope';
import {
  DEFAULT_FILTERS, activeFilterCount, canSeeMoneyColumns, cityTime, filtersFromSearch,
  filtersToQuery, formatMinor, interpretWrite, parseMajorToMinor, tripsApiPath, visibleActions,
  type TripActions,
} from './trips';

const access = (permissions: string[]): AdminAccess => ({
  id: 1, email: 'op@saaradhigo.test', full_name: 'Op', is_superuser: false, is_break_glass: false,
  permissions, roles: [], scopes: [], access_model: 'scoped',
} as unknown as AdminAccess);

describe('money in minor units', () => {
  it('formats rupees with Indian grouping and exact paise', () => {
    expect(formatMinor(12345650, 'INR')).toBe('₹1,23,456.50');
    expect(formatMinor(50_000, 'INR')).toBe('₹500.00');
    expect(formatMinor(1, 'INR')).toBe('₹0.01');
  });

  it('formats dollars in the US locale', () => {
    expect(formatMinor(2500, 'USD')).toBe('$25.00');
    expect(formatMinor(123456789, 'USD')).toBe('$1,234,567.89');
  });

  it('signs adjustments and never prints a missing amount as zero', () => {
    expect(formatMinor(-200_000, 'INR')).toBe('−₹2,000.00');
    expect(formatMinor(150, 'INR', { signed: true })).toBe('+₹1.50');
    expect(formatMinor(null, 'INR')).toBe('—');
    expect(formatMinor(12.5 as number, 'INR')).toBe('—');
  });

  it('parses an operator amount as text, never through a float', () => {
    expect(parseMajorToMinor('500', 'INR')).toBe(50_000);
    expect(parseMajorToMinor('500.5', 'INR')).toBe(50_050);
    expect(parseMajorToMinor('0.29', 'INR')).toBe(29);
    expect(parseMajorToMinor('1,200.00', 'INR')).toBe(120_000);
    expect(parseMajorToMinor('5.001', 'INR')).toBeNull();
    expect(parseMajorToMinor('-20', 'INR')).toBeNull();
    expect(parseMajorToMinor('-20', 'INR', { allowNegative: true })).toBe(-2000);
    expect(parseMajorToMinor('0', 'INR')).toBeNull();
    expect(parseMajorToMinor('abc', 'INR')).toBeNull();
  });
});

describe('time in the trip city', () => {
  const iso = '2026-10-01T20:00:00Z';
  it('shows Hyderabad and Austin in their own clocks', () => {
    expect(cityTime(iso, 'Asia/Kolkata')).toBe('02 Oct, 01:30');
    expect(cityTime(iso, 'America/Chicago')).toBe('01 Oct, 15:00');
    expect(cityTime(iso, 'Asia/Kolkata', { zone: true })).toBe('02 Oct, 01:30 IST');
    expect(cityTime(iso, 'America/Chicago', { zone: true })).toMatch(/^01 Oct, 15:00 C[DS]T$/);
  });
  it('says nothing rather than inventing a time', () => {
    expect(cityTime(null, 'Asia/Kolkata')).toBe('—');
    expect(cityTime('not a date', 'Asia/Kolkata')).toBe('—');
  });
});

describe('filters and the query string', () => {
  it('round-trips every filter', () => {
    const f = {
      ...DEFAULT_FILTERS, status: ['requested', 'accepted'], dateFrom: '2026-10-01',
      dateTo: '2026-10-02', scope: 'IN-TG-HYD', paymentMethod: 'cash', vehicleType: 'sedan',
      stale: true, flagged: true, hasSos: true, id: '42', ordering: 'fare', page: 3, pageSize: 100,
    };
    const q = filtersToQuery(f);
    expect(q).toBe('status=requested%2Caccepted&date_from=2026-10-01&date_to=2026-10-02&scope=IN-TG-HYD'
      + '&payment_method=cash&vehicle_type=sedan&stale=true&flagged=true&has_sos=true&id=42'
      + '&ordering=fare&page=3&page_size=100');
    expect(filtersFromSearch(new URLSearchParams(q))).toEqual(f);
    expect(activeFilterCount(f)).toBe(9);
  });

  it('leaves defaults out and always sends a page size to the API', () => {
    expect(filtersToQuery(DEFAULT_FILTERS)).toBe('');
    expect(tripsApiPath(DEFAULT_FILTERS)).toBe('/ride/admin/trips/?page_size=50');
  });

  it('drops malformed values instead of guessing', () => {
    const f = filtersFromSearch(new URLSearchParams(
      'status=bogus,completed&date_from=01/10/2026&id=12a&ordering=rider&page=-1&page_size=7'));
    expect(f.status).toEqual(['completed']);
    expect(f.dateFrom).toBe('');
    expect(f.id).toBe('');
    expect(f.ordering).toBe('-requested_at');
    expect(f.page).toBe(1);
    expect(f.pageSize).toBe(50);
  });
});

describe('role-aware actions', () => {
  const server = (over: Partial<TripActions>): TripActions => ({
    cancel: false, flag: false, note: false, refund: false, refund_action_key: null,
    adjust: false, reveal: false, ...over,
  });

  it('follows the server answer for this trip', () => {
    expect(visibleActions(server({ refund: true, refund_action_key: 'support.refund' }), access(['trip.write'])))
      .toEqual(['refund']);
    expect(visibleActions(server({ cancel: true, flag: true, note: true }), null))
      .toEqual(['cancel', 'flag', 'note']);
    expect(visibleActions(server({ refund: true, adjust: true }), null)).toEqual(['refund', 'adjust']);
  });

  it('falls back to held permissions without a server answer', () => {
    expect(visibleActions(undefined, access(['trip.read']))).toEqual([]);
    expect(visibleActions(undefined, access(['trip.read', 'support.refund']))).toEqual(['refund']);
  });

  it('shows money columns to finance and city ops only', () => {
    expect(canSeeMoneyColumns(access(['trip.read', 'finance.read']))).toBe(true);
    expect(canSeeMoneyColumns(access(['trip.read', 'trip.write']))).toBe(true);
    expect(canSeeMoneyColumns(access(['trip.read', 'support.refund']))).toBe(false);
    expect(canSeeMoneyColumns(access(['trip.read']))).toBe(false);
    expect(canSeeMoneyColumns(null)).toBe(false);
  });
});

describe('a write answered with 202', () => {
  it('reads as sent for approval with the request number', () => {
    const out = interpretWrite({ state: 'pending_approval', approval_request: { id: 17, status: 'requested' } }, 'done');
    expect(out).toEqual({ kind: 'pending', requestId: 17, message: 'Sent for approval · request #17' });
  });
  it('reads a within-limit answer as done', () => {
    expect(interpretWrite({ state: 'executed', approval_request: { id: 3, status: 'executed' } }, 'Refunded.'))
      .toEqual({ kind: 'done', requestId: 3, message: 'Refunded.' });
    expect(interpretWrite(null, 'Note added.')).toEqual({ kind: 'done', requestId: null, message: 'Note added.' });
  });
});
