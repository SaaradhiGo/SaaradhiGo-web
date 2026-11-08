'use client';

import { areaGet, areaPost, areaToken } from './api';
import { api } from '@/lib/api';
import { rideBlurbKey, vehicleClassLabel } from '@/lib/vehicles';

/**
 * The rider area's data: every value on its screens comes from these calls.
 * Nothing is filled in when the server does not answer.
 */
export type SavedPlace = {
  id: number; address_text: string; latitude: string | number; longitude: string | number;
  /** What the rider calls it: home, work or other (null for older places). */
  label?: 'home' | 'work' | 'other' | null;
};

export type Trip = {
  id: number;
  pickup_address?: string | null;
  destination_address?: string | null;
  pickup_lat?: string | number | null;
  pickup_long?: string | number | null;
  destination_lat?: string | number | null;
  destination_long?: string | number | null;
  currency?: string | null;
  estimated_fare?: string | null;
  final_fare?: string | null;
  rider_payable?: string | null;
  estimated_distance_km?: string | number | null;
  actual_distance_km?: string | number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  status?: string | null;
  driver_name?: string | null;
  vehicle_info?: { vehicle_number?: string; brand?: string; model?: string; color?: string; type?: string } | null;
  requested_vehicle_type?: string | null;
  requested_at?: string | null;
  accepted_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  timezone?: string | null;
  otp?: string | number | null;
  ratings?: { score?: number; rater_id?: number }[] | null;
  planned_route_polyline?: string | null;
  fare_breakdown?: { total_fare?: string | null } | null;
};

export type Profile = {
  id?: number;
  full_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  created_at?: string | null;
  roles?: string[];
};

type Page<T> = { results?: T[] } | T[];
const list = <T,>(p: Page<T> | null | undefined): T[] => (Array.isArray(p) ? p : p?.results ?? []);

export async function savedPlaces(): Promise<SavedPlace[]> {
  return list(await areaGet<Page<SavedPlace>>('/rider/locations/all/'));
}

/** Coordinates go as strings: the endpoint trims them as text and refuses numbers. */
export async function addPlace(p: { address_text: string; latitude: number; longitude: number; label?: 'home' | 'work' | 'other' }) {
  const r = await areaPost<{ location?: SavedPlace } & SavedPlace>('/rider/locations/', {
    ...p, latitude: p.latitude.toFixed(7), longitude: p.longitude.toFixed(7),
  });
  return r.location ?? r;
}

export async function removePlace(id: number) {
  const token = await areaToken();
  return api.delete(`/rider/locations/${id}/delete/`, token ?? undefined);
}

export async function trips(status?: 'completed' | 'cancelled'): Promise<Trip[]> {
  return list(await areaGet<Page<Trip>>(`/ride/ride-history/${status ? `?status=${status}` : ''}`));
}

export async function trip(id: string | number): Promise<Trip> {
  return areaGet<Trip>(`/ride/trip/${id}/`);
}

/** The driver's public facts for a trip: name, rating, vehicle. */
export async function tripDriver(id: string | number) {
  return areaGet<{ driver_name?: string; driver_rating?: string | number | null; vehicle_info?: Trip['vehicle_info'] }>(
    `/ride/trip/${id}/details/`,
  );
}

export async function receiptPdf(id: string | number) {
  return areaGet<{ pdf_url?: string | null }>(`/ride/trip/${id}/receipt/pdf/`);
}

export async function rateTrip(id: string | number, score: number) {
  return areaPost('/ride/rate-trip/', { trip_id: Number(id), score });
}

export async function profile(): Promise<Profile> {
  const p = await areaGet<Profile & { user?: Profile }>('/auth/profile/');
  return p.user ?? p;
}

export async function updateName(patch: { full_name?: string; email?: string }) {
  const token = await areaToken();
  return api.patch<Profile>('/auth/update/', patch, token ?? undefined);
}

export async function exportData() {
  return areaGet<Record<string, unknown>>('/auth/me/export/');
}

export async function deleteAccount() {
  return areaPost('/auth/me/delete/', { confirm: 'DELETE' });
}

/** The fare the rider booked: the locked estimate the trip carries. */
export function lockedFare(t: Trip): string | null {
  return t.estimated_fare ?? null;
}

/**
 * What the rider paid: the payable after a promo, else the final fare. A
 * completed trip whose fare did not change keeps `final_fare` empty (the
 * quoted fare is the charged fare, ruling D6), so its own fare total, then
 * its locked fare, is what was paid. Nothing for a trip not completed.
 */
export function paidFare(t: Trip): string | null {
  if (t.rider_payable) return t.rider_payable;
  if (t.final_fare) return t.final_fare;
  if (t.status !== 'completed') return null;
  return t.fare_breakdown?.total_fare ?? t.estimated_fare ?? null;
}

const CLASS_NAMES = { auto: 'Auto', mini: 'Mini', sedan: 'Sedan', suv: 'SUV' } as const;

/**
 * The class name riders see, as the rider app names it (Auto, Mini, Sedan,
 * SUV; `hatchback` is Mini), in Latin in every language.
 */
export function className(type: string | null | undefined): string | null {
  if (!type) return null;
  const key = rideBlurbKey(type);
  return key ? CLASS_NAMES[key] : vehicleClassLabel(type);
}

/** Country calling codes the markets use, longest first. */
const CODES = ['91', '44', '61', '1'];

/** Masks all but the last three digits: "+91 ••••• ••210". */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, '');
  if (!digits.startsWith('+')) return phone;
  const code = CODES.find((c) => digits.slice(1).startsWith(c));
  if (!code) return phone;
  const rest = digits.slice(1 + code.length);
  const hidden = rest.slice(0, -3).replace(/\d/g, '•');
  return `+${code} ${hidden.slice(0, 5)} ${hidden.slice(5)}${rest.slice(-3)}`.replace(/\s+/g, ' ').trim();
}
