'use client';

import { areaDelete, areaGet, areaPatch, areaPost, areaToken } from './api';
import { api } from '@/lib/api';
import { normalisePhone, verifyPhoneForSignup } from '@/lib/publicAuth';
import { rideBlurbKey, vehicleClassLabel } from '@/lib/vehicles';

/**
 * The rider area's data: every value on its screens comes from these calls.
 * Nothing is filled in when the server does not answer.
 */
export type SavedPlace = {
  id: number; address_text: string; latitude: string | number; longitude: string | number;
  /** What the rider calls it: home, work or other (null for older places). */
  label?: 'home' | 'work' | 'other' | null;
  /** The rider's own name for an "other" place. */
  name?: string;
  in_service_area?: boolean;
  /** "Outside our service area for now", when it is. */
  notice?: string | null;
};

export type PlaceLabel = 'home' | 'work' | 'other';
export type PlaceInput = { label: PlaceLabel; name?: string; address_text: string; latitude: number; longitude: number };

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
  fare_breakdown?: { total_fare?: string | null; base_fare?: string | null; distance_fare?: string | null;
    time_fare?: string | null; surge_multiplier?: string | null; gst_amount?: string | null } | null;
  /** 11 Nov: why the system cancelled (no_driver_accepted), when the search ends, the invoice. */
  cancellation_reason?: string | null;
  cancellation_message?: string | null;
  search_expires_at?: string | null;
  vehicle_line?: string | null;
  invoice?: { number: string; issued_at?: string | null; rider_name: string; tax_label?: string; tax_amount?: string;
    total?: string; currency?: string; company: { name: string; address?: string; gstin?: string };
    /** 12 Nov: the lines before tax, the taxable value, the tax and the total, adding up exactly. */
    breakdown?: FareLines | null } | null;
};

/** The fare lines (servers/ride/invoice_lines.py): lines sum to `taxable`; taxable + tax + extras = total. */
export type FareLines = {
  lines: { code: string; label: string; amount: string }[];
  taxable: string;
  tax: { label: string; percent: string; amount: string; included: boolean };
  extras: { code: string; label: string; amount: string }[];
  total: string;
  currency: string;
};

export type Profile = {
  id?: number;
  full_name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  created_at?: string | null;
  roles?: string[];
  role?: string | null;
  avatar?: string | null;
  /** The languages offered in the account's market (10 Nov). */
  market_languages?: string[];
  market_country?: string | null;
  /** 11 Nov: riders sign up by email; the number is proved at the first booking. */
  phone_verified?: boolean;
  email_verified?: boolean;
  /** 12 Nov: present while the email is unconfirmed: whether a link can be emailed here at all. */
  email_mail_available?: boolean;
};

type Page<T> = { results?: T[] } | T[];
const list = <T,>(p: Page<T> | null | undefined): T[] => (Array.isArray(p) ? p : p?.results ?? []);

/** Saved places, Home and Work first (GET /rider/places/, 9 Nov). */
export async function savedPlaces(): Promise<SavedPlace[]> {
  const r = await areaGet<{ places?: SavedPlace[] }>('/rider/places/');
  return r.places ?? [];
}

const coords = (p: Partial<PlaceInput>) => ({
  ...p,
  ...(p.latitude !== undefined ? { latitude: p.latitude.toFixed(7) } : {}),
  ...(p.longitude !== undefined ? { longitude: p.longitude.toFixed(7) } : {}),
});

export async function createPlace(p: PlaceInput): Promise<SavedPlace> {
  return (await areaPost<{ place: SavedPlace }>('/rider/places/', coords(p))).place;
}

export async function updatePlace(id: number, p: Partial<PlaceInput>): Promise<SavedPlace> {
  return (await areaPatch<{ place: SavedPlace }>(`/rider/places/${id}/`, coords(p))).place;
}

export async function deletePlace(id: number) {
  return areaDelete(`/rider/places/${id}/`);
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

/** The sign-in number changes only with the code texted to the new one (10 Nov). */
export async function changePhone(phone: string, otp: string): Promise<Profile> {
  const { phone_proof } = await verifyPhoneForSignup(phone, otp);
  return areaPost<Profile>('/auth/phone/change/', { phone_number: normalisePhone(phone), phone_proof });
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

/** The arrival estimate (GET /ride/trip/<id>/eta/); null when there is no honest one. */
export type Eta = {
  phase: 'to_pickup' | 'at_pickup' | 'to_drop' | null;
  pickup_eta_min: number | null;
  pickup_distance_km: string | null;
  drop_eta_min: number | null;
  arrive_at: string | null;
  estimated: boolean;
};

export async function tripEta(id: string | number): Promise<Eta | null> {
  return (await areaGet<{ eta: Eta | null }>(`/ride/trip/${id}/eta/`)).eta ?? null;
}

export type Contact = { id: number; name: string; phone: string; opted_out?: boolean };

export async function trustedContacts(): Promise<{ contacts: Contact[]; max: number; note: string }> {
  return areaGet('/sharing/contacts/');
}

export async function addContact(c: { name: string; phone: string }): Promise<Contact> {
  return (await areaPost<{ contact: Contact }>('/sharing/contacts/', c)).contact;
}

export async function removeContact(id: number) {
  return areaDelete(`/sharing/contacts/${id}/`);
}

export async function sharingSettings(): Promise<{ auto_share: boolean; contacts: number }> {
  return areaGet('/sharing/settings/');
}

export async function setAutoShare(on: boolean): Promise<{ auto_share: boolean }> {
  return areaPatch('/sharing/settings/', { auto_share: on });
}

export type Share = { active: boolean; url: string | null; expires_at?: string | null };

export async function tripShare(id: string | number): Promise<Share> {
  return areaGet(`/sharing/trips/${id}/share/`);
}

export async function startShare(id: string | number): Promise<Share> {
  return areaPost(`/sharing/trips/${id}/share/`, {});
}

export async function stopShare(id: string | number): Promise<Share> {
  return areaDelete(`/sharing/trips/${id}/share/`);
}

/** A masked call: a temporary number to dial, never the driver's own. */
export type Call = { session_id: number; kind: 'number' | 'session'; number: string | null; expires_at: string };

export async function startCall(tripId: string | number): Promise<Call> {
  return (await areaPost<{ call: Call }>(`/calls/trips/${tripId}/start/`, {})).call;
}

export async function endCall(sessionId: number) {
  return areaPost(`/calls/sessions/${sessionId}/end/`, {});
}


// --- 11 Nov rider QA fixes ------------------------------------------------------------------

/** Send the "Confirm your email" link again. */
export async function requestEmailConfirmation() {
  return areaPost('/auth/email/verify/request/', {});
}

export type PayMethod = 'upi' | 'card' | 'cash';
export type BookingOptions = {
  payment: { methods: PayMethod[]; default: PayMethod | null; online_unavailable_reason?: string };
  search_timeout_seconds: number;
  phone_required: boolean;
};

/** How the rider can pay here, the city's search time, and whether the mobile is still needed. */
export async function bookingOptions(p: { lat: number; lng: number }) {
  const q = new URLSearchParams({ lat: String(p.lat), lng: String(p.lng) });
  return areaGet<BookingOptions>(`/ride/booking-options/?${q}`);
}

/** A street address for a point (one cached Maps call), or null. */
export async function streetAddress(p: { lat: number; lng: number }): Promise<string | null> {
  const data = await areaPost<{ results?: { formatted_address?: string }[] }>('/ride/maps/reverse-geocode', { lat: p.lat, lng: p.lng });
  return data?.results?.[0]?.formatted_address ?? null;
}

/**
 * The trip being planned, kept in this tab rather than the URL (11 Nov): coordinates in a URL
 * end up in logs and analytics. The URL carries only a random id.
 */
export type RideDraft = { from: { lat: number; lng: number; label: string }; to: { lat: number; lng: number; label: string } };
const DRAFT_KEY = 'sg-ride-draft:';
export function saveDraft(d: RideDraft): string {
  const id = Math.random().toString(36).slice(2, 10);
  try { sessionStorage.setItem(DRAFT_KEY + id, JSON.stringify(d)); } catch { /* the page still has it */ }
  return id;
}
export function readDraft(id: string | null): RideDraft | null {
  if (!id) return null;
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY + id);
    return raw ? (JSON.parse(raw) as RideDraft) : null;
  } catch { return null; }
}

/** Online payment at the end of the trip, for the locked fare (Razorpay Checkout). */
export type Order = { payment_id: number; gateway: string; order_id?: string; gateway_order_id?: string; key_id?: string;
  amount_paise?: string | number; currency?: string; description?: string;
  prefill?: { name?: string; contact?: string; email?: string } };
export async function createOrder(tripId: string | number) {
  return areaPost<Order>('/payments/create-order/', { trip_id: Number(tripId) });
}
export async function verifyPayment(body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) {
  return areaPost('/payments/verify/', { ...body, gateway: 'razorpay' });
}
/** The fallback when online payment fails: the rider pays the driver in cash. */
export async function payByCash(tripId: string | number) {
  return areaPost('/payments/switch/', { trip_id: Number(tripId), new_method: 'cash' });
}
