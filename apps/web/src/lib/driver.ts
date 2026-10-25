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
