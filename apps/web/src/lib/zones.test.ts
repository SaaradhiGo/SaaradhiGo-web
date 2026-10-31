/**
 * The zone helpers: vertices, the draft checks, the scaled outline and the preview
 * wording. Pure functions, no network. The server re-validates every one of these
 * rules; these tests hold the client's mirror of them honest.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_AREA_KM2, MIN_AREA_KM2, boundsOf, cardLine, changeBody, changedFields, createBody, draftFromZone,
  draftProblem, impactHeadline, impactWarnings, isEditable, makeProjector, num, outerRing, outerRings,
  pickups, polygonFromRows, previewBody, requestWords, ringAreaKm2, ringFromRows, ringPath,
  rowsFromGeometry, rowsProblem, selfIntersects, transitionWords,
  type Geometry, type Impact, type PendingRequest, type Position, type VertexRow, type Zone,
} from './zones';

const SQUARE: Geometry = {
  type: 'Polygon',
  coordinates: [[[77.5, 12.9], [77.7, 12.9], [77.7, 13.05], [77.5, 13.05], [77.5, 12.9]]],
};

const zone = (over: Partial<Zone> = {}): Zone => ({
  id: 7, code: 'IN-KA-BLR', name: 'Bengaluru', country: 'IN', state_code: 'KA', city: 'Bengaluru',
  zone_type: 'city', parent: null, parent_code: null, polygon_geojson: SQUARE, priority: 10,
  currency: 'INR', timezone_name: 'Asia/Kolkata', distance_unit: 'km', tax_mode: 'inclusive',
  per_trip_fee: '0.00', per_trip_fee_label: '', geo_node: 'IN-KA-BLR', is_active: true, metadata: {},
  version: 1, area_km2: 380, created_at: '2026-10-30T10:00:00Z', updated_at: '2026-10-30T10:00:00Z', ...over,
});

const rows = (...pairs: [string, string][]): VertexRow[] => pairs.map(([lat, lng]) => ({ lat, lng }));
const SQUARE_ROWS = rows(['12.9', '77.5'], ['12.9', '77.7'], ['13.05', '77.7'], ['13.05', '77.5']);

describe('reading a polygon', () => {
  it('drops the closing repeat and swaps [lng, lat] to latitude, longitude rows', () => {
    expect(outerRing(SQUARE)).toHaveLength(4);
    expect(rowsFromGeometry(SQUARE)[0]).toEqual({ lat: '12.9', lng: '77.5' });
  });

  it('draws every part of a multipolygon but edits only a single polygon without holes', () => {
    const multi: Geometry = {
      type: 'MultiPolygon',
      coordinates: [SQUARE.coordinates as Position[][], SQUARE.coordinates as Position[][]],
    };
    expect(outerRings(multi)).toHaveLength(2);
    expect(isEditable(multi)).toBe(false);
    expect(isEditable(SQUARE)).toBe(true);
    const holed: Geometry = {
      type: 'Polygon',
      coordinates: [SQUARE.coordinates[0], [[77.55, 12.95], [77.6, 12.95], [77.6, 13.0], [77.55, 12.95]]],
    };
    expect(isEditable(holed)).toBe(false);
    expect(isEditable(null)).toBe(false);
  });

  it('copes with a missing or degenerate shape', () => {
    expect(outerRing(null)).toBeNull();
    expect(outerRings(undefined)).toEqual([]);
    expect(rowsFromGeometry(null)).toEqual([]);
  });
});

describe('typed numbers', () => {
  it('accepts plain decimals and refuses everything else', () => {
    expect(num('12.5')).toBe(12.5);
    expect(num(' -77.6 ')).toBe(-77.6);
    expect(num('.5')).toBe(0.5);
    for (const bad of ['', 'abc', '1e5', '1,5', '12.5.1', '--1', 'Infinity', 'NaN']) expect(num(bad)).toBeNull();
  });
});

describe('rows to a polygon', () => {
  it('closes the ring and writes [lng, lat]', () => {
    const p = polygonFromRows(SQUARE_ROWS);
    expect(p?.coordinates[0]).toHaveLength(5);
    expect(p?.coordinates[0][0]).toEqual([77.5, 12.9]);
    expect(p?.coordinates[0][4]).toEqual(p?.coordinates[0][0]);
  });

  it('is null until the rows are a ring', () => {
    expect(polygonFromRows(rows(['12.9', '77.5'], ['12.9', '77.7']))).toBeNull();
    expect(ringFromRows(rows(['12.9', 'x']))).toBeNull();
  });
});

describe('the draft checks mirror the server', () => {
  it('passes a valid shape', () => expect(rowsProblem(SQUARE_ROWS)).toBeNull());

  it('needs three corners and numbers in range', () => {
    expect(rowsProblem(rows(['12.9', '77.5'], ['12.9', '77.7']))).toMatch(/at least 3 corners/);
    expect(rowsProblem(rows(['12.9', '77.5'], ['12.9', 'x'], ['13', '77.6']))).toMatch(/Corner 2/);
    expect(rowsProblem(rows(['95', '77.5'], ['12.9', '77.7'], ['13', '77.6']))).toMatch(/latitude must be between/);
    expect(rowsProblem(rows(['12.9', '200'], ['12.9', '77.7'], ['13', '77.6']))).toMatch(/longitude must be between/);
  });

  it('refuses repeated corners that make fewer than three', () => {
    expect(rowsProblem(rows(['12.9', '77.5'], ['12.9', '77.5'], ['12.9', '77.5']))).toMatch(/3 different corners/);
  });

  it('refuses a bow-tie and accepts the same corners in order', () => {
    const bowtie = rows(['12.9', '77.5'], ['13.05', '77.7'], ['12.9', '77.7'], ['13.05', '77.5']);
    expect(rowsProblem(bowtie)).toMatch(/crosses itself/);
    expect(selfIntersects(ringFromRows(bowtie) as Position[])).toBe(true);
    expect(selfIntersects(ringFromRows(SQUARE_ROWS) as Position[])).toBe(false);
  });

  it('holds the same area bounds as the server', () => {
    expect([MIN_AREA_KM2, MAX_AREA_KM2]).toEqual([0.01, 20_000]);
    const tiny = rows(['12.9', '77.5'], ['12.9', '77.5001'], ['12.9001', '77.5001'], ['12.9001', '77.5']);
    expect(rowsProblem(tiny)).toMatch(/at least 0.01 km2/);
    const huge = rows(['10', '70'], ['10', '80'], ['20', '80'], ['20', '70']);
    expect(rowsProblem(huge)).toMatch(/at most 20,000 km2/);
  });

  it('measures a 0.2 by 0.15 degree box near Bengaluru as a few hundred km2', () => {
    const area = ringAreaKm2(ringFromRows(SQUARE_ROWS) as Position[]);
    expect(area).toBeGreaterThan(350);
    expect(area).toBeLessThan(420);
  });
});

describe('the scaled outline', () => {
  const ring = outerRing(SQUARE) as Position[];
  const bounds = boundsOf([ring]);

  it('finds the bounds, and none for nothing', () => {
    expect(bounds).toEqual({ minLng: 77.5, minLat: 12.9, maxLng: 77.7, maxLat: 13.05 });
    expect(boundsOf([])).toBeNull();
  });

  it('fits inside the box with north up', () => {
    const p = makeProjector(bounds!, 400, 300, 20);
    const nw = p.project([77.5, 13.05]);
    const se = p.project([77.7, 12.9]);
    expect(nw.y).toBeLessThan(se.y);
    expect(nw.x).toBeLessThan(se.x);
    for (const pt of [nw, se]) {
      expect(pt.x).toBeGreaterThanOrEqual(20 - 0.01);
      expect(pt.x).toBeLessThanOrEqual(380 + 0.01);
      expect(pt.y).toBeGreaterThanOrEqual(20 - 0.01);
      expect(pt.y).toBeLessThanOrEqual(280 + 0.01);
    }
  });

  it('inverts exactly, so a click on the outline is a real latitude and longitude', () => {
    const p = makeProjector(bounds!, 400, 300);
    const { x, y } = p.project([77.62, 12.97]);
    const back = p.unproject(x, y);
    expect(back.lng).toBeCloseTo(77.62, 6);
    expect(back.lat).toBeCloseTo(12.97, 6);
  });

  it('survives a single point', () => {
    const one = boundsOf([[[77.5, 12.9]]]) as NonNullable<ReturnType<typeof boundsOf>>;
    const p = makeProjector(one, 100, 100);
    expect(Number.isFinite(p.project([77.5, 12.9]).x)).toBe(true);
  });

  it('writes a closed path', () => {
    const p = makeProjector(bounds!, 400, 300);
    const d = ringPath(ring, p);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(d.match(/L/g)).toHaveLength(3);
    expect(ringPath([], p)).toBe('');
  });
});

describe('what a draft changes', () => {
  const z = zone();

  it('is nothing for an untouched draft', () => expect(changedFields(z, draftFromZone(z))).toEqual([]));

  it('names the settings that differ, and the polygon only when a corner moved', () => {
    const d = draftFromZone(z);
    d.priority = '20';
    d.name = 'Bengaluru Metro';
    expect(changedFields(z, d)).toEqual(['name', 'priority']);
    d.rows = rows(['12.9', '77.5'], ['12.9', '77.8'], ['13.05', '77.7'], ['13.05', '77.5']);
    expect(changedFields(z, d)).toContain('polygon_geojson');
  });

  it('sends only what changed, with the reason and an override if given', () => {
    const d = draftFromZone(z);
    d.priority = '25';
    d.timezone_name = 'Asia/Tokyo';
    d.marketOverrideReason = 'Test of an override';
    const body = changeBody(z, d, '  Tune it  ');
    expect(body).toEqual({
      reason: 'Tune it', priority: 25, timezone_name: 'Asia/Tokyo', market_override_reason: 'Test of an override',
    });
  });

  it('builds a new zone body with the code upper-cased and no empty optional fields', () => {
    const d = draftFromZone(z);
    d.currency = ''; d.timezone_name = ''; d.distance_unit = ''; d.tax_mode = ''; d.parent = '';
    const body = createBody('in-ka-blr2', 'IN-KA-BLR', 'IN', d, ' Launch ');
    expect(body.code).toBe('IN-KA-BLR2');
    expect(body.geo_node).toBe('IN-KA-BLR');
    expect(body.reason).toBe('Launch');
    expect(body).not.toHaveProperty('currency');
    expect(body).not.toHaveProperty('parent');
    expect((body.polygon_geojson as { type: string }).type).toBe('Polygon');
  });

  it('shapes the preview body for an existing zone and for a new one', () => {
    const d = draftFromZone(z);
    expect(previewBody(z, d, { code: '', geoNode: '', country: 'IN' })).toMatchObject({ zone: 7 });
    const fresh = previewBody(null, d, { code: 'in-ka-x', geoNode: 'IN-KA-BLR', country: 'IN' }) as {
      values: Record<string, unknown>;
    };
    expect(fresh.values.code).toBe('IN-KA-X');
    expect(fresh.values.geo_node).toBe('IN-KA-BLR');
    expect(previewBody(null, d, { code: '', geoNode: 'IN-KA-BLR', country: 'IN' })).toMatchObject({
      values: { code: 'DRAFT-ZONE' },
    });
  });
});

describe('why a draft cannot be sent', () => {
  const d = draftFromZone(zone());

  it('passes a complete draft', () => {
    expect(draftProblem(d, 'Launch Bengaluru', { creating: false })).toBeNull();
    expect(draftProblem(d, 'Launch Bengaluru', { creating: true, code: 'IN-KA-BLR', geoNode: 'IN-KA-BLR' })).toBeNull();
  });

  it('asks for the code and the city when creating', () => {
    expect(draftProblem(d, 'Launch Bengaluru', { creating: true, code: 'x', geoNode: 'IN-KA-BLR' })).toMatch(/code/);
    expect(draftProblem(d, 'Launch Bengaluru', { creating: true, code: 'IN-KA-BLR', geoNode: '' })).toMatch(/city/);
  });

  it('asks for a name, a shape, a priority, a fee label and a reason, in that order', () => {
    expect(draftProblem({ ...d, name: ' ' }, 'Launch Bengaluru', { creating: false })).toMatch(/name/);
    expect(draftProblem({ ...d, rows: [] }, 'Launch Bengaluru', { creating: false })).toMatch(/3 corners/);
    expect(draftProblem({ ...d, priority: '1.5' }, 'Launch Bengaluru', { creating: false })).toMatch(/Priority/);
    expect(draftProblem({ ...d, priority: '5000' }, 'Launch Bengaluru', { creating: false })).toMatch(/Priority/);
    expect(draftProblem({ ...d, per_trip_fee: '2.5' }, 'Launch Bengaluru', { creating: false })).toMatch(
      /Name the per-trip fee/,
    );
    expect(draftProblem(d, 'no', { creating: false })).toMatch(/why/);
  });
});

describe('reading the preview', () => {
  const impact = (over: Partial<Impact> = {}): Impact => ({
    valid: true, window_days: 30, zone: 'IN-TG-HYD-AIRPORT', is_new: false, area_km2: 40, old_area_km2: 30,
    vertex_count: 5, trips_scanned: 200, truncated: false, trips_unchanged: 150, trips_moved: 50,
    moved_into_zone: 50, moved_out_of_zone: 0,
    transitions: [{ from: 'IN-TG-HYD', to: 'IN-TG-HYD-AIRPORT', trips: 50 }],
    drivers_whose_city_would_change: 0, cards_newly_applying: [], pickups_without_a_card: [],
    trips_in_progress_now: 0, summary: ['Reshapes it.', 'WARNING: 3 moved pickup(s) have no card.'], ...over,
  });

  it('says plainly when nothing moves', () => {
    expect(impactHeadline(impact({ trips_moved: 0 }))).toBe('No pickup in the last 30 days would change zone.');
  });

  it('gives the count and its share of the area', () => {
    expect(impactHeadline(impact())).toBe(
      '50 pickups in the last 30 days would change zone (25% of the 200 in the area).',
    );
    expect(impactHeadline(impact({ trips_moved: 1, trips_scanned: 3 }))).toMatch(/^1 pickup in/);
  });

  it('lifts the warnings out of the summary', () => {
    expect(impactWarnings(impact())).toEqual(['3 moved pickup(s) have no card.']);
    expect(impactWarnings(impact({ summary: ['Fine.'] }))).toEqual([]);
  });

  it('words a transition and a count', () => {
    expect(transitionWords({ from: null, to: 'IN-TG-HYD', trips: 2 })).toBe('no zone → IN-TG-HYD');
    expect(pickups(1)).toBe('1 pickup');
    expect(pickups(1200)).toBe('1,200 pickups');
  });

  it('prints a fare card the way the server sent it, with the zone symbol', () => {
    expect(cardLine(null, '₹')).toBe('No fare card');
    expect(cardLine({
      id: 1, version: 1, zone: 'Z', vehicle_type: 1, vehicle_type_name: 'sedan', base_fare: '60.00',
      per_km_fare: '12.00', per_min_fare: '1.50', min_fare: '40.00', effective_from: '2026-01-01T00:00:00Z',
    }, '₹')).toBe('₹60.00 base · ₹12.00/km · ₹1.50/min · min ₹40.00');
  });

  it('words a pending request from its payload', () => {
    const r = (payload: PendingRequest['payload']): PendingRequest => ({
      id: 1, status: 'requested', action_key: 'zone.change', target_type: 'service_zone', target_id: '7',
      request_reason: 'x', requested_at: '2026-10-30T10:00:00Z', payload,
    });
    expect(requestWords(r({ kind: 'create' }))).toBe('New zone');
    expect(requestWords(r({ kind: 'update', changed: ['priority', 'name'] }))).toBe('Change: priority, name');
    expect(requestWords(r({ kind: 'deactivate' }))).toBe('Deactivate');
    expect(requestWords(r({}))).toBe('Zone change');
  });
});
