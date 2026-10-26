// The driver's own data, for the driver's own screens.
//
// Everything here is a real endpoint the driver app already uses. Nothing is
// computed in the browser and nothing is filled in when the server does not
// answer: a field the API did not return is shown as not set, never as a
// plausible number.

import { api } from './api';
import { readRiderToken } from './publicAuth';

export type Vehicle = {
  id?: number;
  vehicle_number?: string | null;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  year?: number | string | null;
  capacity?: number | null;
  vehicle_type?: { type?: string | null; description?: string | null } | null;
  insurance_expiry?: string | null;
  permit_expiry?: string | null;
};

export type DriverProfile = {
  id?: number;
  status?: string | null;
  approved?: boolean;
  /**
   * Whether dispatch will actually send this driver a trip right now.
   *
   * NOT the same question as `approved`, and the difference is why this
   * field exists on the server: the app used to route from `approved` alone
   * and disagreed with the three WebSocket gates that decide the real
   * answer. The screen shows both, labelled as what they each are.
   */
  dispatch_eligible?: boolean;
  qa_simulated_eligibility?: boolean;
  /**
   * The operator's review outcome, and why.
   *
   * Newly readable. Before it, a driver whose documents were rejected saw
   * only `approved: false` -- exactly what a driver who has uploaded
   * nothing sees. Read-only: an operator decides it.
   */
  doc_status?: string | null;
  doc_rejection_reason?: string | null;
  total_trips?: number;
  ratings?: string | number | null;
  license_expiry?: string | null;
  active_vehicle_details?: Vehicle | null;
};

export type EarningsSummary = {
  total_earned?: string;
  total_net?: string;
  total_commission?: string;
  total_trips?: number;
  today_earned?: string;
  today_net?: string;
  today_trips?: number;
  wallet_balance?: string;
  cash_collected?: string;
  commission_percent?: string;
};

export type DriverTrip = {
  id?: number | string;
  status?: string | null;
  pickup_address?: string | null;
  destination_address?: string | null;
  requested_at?: string | null;
  fare?: string | number | null;
  total_fare?: string | number | null;
};

function token() {
  return readRiderToken();
}

export function driverProfile() {
  return api.get<DriverProfile>('/driver/driver/profile/', token());
}

export function driverEarnings() {
  return api.get<EarningsSummary>('/driver/earnings/summary/', token());
}

export function driverVehicles() {
  return api.get<Vehicle[] | { results?: Vehicle[] }>('/driver/vehicles/', token());
}

export function driverTrips() {
  return api.get<DriverTrip[] | { results?: DriverTrip[] }>(
    '/ride/driver-history/',
    token(),
  );
}

/** Lists come back bare or paginated depending on the endpoint. */
export function rows<T>(value: T[] | { results?: T[] } | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.results)) return value.results;
  return [];
}

// ---------------------------------------------------------------------------
// Onboarding: what this driver still has to supply.
// ---------------------------------------------------------------------------
//
// The checklist is the SERVER'S, computed from the same compliance rules the
// operator console reviews against. Nothing here decides which documents are
// required or what they are called -- a web page that kept its own copy of
// that would be a third place to update when a country's rules change, and
// the one most likely to be missed.

export type ChecklistDocument = {
  key: string;
  label: string;
  description: string;
  required: boolean;
  present: boolean;
  /** False where the requirement has no column to store it in. */
  recordable: boolean;
  /** The `kind` to presign against, or null if it cannot be uploaded. */
  upload_kind: string | null;
  /** 'driver' or 'vehicle' -- which endpoint the key is submitted to. */
  target: string;
};

export type Onboarding = {
  country?: string;
  approved?: boolean;
  doc_status?: string;
  doc_rejection_reason?: string;
  license_expiry?: string | null;
  license_expiry_ok?: boolean;
  driver_documents?: ChecklistDocument[];
  vehicle_documents?: ChecklistDocument[];
  vehicle?: {
    id: number;
    vehicle_number?: string | null;
    brand?: string | null;
    model?: string | null;
    color?: string | null;
    is_active?: boolean;
  } | null;
  outstanding?: string[];
  /** "Nothing obvious left to upload" — NOT "approved". */
  ready_for_review?: boolean;
  /**
   * The vehicle categories the platform knows about.
   *
   * It comes from here rather than from `/pricing/vehicle-types/` because
   * that endpoint needs a lat/lng: it answers "what can I be quoted at this
   * pickup point", which is not the question "what kind of car do you
   * drive". A driver registering a vehicle has no pickup point.
   */
  vehicle_types?: Array<{ type: string; description?: string }>;
};

export function driverOnboarding() {
  return api.get<Onboarding>('/driver/driver/onboarding/', token());
}

/** Attach an uploaded key (or the licence expiry) to the driver record. */
export function patchDriverProfile(patch: Record<string, unknown>) {
  return api.patch<DriverProfile>('/driver/driver/update/', patch, token());
}

/** Attach an uploaded key to one of the driver's vehicles. */
export function patchVehicle(vehicleId: number, patch: Record<string, unknown>) {
  return api.patch<Vehicle>(`/driver/vehicles/${vehicleId}/`, patch, token());
}

export type NewVehicle = {
  vehicle_number: string;
  vehicle_type: string;
  brand?: string;
  model?: string;
  color?: string;
  year?: number | null;
};

export function createVehicle(vehicle: NewVehicle) {
  return api.post<Vehicle>('/driver/vehicles/add/', vehicle, token());
}

/**
 * Make a vehicle the one the driver actually drives.
 *
 * Separate from adding it because the KYC gate requires `active_vehicle` to
 * be SET, not merely for a vehicle to exist -- a driver with two cars and
 * neither selected is refused, and the checklist says so.
 */
export function setActiveVehicle(vehicleId: number) {
  return patchDriverProfile({ active_vehicle: vehicleId });
}
