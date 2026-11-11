/**
 * Zones and geofences (module 9): the shapes, the draft checks and the impact preview.
 *
 * Pure helpers and the API shapes, so the pages stay thin and the geometry that
 * matters (what a drawn polygon is, whether it can be sent, what a preview says)
 * is tested in one place. Nothing here talks to the network.
 *
 *   * a zone is only ever CHANGED by a request a second admin approves; a draft is
 *     a form that proposes one. Nothing here writes a polygon;
 *   * the server validates everything again (closed ring, self-intersection,
 *     range, area, overlap, parent containment). `rowsProblem` spares a round trip
 *     and mirrors the constants; it is never the authority;
 *   * a polygon is edited as vertices (a map with draggable points, or a table of
 *     latitude and longitude rows). GeoJSON is [longitude, latitude]; the console
 *     talks in latitude, longitude, so the swap lives here and nowhere else.
 */
import { can, type AdminAccess } from './adminScope';

/** Drafting needs `zone.write`; looking needs `zone.read`. */
export const canDraftZones = (access: AdminAccess | null) => can(access, 'zone.write');

/** The server's area bounds, in km2. The server is the authority; these only mirror it. */
export const MIN_AREA_KM2 = 0.01;
export const MAX_AREA_KM2 = 20_000;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type Position = [number, number]; // [lng, lat]
export type PolygonGeoJson = { type: 'Polygon'; coordinates: Position[][] };
export type MultiPolygonGeoJson = { type: 'MultiPolygon'; coordinates: Position[][][] };
export type Geometry = PolygonGeoJson | MultiPolygonGeoJson;

export type Zone = {
  id: number; code: string; name: string; country: string; state_code: string; city: string;
  zone_type: string; parent: number | null; parent_code: string | null;
  polygon_geojson: Geometry; priority: number; currency: string; timezone_name: string;
  distance_unit: string; tax_mode: string; per_trip_fee: string; per_trip_fee_label: string;
  geo_node: string | null; is_active: boolean; metadata: Record<string, unknown>;
  version: number; area_km2: number | null; created_at: string; updated_at: string;
};

export type Revision = {
  id: number; version: number;
  kind: 'create' | 'update' | 'deactivate' | 'reactivate' | 'restore' | 'backfill';
  snapshot: Record<string, unknown>; vertex_count: number;
  parent: string | null; geo_node: string | null; reason: string;
  restored_from_version: number | null;
  maker: { id: number | null; label: string; email: string };
  checker: { id: number | null; label: string; email: string } | null;
  approval_request_id: number | null; applied_at: string;
};

export type PendingRequest = {
  id: number; status: string; action_key: string; target_type: string; target_id: string;
  request_reason: string; requested_at: string;
  maker?: { label?: string; email?: string } | null;
  payload: { kind?: string; zone_code?: string; changed?: string[]; area_km2?: number } & Record<string, unknown>;
};

export type History = {
  zone: string; version: number; revisions: Revision[]; pending_requests: PendingRequest[];
};

export type City = { code: string; name: string; country: string | null; status: string };

export type Transition = { from: string | null; to: string | null; trips: number };

export type FareCardInfo = {
  id: number; version: number; zone: string; vehicle_type: number; vehicle_type_name: string;
  base_fare: string; per_km_fare: string; per_min_fare: string; min_fare: string;
  effective_from: string; trips?: number;
};

export type Impact = {
  valid: true; window_days: number; zone: string; is_new: boolean;
  area_km2: number; old_area_km2: number | null; vertex_count: number;
  trips_scanned: number; truncated: boolean; trips_unchanged: number; trips_moved: number;
  moved_into_zone: number; moved_out_of_zone: number; transitions: Transition[];
  drivers_whose_city_would_change: number; cards_newly_applying: FareCardInfo[];
  pickups_without_a_card: { zone: string | null; vehicle_type: number; vehicle_type_name: string | null; trips: number }[];
  trips_in_progress_now: number; summary: string[];
};
export type ImpactInvalid = { valid: false; error: { code: string; message: string; field: string } };
export type ImpactResult = Impact | ImpactInvalid;

export type PointZone = {
  id: number | null; code: string; name: string; zone_type: string; priority: number;
  currency: string; distance_unit: string; tax_mode: string; parent: string | null;
} | null;

export type PointResolution = {
  in_service_area: boolean; zone: PointZone; matching_zones: string[];
  rate_cards: { vehicle_type: number; vehicle_type_name: string; card: FareCardInfo | null }[];
};
export type PointTest = PointResolution & {
  point: { lat: number; lng: number };
  draft?: PointResolution & { changes_resolution: boolean };
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const KIND_WORDS: Record<Revision['kind'], string> = {
  create: 'Created', update: 'Changed', deactivate: 'Deactivated', reactivate: 'Reactivated',
  restore: 'Restored', backfill: 'Starting point',
};

export const TYPE_WORDS: Record<string, string> = {
  country: 'Country', state: 'State', city: 'City', subzone: 'Sub-zone (airport, campus…)',
};

export const FIELD_WORDS: Record<string, string> = {
  polygon_geojson: 'shape', zone_type: 'type', state_code: 'state code', timezone_name: 'time zone',
  distance_unit: 'distance unit', tax_mode: 'tax', per_trip_fee: 'per-trip fee', per_trip_fee_label: 'fee name',
};
export const fieldWord = (f: string) => FIELD_WORDS[f] ?? f.replace(/_/g, ' ');

/** What a pending request is, in words (from its payload kind). */
export function requestWords(r: PendingRequest): string {
  switch (r.payload?.kind) {
    case 'create': return 'New zone';
    case 'update': return `Change${r.payload.changed?.length ? `: ${r.payload.changed.map(fieldWord).join(', ')}` : ''}`;
    case 'restore': return 'Restore an earlier revision';
    case 'deactivate': return 'Deactivate';
    case 'reactivate': return 'Reactivate';
    default: return 'Zone change';
  }
}

// ---------------------------------------------------------------------------
// Vertices: the editing model
// ---------------------------------------------------------------------------

/** One corner as the operator types it: latitude and longitude, text, so half-typed input survives. */
export type VertexRow = { lat: string; lng: string };

/** The exterior ring of the zone's first polygon, WITHOUT the closing repeat, or null. */
export function outerRing(g: Geometry | null | undefined): Position[] | null {
  if (!g) return null;
  const ring = g.type === 'Polygon' ? g.coordinates?.[0] : g.coordinates?.[0]?.[0];
  if (!ring || ring.length < 2) return null;
  const same = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1];
  return same ? ring.slice(0, -1) : ring.slice();
}

/** Every exterior ring (a MultiPolygon has several), closing repeat removed. For drawing. */
export function outerRings(g: Geometry | null | undefined): Position[][] {
  if (!g) return [];
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys
    .map((p) => p?.[0])
    .filter((r): r is Position[] => Array.isArray(r) && r.length >= 4)
    .map((r) => r.slice(0, -1));
}

/** Can the console edit this shape? One polygon with no holes: yes. Anything else is shown, not edited. */
export function isEditable(g: Geometry | null | undefined): boolean {
  return !!g && g.type === 'Polygon' && g.coordinates.length === 1;
}

export const rowsFromRing = (ring: Position[]): VertexRow[] =>
  ring.map(([lng, lat]) => ({ lat: String(lat), lng: String(lng) }));

export const rowsFromGeometry = (g: Geometry | null | undefined): VertexRow[] => {
  const ring = outerRing(g);
  return ring ? rowsFromRing(ring) : [];
};

/** A number from typed text, or null. Rejects '', 'abc', '1e', and NaN/Infinity. */
export function num(text: string): number | null {
  const t = text.trim();
  if (t === '' || !/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** The open ring of [lng, lat] positions the rows describe, or null if any row is unusable. */
export function ringFromRows(rows: VertexRow[]): Position[] | null {
  const out: Position[] = [];
  for (const r of rows) {
    const lat = num(r.lat);
    const lng = num(r.lng);
    if (lat === null || lng === null) return null;
    out.push([lng, lat]);
  }
  return out;
}

/** The GeoJSON polygon for the rows (closing the ring), or null when they are not yet a ring. */
export function polygonFromRows(rows: VertexRow[]): PolygonGeoJson | null {
  const ring = ringFromRows(rows);
  if (!ring || ring.length < 3) return null;
  return { type: 'Polygon', coordinates: [[...ring, ring[0]]] };
}

// ---------------------------------------------------------------------------
// Geometry checks (mirror the server; the server decides)
// ---------------------------------------------------------------------------

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;

/** Area of an open ring in km2 (equirectangular around the ring's own latitude). */
export function ringAreaKm2(ring: Position[]): number {
  if (ring.length < 3) return 0;
  const lat0 = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const kx = KM_PER_DEG_LON_EQUATOR * Math.cos((lat0 * Math.PI) / 180);
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += (x1 * kx) * (y2 * KM_PER_DEG_LAT) - (x2 * kx) * (y1 * KM_PER_DEG_LAT);
  }
  return Math.abs(sum) / 2;
}

type Pt = { x: number; y: number };
const orient = (a: Pt, b: Pt, c: Pt) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const onSeg = (a: Pt, b: Pt, c: Pt) =>
  Math.min(a.x, b.x) <= c.x && c.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= c.y && c.y <= Math.max(a.y, b.y);

function segmentsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  if (d1 === 0 && onSeg(p3, p4, p1)) return true;
  if (d2 === 0 && onSeg(p3, p4, p2)) return true;
  if (d3 === 0 && onSeg(p1, p2, p3)) return true;
  if (d4 === 0 && onSeg(p1, p2, p4)) return true;
  return false;
}

/** Does an open ring cross itself? Adjacent edges only meet at their shared corner. */
export function selfIntersects(ring: Position[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  const pt = (i: number): Pt => ({ x: ring[i % n][0], y: ring[i % n][1] });
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsCross(pt(i), pt(i + 1), pt(j), pt(j + 1))) return true;
    }
  }
  return false;
}

/**
 * What stops these rows becoming a zone shape, in words, or null.
 * The server re-checks all of it (and the rules that need other zones).
 */
export function rowsProblem(rows: VertexRow[]): string | null {
  if (rows.length < 3) return 'A zone needs at least 3 corners.';
  for (let i = 0; i < rows.length; i += 1) {
    const lat = num(rows[i].lat);
    const lng = num(rows[i].lng);
    if (lat === null || lng === null) return `Corner ${i + 1}: enter latitude and longitude as numbers.`;
    if (lat < -90 || lat > 90) return `Corner ${i + 1}: latitude must be between -90 and 90.`;
    if (lng < -180 || lng > 180) return `Corner ${i + 1}: longitude must be between -180 and 180.`;
  }
  const ring = ringFromRows(rows) as Position[];
  const distinct = new Set(ring.map((p) => `${p[0]},${p[1]}`));
  if (distinct.size < 3) return 'A zone needs at least 3 different corners.';
  if (selfIntersects(ring)) return 'The outline crosses itself. Move the corners so the edges do not cross.';
  const area = ringAreaKm2(ring);
  if (area < MIN_AREA_KM2) return `That is about ${area.toFixed(4)} km2; a zone must cover at least ${MIN_AREA_KM2} km2.`;
  if (area > MAX_AREA_KM2) return `That is about ${Math.round(area).toLocaleString('en')} km2; a zone may cover at most ${MAX_AREA_KM2.toLocaleString('en')} km2.`;
  return null;
}

// ---------------------------------------------------------------------------
// The scaled outline (the map without Google Maps)
// ---------------------------------------------------------------------------

export type Bounds = { minLng: number; minLat: number; maxLng: number; maxLat: number };

export function boundsOf(rings: Position[][]): Bounds | null {
  let b: Bounds | null = null;
  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      b = b
        ? { minLng: Math.min(b.minLng, lng), minLat: Math.min(b.minLat, lat), maxLng: Math.max(b.maxLng, lng), maxLat: Math.max(b.maxLat, lat) }
        : { minLng: lng, minLat: lat, maxLng: lng, maxLat: lat };
    }
  }
  return b;
}

export type Projector = {
  /** [lng, lat] to SVG x, y. */
  project: (p: Position) => { x: number; y: number };
  /** SVG x, y back to [lng, lat] (for a click). */
  unproject: (x: number, y: number) => { lat: number; lng: number };
  width: number; height: number;
};

/**
 * A projector that fits `bounds` into a `width` x `height` box with `pad` around it,
 * keeping the true aspect (longitude is scaled by cos(latitude)), north up.
 * A degenerate box (one point) is widened so nothing divides by zero.
 */
export function makeProjector(bounds: Bounds, width: number, height: number, pad = 16): Projector {
  const midLat = (bounds.minLat + bounds.maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180) || 1;
  const spanX = Math.max((bounds.maxLng - bounds.minLng) * kx, 1e-6);
  const spanY = Math.max(bounds.maxLat - bounds.minLat, 1e-6);
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  return {
    width, height,
    project: ([lng, lat]) => ({
      x: offX + (lng - bounds.minLng) * kx * scale,
      y: offY + (bounds.maxLat - lat) * scale,
    }),
    unproject: (x, y) => ({
      lng: bounds.minLng + (x - offX) / (kx * scale),
      lat: bounds.maxLat - (y - offY) / scale,
    }),
  };
}

/** SVG path data for a ring. */
export function ringPath(ring: Position[], p: Projector): string {
  if (ring.length === 0) return '';
  return `${ring.map((pos, i) => {
    const { x, y } = p.project(pos);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ')} Z`;
}

// ---------------------------------------------------------------------------
// The request body, and the preview in words
// ---------------------------------------------------------------------------

/** The editable settings of a zone, as the form holds them. */
export type Draft = {
  name: string; zone_type: string; priority: string; state_code: string; city: string;
  parent: string; currency: string; timezone_name: string; distance_unit: string;
  tax_mode: string; per_trip_fee: string; per_trip_fee_label: string;
  rows: VertexRow[]; marketOverrideReason: string;
};

export function draftFromZone(z: Zone): Draft {
  return {
    name: z.name, zone_type: z.zone_type, priority: String(z.priority), state_code: z.state_code,
    city: z.city, parent: z.parent_code ?? '', currency: z.currency, timezone_name: z.timezone_name,
    distance_unit: z.distance_unit, tax_mode: z.tax_mode, per_trip_fee: String(z.per_trip_fee ?? '0'),
    per_trip_fee_label: z.per_trip_fee_label ?? '', rows: rowsFromGeometry(z.polygon_geojson),
    marketOverrideReason: '',
  };
}

const same = (a: unknown, b: unknown) => String(a ?? '').trim() === String(b ?? '').trim();

/** The settings a draft changes against a zone, as field names, for "this request will change". */
export function changedFields(z: Zone, d: Draft): string[] {
  const out: string[] = [];
  if (!same(z.name, d.name)) out.push('name');
  if (!same(z.zone_type, d.zone_type)) out.push('zone_type');
  if (Number(z.priority) !== Number(d.priority)) out.push('priority');
  if (!same(z.state_code, d.state_code)) out.push('state_code');
  if (!same(z.city, d.city)) out.push('city');
  if (!same(z.parent_code ?? '', d.parent)) out.push('parent');
  if (!same(z.currency, d.currency)) out.push('currency');
  if (!same(z.timezone_name, d.timezone_name)) out.push('timezone_name');
  if (!same(z.distance_unit, d.distance_unit)) out.push('distance_unit');
  if (!same(z.tax_mode, d.tax_mode)) out.push('tax_mode');
  if (Number(z.per_trip_fee ?? 0) !== Number(d.per_trip_fee || 0)) out.push('per_trip_fee');
  if (!same(z.per_trip_fee_label, d.per_trip_fee_label)) out.push('per_trip_fee_label');
  const a = JSON.stringify(rowsFromGeometry(z.polygon_geojson).map((r) => [num(r.lat), num(r.lng)]));
  const b = JSON.stringify(d.rows.map((r) => [num(r.lat), num(r.lng)]));
  if (a !== b) out.push('polygon_geojson');
  return out;
}

/** Body for a change to an existing zone: only what differs, plus the reason. */
export function changeBody(z: Zone, d: Draft, reason: string): Record<string, unknown> {
  const body: Record<string, unknown> = { reason: reason.trim() };
  for (const f of changedFields(z, d)) {
    if (f === 'polygon_geojson') body.polygon_geojson = polygonFromRows(d.rows);
    else if (f === 'priority') body.priority = Number(d.priority);
    else body[f] = (d as unknown as Record<string, string>)[f];
  }
  if (d.marketOverrideReason.trim()) body.market_override_reason = d.marketOverrideReason.trim();
  return body;
}

/** Body for a new zone. */
export function createBody(code: string, geoNode: string, country: string, d: Draft, reason: string): Record<string, unknown> {
  const body: Record<string, unknown> = {
    code: code.trim().toUpperCase(), geo_node: geoNode, country, name: d.name.trim(),
    zone_type: d.zone_type, priority: Number(d.priority), state_code: d.state_code.trim(),
    city: d.city.trim(), polygon_geojson: polygonFromRows(d.rows), reason: reason.trim(),
    per_trip_fee: d.per_trip_fee || '0', per_trip_fee_label: d.per_trip_fee_label.trim(),
  };
  if (d.parent.trim()) body.parent = d.parent.trim();
  for (const k of ['currency', 'timezone_name', 'distance_unit', 'tax_mode'] as const) {
    if (d[k].trim()) body[k] = d[k].trim();
  }
  if (d.marketOverrideReason.trim()) body.market_override_reason = d.marketOverrideReason.trim();
  return body;
}

/** The body for `/zones/preview/` and `/zones/point-test/`: a zone (or none) and the draft's values. */
export function previewBody(
  z: Zone | null, d: Draft, fixed: { code: string; geoNode: string; country: string },
): Record<string, unknown> {
  const values: Record<string, unknown> = {
    name: d.name.trim() || 'Draft', zone_type: d.zone_type, priority: Number(d.priority),
    state_code: d.state_code.trim(), city: d.city.trim(),
    polygon_geojson: polygonFromRows(d.rows),
    per_trip_fee: d.per_trip_fee || '0', per_trip_fee_label: d.per_trip_fee_label.trim(),
  };
  if (d.parent.trim()) values.parent = d.parent.trim();
  for (const k of ['currency', 'timezone_name', 'distance_unit', 'tax_mode'] as const) {
    if (d[k].trim()) values[k] = d[k].trim();
  }
  if (z) return { zone: z.id, values };
  return { values: { ...values, code: fixed.code.trim().toUpperCase() || 'DRAFT-ZONE', geo_node: fixed.geoNode, country: fixed.country } };
}

/** Why a draft cannot be sent yet, or null. */
export function draftProblem(d: Draft, reason: string, opts: { creating: boolean; code?: string; geoNode?: string }): string | null {
  if (opts.creating) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,63}$/.test((opts.code ?? '').trim())) return 'Give the zone a code of letters, digits and hyphens, like IN-KA-BLR.';
    if (!opts.geoNode) return 'Pick the city this zone belongs to.';
  }
  if (d.name.trim().length < 2) return 'Give the zone a name.';
  const shape = rowsProblem(d.rows);
  if (shape) return shape;
  const priority = num(d.priority);
  if (priority === null || !Number.isInteger(priority) || priority < 0 || priority > 1000) return 'Priority is a whole number from 0 to 1000.';
  if (Number(d.per_trip_fee || 0) > 0 && !d.per_trip_fee_label.trim()) return 'Name the per-trip fee (for example, Congestion surcharge).';
  if (reason.trim().length < 5) return 'Say why, in a few words.';
  return null;
}

// ---------------------------------------------------------------------------
// Reading the preview
// ---------------------------------------------------------------------------

export const isValidImpact = (r: ImpactResult | null | undefined): r is Impact => !!r && r.valid === true;

/** "A → B": either end may be "no zone". */
export const transitionWords = (t: Transition) => `${t.from ?? 'no zone'} → ${t.to ?? 'no zone'}`;

/** A pickup count with its noun. */
export const pickups = (n: number) => `${n.toLocaleString('en')} pickup${n === 1 ? '' : 's'}`;

/** The one-line verdict above the preview: how much the change moves, in the last N days. */
export function impactHeadline(i: Impact): string {
  if (i.trips_moved === 0) return `No pickup in the last ${i.window_days} days would change zone.`;
  const share = i.trips_scanned > 0 ? Math.round((i.trips_moved / i.trips_scanned) * 100) : 0;
  return `${pickups(i.trips_moved)} in the last ${i.window_days} days would change zone (${share}% of the ${i.trips_scanned.toLocaleString('en')} in the area).`;
}

/** Lines that need a person to stop and read (the preview's warnings). */
export function impactWarnings(i: Impact): string[] {
  return i.summary.filter((l) => l.startsWith('WARNING')).map((l) => l.replace(/^WARNING:\s*/, ''));
}

/** Compare a zone's fare card fields the way the tester shows them: symbol first, figures as the server sent. */
export function cardLine(c: FareCardInfo | null, symbol: string): string {
  if (!c) return 'No fare card';
  return `${symbol}${c.base_fare} base · ${symbol}${c.per_km_fare}/km · ${symbol}${c.per_min_fare}/min · min ${symbol}${c.min_fare}`;
}
