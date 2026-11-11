import { describe, expect, it } from 'vitest';
import { driverFiltersFromSearch } from './drivers';
import { riderFiltersFromSearch } from './riders';
import { supportFiltersFromSearch } from './supportDesk';
import { activeFilterCount, filtersFromSearch, filtersToQuery, tripsApiPath } from './trips';

const q = (s: string) => new URLSearchParams(s);

describe('column headers sort on the server, either way', () => {
  it('keeps both directions of every field the server sorts by', () => {
    expect(driverFiltersFromSearch(q('ordering=trips')).ordering).toBe('trips');
    expect(driverFiltersFromSearch(q('ordering=-joined')).ordering).toBe('-joined');
    expect(riderFiltersFromSearch(q('ordering=-rating')).ordering).toBe('-rating');
    expect(supportFiltersFromSearch(q('ordering=-priority')).ordering).toBe('-priority');
    expect(filtersFromSearch(q('ordering=-status')).ordering).toBe('-status');
    expect(filtersFromSearch(q('ordering=id')).ordering).toBe('id');
  });
  it('still drops a field the server does not sort by', () => {
    expect(driverFiltersFromSearch(q('ordering=name')).ordering).toBe('-id');
    expect(riderFiltersFromSearch(q('ordering=--id')).ordering).toBe('-id');
    expect(supportFiltersFromSearch(q('ordering=assignee')).ordering).toBe('-created');
    expect(filtersFromSearch(q('ordering=rider')).ordering).toBe('-requested_at');
  });
});

describe('the Stuck view', () => {
  it('reads stuck=1 or stuck=true and sends it to the server', () => {
    expect(filtersFromSearch(q('stuck=1')).stuck).toBe(true);
    const f = filtersFromSearch(q('stuck=true'));
    expect(filtersToQuery(f)).toBe('stuck=true');
    expect(tripsApiPath(f)).toContain('stuck=true');
    expect(activeFilterCount(f)).toBe(1);
    expect(filtersFromSearch(q('stuck=no')).stuck).toBe(false);
  });
});
