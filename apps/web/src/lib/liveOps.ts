/**
 * The Live Ops map's data: what the snapshot, heatmap and socket send, and the
 * small pure helpers the page is built from (frame merge, throttle, grid).
 *
 * NOTHING HERE KNOWS A PERSON. A dot is a driver ID, a status, a vehicle class
 * and a position; a trip is an ID, a state and two points rounded to ~100 m. The
 * server builds both from a whitelist, so there is no name, phone, plate or
 * rider to show, and this file has nowhere to put one. Clicking a dot goes to
 * the driver's own page, which is scoped and masked like every other.
 *
 * THE SOCKET IS AN OPTIMISATION, NOT THE SOURCE OF TRUTH. The page paints from
 * the REST snapshot, applies socket frames on top, and when the socket drops it
 * polls the snapshot every ten seconds and says how old the data is.
 */

import { AdminAccess, can } from '@/lib/adminScope';

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const READ_CAPABILITY = 'liveops.read';
export const AGGREGATE_CAPABILITY = 'liveops.aggregate';

/** Individual driver dots and active trips. */
export const canReadLive = (access: AdminAccess | null) => can(access, READ_CAPABILITY);
/** The demand and supply heatmap, with no individual positions. */
export const canSeeAggregate = (access: AdminAccess | null) => can(access, AGGREGATE_CAPABILITY);

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export type DotStatus = 'online' | 'on_trip' | 'offline';

export type Dot = {
  driver_id: number;
  status: DotStatus;
  vehicle_class: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  updated_at: string | null;
  trip_id: number | null;
  city: string | null;
};

export type LiveTrip = {
  id: number;
  state: 'requested' | 'accepted' | 'reached' | 'in_progress' | string;
  pickup_lat: number;
  pickup_lng: number;
  drop_lat: number;
  drop_lng: number;
  vehicle_class: string | null;
  age_s: number;
  city: string | null;
  stale: boolean;
};

export type LiveAlert = {
  id: number;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  city: string | null;
  created_at: string;
  is_sos: boolean;
  lat: number | null;
  lng: number | null;
};

export type NetworkStatus = 'OFFLINE' | 'CRITICAL' | 'HIGH DEMAND' | 'NORMAL';

export type CityStatus = {
  code: string;
  name: string;
  network_status: NetworkStatus;
  online_drivers: number;
  on_trip_drivers: number;
  unassigned_trips: number;
  oldest_unassigned_age_s: number | null;
  stale_trips: number;
};

export type ZoneOutline = {
  code: string;
  name: string;
  type: string;
  city: string | null;
  /** [lat, lng] pairs, as the server sends them. */
  rings: [number, number][][];
};

export type Snapshot = {
  generated_at: string;
  mode: 'full' | 'aggregate';
  city: string | null;
  poll_seconds: number;
  presence_available: boolean;
  cities: CityStatus[];
  zones: ZoneOutline[];
  /** Absent for a caller who holds only `liveops.aggregate`. */
  drivers?: Dot[];
  trips?: LiveTrip[];
  alerts?: LiveAlert[];
  truncated?: { drivers: boolean; trips: boolean; limit: number; message: string | null };
};

export type HeatCell = {
  row: number;
  col: number;
  /** South-west corner of the cell, to the grid's own precision. */
  cell_south: number;
  cell_west: number;
  demand: number;
  supply: number;
  peak_supply: number;
  demand_per_baseline: number;
  shade: 'short' | 'balanced';
  events: number;
};

export type Heatmap = {
  generated_at: string;
  title: string;
  mode: 'full' | 'aggregate';
  city: string | null;
  window_minutes: number;
  windows: number[];
  cell_degrees: number;
  baseline_minutes: number;
  k_anonymity: number | null;
  suppressed_cells: number;
  truncated: boolean;
  cells: HeatCell[];
};

export type Ticket = { ticket: string; expires_in: number; path: string; mode: 'full' | 'aggregate' };

export type Frame =
  | { type: 'hello'; mode: 'full' | 'aggregate'; session: string; recheck_seconds: number; frame_interval_seconds: number; cities: string[] }
  | { type: 'initial_drivers'; drivers: Dot[]; truncated?: boolean }
  | ({ type: 'driver_location_update' } & Dot)
  | { type: 'driver_status_update'; driver_id: number; status: DotStatus }
  | { type: 'city_status'; cities: CityStatus[] }
  | { type: string };

export const WINDOWS: ReadonlyArray<{ minutes: number; label: string }> = [
  { minutes: 15, label: '15 min' },
  { minutes: 60, label: '1 h' },
  { minutes: 1440, label: '24 h' },
];

/** Close codes the server uses (servers/live_ops/config.py). */
export const CLOSE_NO_TICKET = 4001;
export const CLOSE_NO_CAPABILITY = 4003;

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

export const SNAPSHOT_PATH = '/live-ops/admin/snapshot/';
export const HEATMAP_PATH = '/live-ops/admin/heatmap/';
export const TICKET_PATH = '/live-ops/admin/ws-ticket/';

export function snapshotUrl(city: string | null): string {
  return city ? `${SNAPSHOT_PATH}?city=${encodeURIComponent(city)}` : SNAPSHOT_PATH;
}

export function heatmapUrl(city: string | null, windowMinutes: number): string {
  const q = new URLSearchParams({ window: String(windowMinutes) });
  if (city) q.set('city', city);
  return `${HEATMAP_PATH}?${q.toString()}`;
}

/**
 * The socket's address. The ticket is the ONLY credential in it, good for one
 * connection within thirty seconds; the JWT is never put in a URL.
 *
 * `NEXT_PUBLIC_WS_BASE_URL` overrides; otherwise the API's own origin, with the
 * scheme swapped (`https` -> `wss`) and the `/api/v1` suffix dropped.
 */
export function socketUrl(path: string, ticket: string, apiBase?: string, wsBase?: string): string {
  const configured = (wsBase ?? process.env.NEXT_PUBLIC_WS_BASE_URL ?? '').trim();
  let origin = configured;
  if (!origin) {
    const base = apiBase ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';
    origin = base.replace(/\/api\/v\d+\/?$/, '').replace(/\/$/, '').replace(/^http/, 'ws');
  }
  return `${origin.replace(/\/$/, '')}${path}?ticket=${encodeURIComponent(ticket)}`;
}

// ---------------------------------------------------------------------------
// Frame merge
// ---------------------------------------------------------------------------

export type DotMap = Map<number, Dot>;

export function dotsFrom(list: Dot[] | undefined): DotMap {
  const out: DotMap = new Map();
  for (const d of list ?? []) if (validDot(d)) out.set(d.driver_id, d);
  return out;
}

function validDot(d: Partial<Dot> | null | undefined): d is Dot {
  return !!d && Number.isFinite(d.driver_id) && Number.isFinite(d.lat) && Number.isFinite(d.lng);
}

function dotOf(frame: Record<string, unknown>): Dot | null {
  const { type: _type, ...rest } = frame;
  void _type;
  return validDot(rest as Partial<Dot>) ? (rest as unknown as Dot) : null;
}

/**
 * Apply one frame to the dots.
 *
 *   initial_drivers         replaces everything (a reconnect starts again)
 *   driver_location_update  adds or moves one driver
 *   driver_status_update    `offline` removes the driver; the server also uses
 *                           it when a driver leaves the operator's scope
 *   anything else           changes nothing (and returns the SAME map, so React
 *                           does not re-render for a frame it ignored)
 *
 * A malformed frame is ignored rather than thrown on: one bad position must not
 * blank the map.
 */
export function applyFrame(dots: DotMap, frame: Frame): DotMap {
  switch (frame.type) {
    case 'initial_drivers':
      return dotsFrom((frame as { drivers?: Dot[] }).drivers);
    case 'driver_location_update': {
      const dot = dotOf(frame as unknown as Record<string, unknown>);
      if (!dot || dot.status === 'offline') {
        if (dot && dots.has(dot.driver_id)) {
          const next = new Map(dots);
          next.delete(dot.driver_id);
          return next;
        }
        return dots;
      }
      const next = new Map(dots);
      next.set(dot.driver_id, dot);
      return next;
    }
    case 'driver_status_update': {
      const f = frame as { driver_id: number; status: DotStatus };
      if (f.status === 'offline' && dots.has(f.driver_id)) {
        const next = new Map(dots);
        next.delete(f.driver_id);
        return next;
      }
      return dots;
    }
    default:
      return dots;
  }
}

/**
 * Reduce a batch of frames to what matters: the LATEST position per driver, and
 * the last `initial_drivers` with only the frames that came after it. The server
 * already sends at most one update per driver per second, so this is a guard for
 * a tab that was in the background, not a second throttle.
 */
export function coalesce(frames: Frame[]): Frame[] {
  let start = 0;
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].type === 'initial_drivers') { start = i; break; }
  }
  const tail = frames.slice(start);
  const lastFor = new Map<number, number>();
  tail.forEach((f, i) => {
    if (f.type === 'driver_location_update' || f.type === 'driver_status_update') {
      lastFor.set((f as { driver_id: number }).driver_id, i);
    }
  });
  return tail.filter((f, i) => {
    if (f.type !== 'driver_location_update' && f.type !== 'driver_status_update') return true;
    return lastFor.get((f as { driver_id: number }).driver_id) === i;
  });
}

/** Apply a batch in order. */
export function applyFrames(dots: DotMap, frames: Frame[]): DotMap {
  return coalesce(frames).reduce(applyFrame, dots);
}

// ---------------------------------------------------------------------------
// Throttle
// ---------------------------------------------------------------------------

/**
 * Holds incoming frames and releases them at most once per interval.
 *
 * The socket can deliver bursts (a tab coming back to the foreground, a reconnect);
 * painting every frame would make the map the slowest thing on the page. `take`
 * returns the queued frames only when the interval has passed since the last
 * release, so the caller can call it from a timer without keeping its own
 * clock. The queue is bounded: past `limit` the OLDEST frames are dropped,
 * because a superseded position has no value.
 */
export class FrameBuffer {
  private queue: Frame[] = [];
  private last = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly intervalMs = 1000,
    private readonly now: () => number = () => Date.now(),
    private readonly limit = 5000,
  ) {}

  push(frame: Frame) {
    this.queue.push(frame);
    if (this.queue.length > this.limit) this.queue = this.queue.slice(this.queue.length - this.limit);
  }

  get size() { return this.queue.length; }

  /** The frames to apply now, or null when it is too soon or nothing is waiting. */
  take(): Frame[] | null {
    if (this.queue.length === 0) return null;
    const t = this.now();
    if (t - this.last < this.intervalMs) return null;
    this.last = t;
    const out = this.queue;
    this.queue = [];
    return out;
  }

  clear() { this.queue = []; }
}

// ---------------------------------------------------------------------------
// The grid (about 1 km cells: 0.01 degree buckets, as the server counts them)
// ---------------------------------------------------------------------------

export const CELL_DEGREES = 0.01;

export type CellId = { row: number; col: number };

/** Which cell a point falls in. `floor`, not truncation: the grid is the same south of the equator. */
export function cellOf(lat: number, lng: number, size = CELL_DEGREES): CellId {
  const per = Math.round(1 / size);
  return { row: Math.floor(lat * per), col: Math.floor(lng * per) };
}

export const cellKey = (c: CellId) => `${c.row}:${c.col}`;

/** [south, west, north, east], rounded to the grid so the sums do not drift. */
export function cellBounds(c: CellId, size = CELL_DEGREES): [number, number, number, number] {
  const south = Math.round(c.row * size * 1e6) / 1e6;
  const west = Math.round(c.col * size * 1e6) / 1e6;
  return [south, west, Math.round((south + size) * 1e6) / 1e6, Math.round((west + size) * 1e6) / 1e6];
}

/**
 * How hard to shade a cell, 0 to 3. 0 = nothing wanted; 1 to 3 = more requests
 * per baseline period than idle drivers, in thirds. A balanced cell is 0 whatever
 * its size: shading is "demand > supply", and a busy but served cell is not news.
 */
export function shadeLevel(cell: Pick<HeatCell, 'shade' | 'demand_per_baseline' | 'supply'>): 0 | 1 | 2 | 3 {
  if (cell.shade !== 'short') return 0;
  const excess = cell.demand_per_baseline - cell.supply;
  if (excess >= 3) return 3;
  if (excess >= 1.5) return 2;
  return 1;
}

export const SHADE_WORDS = ['Balanced', 'Short', 'Short', 'Very short'] as const;

/** A cell, in words, for the list view and the screen reader. */
export function cellSentence(cell: HeatCell, windowMinutes: number): string {
  const level = shadeLevel(cell);
  const where = `${cell.cell_south.toFixed(2)}, ${cell.cell_west.toFixed(2)}`;
  return `Cell near ${where}: ${cell.demand} request${cell.demand === 1 ? '' : 's'} in ${windowMinutes} minutes, `
    + `${cell.supply} idle driver${cell.supply === 1 ? '' : 's'} on average. ${SHADE_WORDS[level]}.`;
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const STATUS_WORDS: Record<DotStatus, string> = {
  online: 'Online', on_trip: 'On a trip', offline: 'Offline',
};

export const TRIP_STATE_WORDS: Record<string, string> = {
  requested: 'Requested', accepted: 'Accepted', reached: 'At pickup', in_progress: 'In progress',
};

export function networkTone(status: NetworkStatus): 'good' | 'bad' | 'wait' | 'neutral' {
  switch (status) {
    case 'NORMAL': return 'good';
    case 'HIGH DEMAND': return 'wait';
    case 'CRITICAL': return 'bad';
    default: return 'neutral';
  }
}

/** "42 s", "7 min", "2 h 5 min". Never negative. */
export function ageText(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** Seconds from an ISO instant to `now` (ms), or null for no instant. */
export function secondsSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, (now - t) / 1000) : null;
}

/** A position as an operator reads it: five decimals is a doorstep, so say what is shown. */
export function positionText(lat: number | null, lng: number | null, places = 4): string {
  if (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)) return '—';
  return `${lat.toFixed(places)}, ${lng.toFixed(places)}`;
}

/** The connection, as the page names it. */
export type Link = 'connecting' | 'live' | 'polling' | 'denied' | 'idle';

export function linkSentence(link: Link, dataAgeSeconds: number | null): string {
  switch (link) {
    case 'live': return 'Live';
    case 'connecting': return 'Connecting…';
    case 'denied': return 'Your access to the live map changed. Reload to continue.';
    case 'polling':
      return dataAgeSeconds === null
        ? 'Socket disconnected. Refreshing every 10 s.'
        : `Socket disconnected, showing data from ${Math.round(dataAgeSeconds)} s ago.`;
    default: return '';
  }
}

/** The ids of the drivers for one city (or all of them). */
export function dotsInCity(dots: DotMap, city: string | null): Dot[] {
  const all = [...dots.values()];
  return city ? all.filter((d) => d.city === city) : all;
}
