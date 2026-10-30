import { describe, expect, it } from 'vitest';
import type { AdminAccess } from './adminScope';
import {
  DEFAULT_DRIVER_FILTERS, activeDriverFilterCount, driverFiltersFromSearch, driverFiltersToQuery,
  driversApiPath, queueApiPath, ratingBandValue, visibleDriverActions, waitingLabel,
  type DriverActions,
} from './drivers';

const access = (permissions: string[]): AdminAccess => ({
  id: 1, email: 'op@example.test', full_name: 'Op', is_superuser: false, is_break_glass: false,
  permissions, roles: [], scopes: [], access_model: 'scoped',
} as unknown as AdminAccess);

const server = (patch: Partial<DriverActions>): DriverActions => ({
  review_documents: false, approve: false, approve_blocked: false, suspend: false, reinstate: false,
  note: false, vehicles: false, deactivate: false, reveal: false, ...patch,
});

describe('driver filters <-> query string', () => {
  it('maps every filter to the server parameter it means', () => {
    const q = driverFiltersToQuery({
      ...DEFAULT_DRIVER_FILTERS, kycState: ['in_review', 'rejected'], scope: 'IN-TG-HYD', online: true,
      vehicleType: ' sedan ', expiringWithin: '30', ratingMin: '4', ratingMax: '4.49',
      joinedFrom: '2026-10-01', joinedTo: '2026-10-31', suspended: true, flagged: true,
      ordering: '-rating', page: 2, pageSize: 20,
    });
    expect(Object.fromEntries(new URLSearchParams(q))).toEqual({
      kyc_state: 'in_review,rejected', scope: 'IN-TG-HYD', online: 'true', vehicle_type: 'sedan',
      expiring_within: '30', rating_min: '4', rating_max: '4.49', joined_from: '2026-10-01',
      joined_to: '2026-10-31', suspended: 'true', flagged: 'true', ordering: '-rating', page: '2',
      page_size: '20',
    });
  });

  it('leaves defaults out, so "no filter" is the empty string', () => {
    expect(driverFiltersToQuery(DEFAULT_DRIVER_FILTERS)).toBe('');
    expect(activeDriverFilterCount(DEFAULT_DRIVER_FILTERS)).toBe(0);
  });

  it('round-trips through the URL and drops what is malformed', () => {
    const f = driverFiltersFromSearch(new URLSearchParams(
      'kyc_state=in_review,bogus&rating_min=9&joined_from=2026/10/01&expiring_within=45&id=12x&ordering=name&page=-1',
    ));
    expect(f.kycState).toEqual(['in_review']);
    expect(f.ratingMin).toBe('');
    expect(f.joinedFrom).toBe('');
    expect(f.expiringWithin).toBe('');
    expect(f.id).toBe('');
    expect(f.ordering).toBe(DEFAULT_DRIVER_FILTERS.ordering);
    expect(f.page).toBe(1);
    const back = driverFiltersFromSearch(new URLSearchParams(driverFiltersToQuery({ ...f, online: true })));
    expect(back).toEqual({ ...f, online: true });
  });

  it('keeps the Command Centre links working', () => {
    const f = driverFiltersFromSearch(new URLSearchParams('approved=false&scope=IN-TG-HYD'));
    expect(f.approved).toBe('false');
    expect(driversApiPath(f)).toBe('/driver/admin/?scope=IN-TG-HYD&approved=false&page_size=50');
    expect(driverFiltersFromSearch(new URLSearchParams('status=online')).status).toBe('online');
  });

  it('sends the tab to the page, never to the API, and the queue its own path', () => {
    const f = { ...DEFAULT_DRIVER_FILTERS, tab: 'queue' as const, scope: 'IN-TG-HYD', online: true };
    expect(driverFiltersToQuery(f)).toContain('tab=queue');
    expect(driversApiPath(f)).not.toContain('tab=');
    expect(queueApiPath(f)).toBe('/driver/admin/kyc-queue/?scope=IN-TG-HYD&page_size=50');
  });

  it('reads a rating band back for the select', () => {
    expect(ratingBandValue({ ratingMin: '4.5', ratingMax: '5' })).toBe('4.5|5');
    expect(ratingBandValue({ ratingMin: '', ratingMax: '' })).toBe('|');
  });
});

describe('role-aware actions', () => {
  it('draws exactly what the server allows on this driver', () => {
    expect(visibleDriverActions(server({ approve: true, note: true }), access([]), { approved: false }))
      .toEqual(['approve', 'note']);
    expect(visibleDriverActions(server({ suspend: true, note: true, deactivate: true }), access([]), { approved: true }))
      .toEqual(['suspend', 'note', 'deactivate']);
    expect(visibleDriverActions(server({}), access(['driver.write']), { approved: true })).toEqual([]);
  });

  it('falls back to the capabilities held when the server sent none', () => {
    const kyc = access(['driver.read', 'driver.kyc', 'pii.view']);
    expect(visibleDriverActions(undefined, kyc, { approved: false })).toEqual(['approve', 'note']);
    const ops = access(['driver.read', 'driver.write']);
    expect(visibleDriverActions(undefined, ops, { approved: true })).toEqual(['suspend', 'note']);
    expect(visibleDriverActions(undefined, ops, { approved: false, suspended: true }))
      .toEqual(['approve', 'reinstate', 'note']);
    expect(visibleDriverActions(undefined, access(['driver.read']), { approved: false })).toEqual([]);
  });
});

describe('waiting time', () => {
  it('reads in days, hours and minutes', () => {
    expect(waitingLabel(2 * 86_400 + 3 * 3600 + 5)).toBe('2d 3h');
    expect(waitingLabel(5 * 3600 + 12 * 60)).toBe('5h 12m');
    expect(waitingLabel(20)).toBe('1m');
    expect(waitingLabel(null)).toBe('—');
  });
});
