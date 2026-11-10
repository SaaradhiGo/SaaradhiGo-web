'use client';

import { ApiError, api } from '@/lib/api';
import { readRiderToken } from '@/lib/publicAuth';
import { describeFileProblem } from '@/lib/uploads';
import { areaGet, areaPatch, areaPost } from './api';

/**
 * What a driver provides, per market (10 Nov). The server decides which items the market asks
 * for (`/driver/requirements/`); these screens render what they are told and never keep a
 * per-country list of their own.
 */
export type ItemStatus = 'missing' | 'in_review' | 'approved' | 'rejected' | 'expiring' | 'done';
export type Need = 'required' | 'optional' | 'off';
export type ChecklistItem = {
  key: string; section: 'personal' | 'identity' | 'vehicle' | 'payouts'; label: string; help: string;
  need: Need; blocks_online: boolean; status: ItemStatus; reason: string | null; expires: string | null;
};
export type Checklist = {
  market: { country: string; state: string }; items: ChecklistItem[]; done: number; total: number;
  blocking: string[]; approved: boolean;
};
export type Address = { line1: string; line2: string; city: string; state_code: string; postal_code: string };
export type Contact = { position: number; name: string; relationship: string; phone_number: string };
export type Personal = {
  full_name: string; name_pending: string | null; photo: string | null; photo_pending: string | null;
  dob: string | null; address: Address | null; permanent_address: Address | null; emergency_contacts: Contact[];
};
export type Identity = {
  license_number: string; license_state: string; license_expiry: string | null; aadhaar_masked: string | null;
  pan_masked: string | null; police_verification_status: string; background_check_status: string;
};
export type PayoutMethod = {
  kind: 'bank' | 'upi' | 'stripe' | null; held_until: string | null; stripe_status?: 'not_started' | 'in_progress' | 'ready';
  bank?: { holder_name: string; account_masked: string; ifsc: string; bank_name: string; branch: string; verification_status: string } | null;
  upi_masked?: string | null;
};
export type Requirements = {
  config: { country: string; state: string; items: Record<string, { need: Need; blocks_online: boolean }>;
    min_driver_age: number | null; max_vehicle_age_years: number | null; languages: string[] };
  checklist: Checklist; personal: Personal; identity: Identity; payout_method: PayoutMethod;
  states: { code: string; name: string }[]; relationships: { code: string; label: string }[];
  vehicle_types: string[]; vehicle_years: number[]; upload_kinds: Record<string, string>;
};
export type Catalogue = { type: string; makes: { make: string; models: { id: number; model: string }[] }[]; colours: string[] };

export const requirements = () => areaGet<Requirements>('/driver/requirements/');
export const savePersonal = (body: Record<string, unknown>) => areaPatch<{ personal: Personal; checklist: Checklist }>('/driver/personal/', body);
export const saveIdentity = (body: Record<string, unknown>) => areaPatch<{ identity: Identity; checklist: Checklist }>('/driver/identity/', body);
export const savePayoutMethod = (body: Record<string, unknown>) => api.put<PayoutMethod>('/driver/payout-method/', body, readRiderToken());
export const stripeOnboarding = () => areaPost<{ url: string; stripe_status: string }>('/driver/payout-method/stripe/', {
  return_url: typeof window !== 'undefined' ? `${window.location.origin}/driver/profile?stripe=return#payouts` : '',
});
export const stripeRefresh = (fakeDone = false) => areaPost<{ stripe_status: string }>('/driver/payout-method/stripe/refresh/', { fake_done: fakeDone });
export const catalogue = (type: string) => areaGet<Catalogue>(`/driver/vehicle-catalogue/?type=${encodeURIComponent(type)}`);
export const ifsc = (code: string) => areaGet<{ bank: string; branch: string; city: string }>(`/driver/ifsc/${encodeURIComponent(code)}/`);

/** One file to the endpoint that owns it: `personal/` (photo), `identity/` (documents), a vehicle. */
export async function uploadFile(target: 'personal' | 'identity' | { vehicle: number }, field: string, file: File) {
  const problem = describeFileProblem(file);
  if (problem) throw new ApiError(0, 'UPLOAD_REJECTED', problem, true);
  const form = new FormData();
  form.append(field, file, file.name);
  const path = typeof target === 'string' ? `/driver/${target}/` : `/driver/vehicles/${target.vehicle}/`;
  return api.patchForm(path, form, readRiderToken());
}

export const STATUS_LABEL: Record<ItemStatus, string> = {
  missing: 'Missing', in_review: 'In review', approved: 'Approved', rejected: 'Rejected',
  expiring: 'Expiring', done: 'Done',
};
export const STATUS_TONE: Record<ItemStatus, string> = {
  missing: 'apill--neu', in_review: 'apill--warn', approved: 'apill--ok', rejected: 'apill--err',
  expiring: 'apill--warn', done: 'apill--ok',
};
/** Where each item is fixed. */
export const FIX_AT: Record<string, string> = {
  profile_photo: '/driver/profile#personal', legal_name: '/driver/profile#personal',
  date_of_birth: '/driver/profile#personal', address: '/driver/profile#personal',
  permanent_address: '/driver/profile#personal', address_proof: '/driver/documents',
  emergency_contact: '/driver/profile#contacts', driving_licence: '/driver/profile#identity',
  aadhaar: '/driver/profile#identity', pan: '/driver/profile#identity',
  police_verification: '/driver/profile#identity', background_check: '/driver/support',
  vehicle: '/driver/profile#vehicle', vehicle_photos: '/driver/profile#vehicle',
  rc: '/driver/documents', registration: '/driver/documents', insurance: '/driver/documents',
  permit: '/driver/documents', fitness: '/driver/documents', puc: '/driver/documents',
  inspection: '/driver/documents', payout_method: '/driver/profile#payouts',
};
