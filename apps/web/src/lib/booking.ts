// Booking a ride from the browser, against the backend that already does it.
//
// NOTHING ABOUT A FARE, A ZONE, A DRIVER OR A TRIP STATE IS DECIDED HERE.
// The server prices the trip, picks the zone, runs dispatch and owns the
// lifecycle. This module is a transport: it sends what the existing rider
// app sends and renders what comes back. Re-deriving any of it in TypeScript
// would be a second set of business rules to drift against the first.
//
// THE CONTRACTS, as they exist today:
//
//   GET  /pricing/vehicle-types/?lat=&lng=   categories priced at a point
//   POST /ride/estimate-fare/                the quote, with currency + units
//   POST /ride/maps/geocode                  destination search (needs a key)
//   WS   /ws/ride/request/?token=            {"action":"request", ...}
//        -> connection_established | current_trip | trip_created
//           | dispatch_failed | error
//   WS   /ws/ride/trip/<id>/?token=          trip_update | trip_status_update
//                                            | command_ack | trip_taken
//   POST /ride/trip/<id>/cancel/             {"reason": one of five}
//
// `vehicle_type` is sent as the catalogue string the server gave us, never a
// value this file invents.

import { ApiError, api } from './api';
import { readRiderToken } from './publicAuth';

export type LatLng = { lat: number; lng: number };

export type Zone = {
  code: string;
  name: string;
  country: string;
  currency: string;
  distance_unit: 'km' | 'mi';
  timezone?: string;
};

export type VehicleCategory = { type: string; description: string };

export type Serviceability = {
  serviceable: boolean;
  zone: Zone | null;
  vehicle_types: VehicleCategory[];
};

export type FareQuote = {
  estimated_fare: string;
  currency?: string | null;
  distance_unit?: string | null;
  fare_breakdown?: Record<string, unknown>;
};

/** Which categories can actually be priced at this pickup point. */
export async function serviceabilityAt(point: LatLng): Promise<Serviceability> {
  return api.get<Serviceability>(
    `/pricing/vehicle-types/?lat=${point.lat}&lng=${point.lng}`,
  );
}

/**
 * The quote. The server recomputes distance and duration itself -- ours are
 * a hint, and it will not price a trip on numbers the client supplied.
 */
export async function quoteFare(params: {
  pickup: LatLng;
  destination: LatLng;
  distanceKm: number;
  durationMin: number;
  vehicleType: string;
}): Promise<FareQuote> {
  return api.post<FareQuote>(
    '/ride/estimate-fare/',
    {
      pickup_lat: params.pickup.lat,
      pickup_long: params.pickup.lng,
      destination_lat: params.destination.lat,
      destination_long: params.destination.lng,
      distance_km: params.distanceKm,
      duration_min: params.durationMin,
      vehicle_type: params.vehicleType,
    },
    readRiderToken(),
  );
}

export type Place = { description: string; place_id: string };

/**
 * Destination search.
 *
 * The field the server reads is `input`. It answers 502 API_ERROR when
 * GOOGLE_MAPS_API_KEY is unset, which is a real, recoverable condition on a
 * deployment that has not had the key provisioned -- not a bug to hide. The
 * caller surfaces it rather than falling back to invented places.
 */
export async function searchPlaces(
  query: string,
  near?: LatLng | null,
): Promise<Place[]> {
  // BIAS THE SEARCH, OR GET THE WRONG HEMISPHERE. Unbiased, the autocomplete
  // is worldwide: "Banjara" typed by a rider in Hyderabad returned
  // "Banjaran, Bandung Regency, West Java, Indonesia" as its first result,
  // with Banjara Hills nowhere in the list. The server already accepts a
  // `location` bias and passes it to the provider; it simply was not being
  // sent.
  const data = await api.post<{ predictions?: Place[]; results?: Place[] }>(
    '/ride/maps/geocode',
    near
      ? { input: query, location: `${near.lat},${near.lng}` }
      : { input: query },
    readRiderToken(),
  );
  return data?.predictions ?? data?.results ?? [];
}

export async function placeToPoint(placeId: string): Promise<LatLng | null> {
  const data = await api.post<{
    location?: { lat?: number; lng?: number };
    result?: { geometry?: { location?: { lat: number; lng: number } } };
  }>('/ride/maps/place-details', { place_id: placeId }, readRiderToken());

  const loc = data?.location ?? data?.result?.geometry?.location;
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
    return null;
  }
  return { lat: loc.lat, lng: loc.lng };
}

/** A drawable route: the encoded polyline plus what the server measured. */
export type RouteLine = {
  /** Google's encoded polyline, decoded by the map component. */
  points: string;
  distanceText: string;
  durationText: string;
  distanceMeters: number;
  durationSeconds: number;
};

/**
 * The road route between two points, for DRAWING only.
 *
 * Nothing here feeds the fare. `estimate-fare` recomputes distance
 * server-side from the same provider and that remains the only number a
 * rider is charged on -- this is the same journey rendered, not a second
 * opinion about what it costs.
 *
 * The server proxies Routes API, caches the answer for 5 minutes on the
 * coordinate pair, and rate-limits per rider, so calling this repeatedly for
 * the same leg is cheap. Callers should still avoid asking on every GPS
 * frame; see the route key in the booking page.
 */
export async function routeBetween(
  origin: LatLng,
  destination: LatLng,
): Promise<RouteLine | null> {
  const data = await api.post<{
    status?: string;
    routes?: Array<{
      legs?: Array<{
        distance?: { text?: string; value?: number };
        duration?: { text?: string; value?: number };
      }>;
      overview_polyline?: { points?: string };
    }>;
  }>(
    '/ride/maps/directions',
    {
      origin_lat: origin.lat,
      origin_lng: origin.lng,
      dest_lat: destination.lat,
      dest_lng: destination.lng,
    },
    readRiderToken(),
  );

  const route = data?.routes?.[0];
  const points = route?.overview_polyline?.points;
  if (!points) return null;

  const leg = route?.legs?.[0];
  return {
    points,
    distanceText: leg?.distance?.text ?? '',
    durationText: leg?.duration?.text ?? '',
    distanceMeters: leg?.distance?.value ?? 0,
    durationSeconds: leg?.duration?.value ?? 0,
  };
}

export function isMapsUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'API_ERROR';
}

/** Straight-line distance, used ONLY as the hint the server may ignore. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

function wsBase(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  // Derive from the API base so one variable is enough in most deployments:
  // https://host/api/v1 -> wss://host
  const api = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
  try {
    const u = new URL(api);
    return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}`;
  } catch {
    return '';
  }
}

export type SocketEvent = { type: string; [key: string]: unknown };

/**
 * A websocket that reports its own state honestly.
 *
 * `onEvent` receives every frame. `onState` reports connecting / open /
 * closed so the UI can say "reconnecting" instead of appearing to work while
 * nothing is arriving -- a booking screen that looks live but is not is how
 * a rider waits for a driver who was never requested.
 */
export class RideSocket {
  private ws: WebSocket | null = null;
  private closedByUs = false;

  constructor(
    private path: string,
    private onEvent: (e: SocketEvent) => void,
    private onState: (s: 'connecting' | 'open' | 'closed') => void,
  ) {}

  open() {
    const token = readRiderToken();
    const base = wsBase();
    if (!token || !base) {
      this.onState('closed');
      return;
    }
    this.closedByUs = false;
    this.onState('connecting');

    const ws = new WebSocket(
      `${base}${this.path}${this.path.includes('?') ? '&' : '?'}token=${token}`,
    );
    this.ws = ws;

    ws.onopen = () => this.onState('open');
    ws.onmessage = (ev) => {
      try {
        this.onEvent(JSON.parse(ev.data as string) as SocketEvent);
      } catch {
        /* a frame we cannot parse is not a frame we can act on */
      }
    };
    ws.onclose = () => {
      this.onState('closed');
      this.ws = null;
    };
    ws.onerror = () => this.onState('closed');
  }

  send(payload: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }

  close() {
    this.closedByUs = true;
    this.ws?.close();
    this.ws = null;
  }

  get wasClosedByUs() {
    return this.closedByUs;
  }
}

/** The five reasons `/ride/trip/<id>/cancel/` accepts from a RIDER. */
export const RIDER_CANCEL_REASONS = [
  { value: 'no_show', label: 'The driver did not arrive' },
  { value: 'wrong_location', label: 'The pickup point is wrong' },
  { value: 'too_long', label: 'The wait is too long' },
  { value: 'safety', label: 'I feel unsafe' },
  { value: 'other', label: 'Something else' },
] as const;

export async function cancelTrip(tripId: number | string, reason: string) {
  return api.post(`/ride/trip/${tripId}/cancel/`, { reason }, readRiderToken());
}

export async function tripDetail(tripId: number | string) {
  return api.get<Record<string, unknown>>(
    `/ride/trip/${tripId}/`,
    readRiderToken(),
  );
}

export async function rideHistory() {
  // `/ride/ride-history/`, not `/ride/history/`. The shorter path 404s --
  // caught by calling it against deployed QA with a real rider token, which
  // is the only way a wrong URL ever shows up: it type-checks perfectly.
  const data = await api.get<{ results?: unknown[] }>(
    '/ride/ride-history/',
    readRiderToken(),
  );
  return data?.results ?? (Array.isArray(data) ? data : []);
}
