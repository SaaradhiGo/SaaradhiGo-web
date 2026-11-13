'use client';

import { ApiError, api } from '@/lib/api';
import { readRiderToken } from '@/lib/publicAuth';
import { describeFileProblem } from '@/lib/uploads';
import { areaGet, areaPatch, areaPost } from './api';
import { STEP_SLUG, type StepKey } from './setupSlugs';

/**
 * What a driver provides, per market (10 Nov). The server decides which items the market asks
 * for (`/driver/requirements/`); these screens render what they are told and never keep a
 * per-country list of their own.
 */
export type ItemStatus = 'missing' | 'in_review' | 'approved' | 'rejected' | 'expiring' | 'done';
export type Need = 'required' | 'optional' | 'off';
export type FileTile = {
  key: string; label: string; status: ItemStatus; reason: string | null; uploaded_at: string | null; vehicle: boolean;
};
export type { StepKey };
export type StepStatus = 'done' | 'in_review' | 'todo' | 'action';
export type Step = { key: StepKey; number: number; items: string[]; status: StepStatus };
export type ChecklistItem = {
  key: string; section: 'personal' | 'identity' | 'vehicle' | 'payouts'; label: string; help: string;
  need: Need; blocks_online: boolean; status: ItemStatus; reason: string | null; expires: string | null;
  step?: StepKey; files?: FileTile[];
};
export type Checklist = {
  market: { country: string; state: string }; items: ChecklistItem[]; done: number; total: number;
  blocking: string[]; approved: boolean;
  /** Guided setup (10 Nov v2): the server's six steps, worst-of status, and what is next. */
  steps?: Step[]; steps_done?: number; next_step?: StepKey | null; minutes_left?: number;
};
export type Address = { line1: string; line2: string; city: string; state_code: string; postal_code: string };
export type Contact = { position: number; name: string; relationship: string; phone_number: string };
export type Personal = {
  full_name: string; name_pending: string | null; photo: string | null; photo_pending: string | null;
  dob: string | null; address: Address | null; permanent_address: Address | null; emergency_contacts: Contact[];
  home_city?: string | null;
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
  /** 12 Nov: the city's KYC review target, the same number the console's queue alerts on. */
  review_target_working_days?: number;
};

/** "We usually review within one working day." from the city's review target (12 Nov). */
export function reviewPromise(days: number | null | undefined, tr: (s: string) => string, short = false): string {
  const n = days && days > 0 ? days : 1;
  if (short) {
    return n === 1 ? tr('Usually one working day. Each document shows its own state; a rejected one says why.')
      : tr('Usually {n} working days. Each document shows its own state; a rejected one says why.').replace('{n}', String(n));
  }
  return n === 1 ? tr('You can go online once every step is approved. We usually review within one working day.')
    : tr('You can go online once every step is approved. We usually review within {n} working days.').replace('{n}', String(n));
}
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
/**
 * 13 Nov: an optional item nobody added is not "Missing": it reads "Optional · not added", in
 * grey, and never counts toward the total (the server's done/total already leaves it out). The
 * driver app and the console use the same words.
 */
export const OPTIONAL_NOT_ADDED = 'Optional · not added';
export function isOptionalNotAdded(it: { need?: string; status: string }) {
  return it.need === 'optional' && it.status === 'missing';
}
export function itemLabel(it: { need?: string; status: ItemStatus }) {
  return isOptionalNotAdded(it) ? OPTIONAL_NOT_ADDED : STATUS_LABEL[it.status];
}
export function itemTone(it: { need?: string; status: ItemStatus }) {
  return isOptionalNotAdded(it) ? 'apill--neu' : STATUS_TONE[it.status];
}
export const STATUS_TONE: Record<ItemStatus, string> = {
  missing: 'apill--neu', in_review: 'apill--warn', approved: 'apill--ok', rejected: 'apill--err',
  expiring: 'apill--warn', done: 'apill--ok',
};
/** The setup steps' names and what each asks for (titles are the design's). */
export const STEP_INFO: Record<StepKey, { title: string; sub: string; lead: string }> = {
  personal: { title: 'Personal details', sub: 'Photo, name, date of birth, address', lead: 'Your name and date of birth exactly as on your licence.' },
  contact: { title: 'Emergency contact', sub: 'Someone we can call in an SOS', lead: 'Support and our safety team call them only if you need help on a trip.' },
  identity: { title: 'Licence and identity', sub: '', lead: 'Use the details exactly as they appear on your documents.' },
  vehicle: { title: 'Your vehicle', sub: 'Type, make, model, year, plate', lead: 'Choose your vehicle from the list. Not there? Choose Other and our team checks it.' },
  vehicle_docs: { title: 'Vehicle photos and papers', sub: '', lead: 'Clear photos, all four corners visible, under 5 MB each.' },
  payouts: { title: 'Bank and payouts', sub: 'Where we send your earnings', lead: 'Where we send your earnings.' },
};
const SHORT: Record<string, string> = {
  driving_licence: 'Licence', aadhaar: 'Aadhaar', pan: 'PAN', police_verification: 'police check',
  background_check: 'background check', vehicle_photos: '5 photos', rc: 'RC', registration: 'registration',
  insurance: 'insurance', permit: 'permit', fitness: 'fitness', puc: 'PUC', inspection: 'inspection',
};
/** "Licence, Aadhaar, PAN, police check" / "5 photos, RC, insurance, permit…": the step's own items. */
export function stepSub(step: Step, tr: (s: string) => string): string {
  const fixed = STEP_INFO[step.key].sub;
  if (fixed) return tr(fixed);
  const names = step.items.map((k) => SHORT[k]).filter(Boolean).map((n) => tr(n));
  const shown = names.slice(0, 4).join(', ') + (names.length > 4 ? '…' : '');
  return shown.charAt(0).toUpperCase() + shown.slice(1);
}
export { STEP_SLUG };
export const stepFromSlug = (slug: string) => (Object.keys(STEP_SLUG) as StepKey[]).find((k) => STEP_SLUG[k] === slug) ?? null;
export const setupHref = (step: StepKey | null | undefined, from?: 'profile') =>
  `/driver/setup/${STEP_SLUG[step ?? 'personal']}${from ? `?from=${from}` : ''}`;
const STEP_OF: Record<string, StepKey> = {
  profile_photo: 'personal', legal_name: 'personal', date_of_birth: 'personal', address: 'personal',
  permanent_address: 'personal', address_proof: 'personal', emergency_contact: 'contact', driving_licence: 'identity',
  aadhaar: 'identity', pan: 'identity', police_verification: 'identity', background_check: 'identity', vehicle: 'vehicle',
  vehicle_photos: 'vehicle_docs', rc: 'vehicle_docs', registration: 'vehicle_docs', insurance: 'vehicle_docs',
  permit: 'vehicle_docs', fitness: 'vehicle_docs', puc: 'vehicle_docs', inspection: 'vehicle_docs', payout_method: 'payouts',
};
/** Where an item is fixed: its setup step. */
export const fixAt = (key: string) => setupHref(STEP_OF[key]);
/** The worst of some statuses, as the server ranks them. */
export function worst(states: ItemStatus[]): ItemStatus {
  for (const s of ['rejected', 'missing', 'in_review', 'expiring'] as ItemStatus[]) if (states.includes(s)) return s;
  return states.length ? 'approved' : 'missing';
}

