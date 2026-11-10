'use client';

import { areaGet, areaPatch, areaPost } from './api';
import type { Trip } from './rider';

/**
 * The driver area's data. Money comes from the settlement ledger the backend
 * keeps (`/driver/earnings/*`) and the wallet (`/driver/withdrawals/*`); this
 * module adds nothing up except where a screen shows lines and their total,
 * and those totals are checked against the server's (earningsLines).
 */
export type Period = 'today' | 'week' | 'month';

export type PeriodTotals = {
  period: Period;
  start: string;
  end: string;
  timezone: string;
  currency: string;
  trips: number;
  gross: string;
  commission: string;
  net: string;
  cash_collected: string;
  unresolved_trips: number;
};

export type Day = { date: string; trips: number; gross: string; commission: string; net: string };

export type Balance = {
  available_balance?: string | null;
  currency?: string | null;
  withdrawals_available?: boolean;
  minimum_withdrawal?: string | null;
  /** The next scheduled payout (owner ruling, 9 Nov), or null when payouts are on request. */
  next_payout?: { date: string; at: string; estimated_amount: string; currency: string } | null;
  /** Withdraw now: offered only where instant cash-out is on for the driver's city. */
  instant?: { available: boolean; provider: string | null; saaradhigo_fee: string } | null;
};

export type Withdrawal = {
  id: number;
  amount?: string | null;
  currency?: string | null;
  status?: string | null;
  requested_at?: string | null;
  processed_at?: string | null;
  /** Withdraw now (10 Nov): `instant`, with the provider fee it cost (minor units). */
  origin?: string | null;
  fee_minor?: number | null;
};

/** One settled trip from the ledger (GET /driver/earnings/). */
export type EarningRow = {
  id: number;
  trip_id_val?: number | null;
  amount?: string | null;
  commission?: string | null;
  net_amount?: string | null;
  created_at?: string | null;
  method?: string | null;
  cash_in_hand?: string | null;
};

export type Profile = {
  status?: string | null;
  approved?: boolean;
  doc_status?: string | null;
  total_trips?: number | null;
  ratings?: string | number | null;
  license_expiry?: string | null;
  active_vehicle_details?: {
    vehicle_number?: string | null; brand?: string | null; model?: string | null; color?: string | null;
    vehicle_type?: { type?: string | null } | null;
    insurance_expiry?: string | null; permit_expiry?: string | null;
  } | null;
};

export type Doc = {
  key: string; label: string; status?: string | null; reason?: string | null; required: boolean; present: boolean;
  recordable?: boolean; upload_kind?: string | null; target?: 'driver' | 'vehicle';
};
export type Onboarding = {
  driver_documents?: Doc[]; vehicle_documents?: Doc[]; license_expiry?: string | null;
  approved?: boolean; doc_status?: string | null; vehicle_types?: { type: string; description?: string }[];
  vehicle?: { id: number; vehicle_number?: string | null; brand?: string | null; model?: string | null; color?: string | null } | null;
};
export type Vehicle = {
  id: number; insurance_expiry?: string | null; permit_expiry?: string | null; fitness_expiry?: string | null; puc_expiry?: string | null;
  vehicle_number?: string | null; brand?: string | null; model?: string | null; color?: string | null;
  vehicle_type?: { type?: string | null } | string | null;
};
/** What riders see of the car; saving any of it sends the driver to review (10 Nov). */
export type VehicleForm = { vehicle_type: string; brand: string; model: string; color: string; vehicle_number: string };

type Page<T> = { results?: T[] } | T[];
const list = <T,>(p: Page<T> | null | undefined): T[] => (Array.isArray(p) ? p : p?.results ?? []);

export const period = (p: Period) => areaGet<PeriodTotals>(`/driver/earnings/period/?period=${p}`);
export type Days = { days: Day[]; currency?: string | null; timezone?: string | null };
export const daily = (n = 7) => areaGet<Days>(`/driver/earnings/daily/?days=${n}`);
export const days = async (n = 7) => (await daily(n)).days;
export const balance = () => areaGet<Balance>('/driver/withdrawals/balance/');
export const withdrawals = async () => list(await areaGet<Page<Withdrawal>>('/driver/withdrawals/history/'));
/** The latest 50 settled trips, newest first (the endpoint's page limit). */
export const ledger = async () => list(await areaGet<Page<EarningRow>>('/driver/earnings/?page_size=50'));
export const profile = () => areaGet<Profile>('/driver/driver/profile/');
export const onboarding = () => areaGet<Onboarding>('/driver/driver/onboarding/');
export const vehicles = async () => list(await areaGet<Page<Vehicle>>('/driver/vehicles/'));
export const saveVehicle = (id: number | null, v: VehicleForm) => (id
  ? areaPatch<Vehicle>(`/driver/vehicles/${id}/`, v)
  : areaPost<Vehicle>('/driver/vehicles/add/', v));
/** "In review" until an operator approves (the KYC queue); the driver stays offline meanwhile. */
export const inReview = (o: { approved?: boolean; doc_status?: string | null } | null) => !!o && !o.approved && o.doc_status === 'pending';
export const history = async (start?: string, end?: string) => {
  const q = new URLSearchParams({ page_size: '50', ...(start ? { start_date: start } : {}), ...(end ? { end_date: end } : {}) });
  return list(await areaGet<Page<Trip>>(`/ride/driver-history/?${q}`));
};

/** Whether dispatch shows this driver as online right now. */
export function isOnline(p: Profile | null): boolean {
  return ['online', 'active', 'on ride', 'off ride'].includes((p?.status ?? '').toLowerCase());
}

const n = (v: string | null | undefined) => (v == null || v === '' ? 0 : Number(v));

/**
 * The earnings breakdown as the screen shows it: fares, minus commission,
 * is what the driver earned; minus the cash they already hold. Each line is
 * the ledger's own figure; `earned` is checked against the ledger's net, so
 * a screen whose lines do not add up is caught (tests).
 */
export function earningsLines(t: PeriodTotals) {
  const fares = n(t.gross);
  const commission = n(t.commission);
  const earned = n(t.net);
  const cash = n(t.cash_collected);
  return {
    fares, commission, earned, cash,
    afterCash: Math.round((earned - cash) * 100) / 100,
    addsUp: Math.abs(fares - commission - earned) < 0.005,
  };
}

/** Days until a YYYY-MM-DD date, in the reader's calendar; null when unknown. */
export function daysUntil(date: string | null | undefined, now = new Date()): number | null {
  if (!date) return null;
  const at = Date.parse(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(at)) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((at - today) / 86_400_000);
}

/** The document closest to expiring within 30 days, for the banner. */
export function nextExpiry(p: Profile | null, v: Vehicle | null, now = new Date()) {
  const candidates: { label: string; days: number }[] = [];
  const add = (label: string, d: string | null | undefined) => {
    const left = daysUntil(d, now);
    if (left !== null && left <= 30) candidates.push({ label, days: left });
  };
  add('Vehicle insurance', v?.insurance_expiry ?? p?.active_vehicle_details?.insurance_expiry);
  add('Vehicle permit', v?.permit_expiry ?? p?.active_vehicle_details?.permit_expiry);
  add('Fitness certificate', v?.fitness_expiry);
  add('Pollution certificate', v?.puc_expiry);
  add('Driving licence', p?.license_expiry);
  return candidates.sort((a, b) => a.days - b.days)[0] ?? null;
}
