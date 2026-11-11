// Safety on the live trip: SOS and share (PRODUCT_AUDIT §2, owner decision D4).
//
// The web live trip had neither, and the spec requires both on every
// live-trip screen. Nothing here is decided in the browser:
//
//   POST /sos/                     raise, with the trip id; the server stores
//                                  the alert, anchors it and fans it out
//   POST /sos/<id>/mistake/        the raiser's "Tap if this was a mistake",
//                                  the same audited path as an ops false alarm
//   GET  /app-config/?country=XX   the market's emergency number and
//                                  SaaradhiGo's support line (null if unset)
//
// Share is text the rider sends themselves: there is no shareable-trip
// endpoint, so it carries only facts the server already gave this page and
// never a tracking link that does not exist.

import { api } from './api';
import { serviceabilityAt, type LatLng } from './booking';
import { readRiderToken } from './publicAuth';

export type SafetyNumbers = {
  emergency: string | null;
  emergencyLabel: string | null;
  support: string | null;
};

/**
 * The numbers for [country], or nulls when app-config cannot be read. A trip
 * restored after a reload has no zone on the page yet, so the country then
 * comes from the zone at [near] (the pickup).
 */
export async function safetyNumbers(
  country: string | null | undefined,
  near?: LatLng | null,
): Promise<SafetyNumbers> {
  const none = { emergency: null, emergencyLabel: null, support: null };
  if (!country && near) {
    try {
      country = (await serviceabilityAt(near)).zone?.country ?? null;
    } catch {
      country = null;
    }
  }
  if (!country) return none;
  try {
    const data = await api.get<Record<string, unknown>>(
      `/app-config/?country=${encodeURIComponent(country)}&app=rider`,
    );
    const c = (data?.country ?? {}) as Record<string, unknown>;
    const em = (c.emergency ?? {}) as Record<string, unknown>;
    const first = Array.isArray(em.numbers) ? (em.numbers[0] as Record<string, unknown>) : null;
    const support = ((c.support ?? {}) as Record<string, unknown>).phone;
    return {
      emergency: first?.number ? String(first.number) : null,
      emergencyLabel: em.label ? String(em.label) : null,
      support: support ? String(support) : null,
    };
  } catch {
    return none;
  }
}

/** Raise an SOS for the rider's live trip. Returns the alert id. */
export async function raiseSos(tripId: number | string, at?: { lat: number; lng: number } | null) {
  const body: Record<string, unknown> = { trip_id: Number(tripId), event_type: 'panic' };
  if (at) {
    body.lat = at.lat;
    body.lng = at.lng;
  }
  const data = await api.post<{ sos_id?: number; id?: number }>('/sos/', body, readRiderToken());
  const id = data?.sos_id ?? data?.id;
  return typeof id === 'number' ? id : Number(id) || null;
}

/** "Tap if this was a mistake": close the rider's own alert as a false alarm. */
export async function reportSosMistake(sosId: number) {
  await api.post(`/sos/${sosId}/mistake/`, {}, readRiderToken());
}

/** The message a rider shares, from facts the page already has. */
export function shareTripText(t: {
  tripId: number | string | null;
  driverName?: string | null;
  plate?: string | null;
  pickupLabel?: string | null;
  destinationLabel?: string | null;
}): string {
  const lines = ['I am on a SaaradhiGo ride.'];
  if (t.driverName) lines.push(`Driver: ${t.driverName}`);
  if (t.plate) lines.push(`Vehicle: ${t.plate}`);
  if (t.pickupLabel) lines.push(`From: ${t.pickupLabel}`);
  if (t.destinationLabel) lines.push(`To: ${t.destinationLabel}`);
  if (t.tripId !== null && t.tripId !== undefined && `${t.tripId}` !== '') {
    lines.push(`Trip: #${t.tripId}`);
  }
  return lines.join('\n');
}
