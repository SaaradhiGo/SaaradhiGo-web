import type { DateOrder } from './format';
import { parseNumericDate } from './format';
import type { ChecklistItem, FileTile, ItemStatus, Requirements, StepKey, StepStatus } from './requirements';

/**
 * One reading of the driver's setup for every screen (11 Nov): the step states and their words,
 * each document's state and expiry, and what a step's Save checks before it moves on. Profile,
 * setup, Documents and the Dashboard all call these, so they cannot disagree.
 */

/** A step's state from the server's checklist; several steps read as the worst of them. */
const RANK: StepStatus[] = ['action', 'todo', 'in_review', 'done'];
export function stepState(data: Requirements | null, ...keys: StepKey[]): StepStatus | null {
  const got = (data?.checklist.steps ?? []).filter((s) => keys.includes(s.key)).map((s) => s.status);
  return got.length ? RANK.find((r) => got.includes(r)) ?? 'done' : null;
}

/** The words for a step's state. An emergency contact is never reviewed, so a done contact is "Added". */
export function stepWords(status: StepStatus, step?: StepKey): string {
  if (status === 'done') return step === 'contact' ? 'Added' : 'Done';
  return { in_review: 'In review', todo: 'To do', action: 'Needs your action' }[status];
}

/** Approved, and nothing the market blocks on is missing: the only state that says "approved to drive". */
export const readyToDrive = (data: Requirements | null) => !!data?.checklist.approved && !(data.checklist.blocking ?? []).length;

/** The checklist labels of the items that keep an approved driver offline. */
export function blockingLabels(data: Requirements | null): string[] {
  const keys = data?.checklist.blocking ?? [];
  return keys.map((k) => data?.checklist.items.find((i) => i.key === k)?.label ?? k);
}

export type DocRow = FileTile & { item: string; expires: string | null; target: 'personal' | 'identity' | 'vehicle' };

/**
 * Every file the market asks this driver for, each with one state: a file whose item is held back
 * by something beyond the file (an expired or undated paper, a missing licence number) takes the
 * item's state and reason, so a paper is never "Approved" while the checklist says it is not.
 */
export function documentRows(data: Requirements | null): DocRow[] {
  const items = (data?.checklist.items ?? []).filter((i) => i.need === 'required' && (i.files ?? []).length);
  return items.flatMap((i: ChecklistItem) => (i.files ?? []).map((f) => {
    const held = (f.status === 'approved' || f.status === 'in_review') && ['rejected', 'missing', 'expiring'].includes(i.status) && !!(i.reason || i.status === 'expiring');
    const status: ItemStatus = held ? i.status : (i.files ?? []).length === 1 && i.status === 'expiring' ? 'expiring' : f.status;
    return {
      ...f, status, reason: held ? i.reason : f.reason, item: i.key, expires: i.expires,
      target: f.vehicle ? 'vehicle' : i.key === 'profile_photo' ? 'personal' : 'identity',
    } as DocRow;
  }));
}

export const isApproved = (s: ItemStatus) => s === 'approved' || s === 'expiring' || s === 'done';

// ---------------------------------------------------------------------------
// What each step's Save checks (11 Nov): a problem shows under its field and the step stays open.
// ---------------------------------------------------------------------------

export type ContactRow = { name: string; relationship: string; phone_number: string };
export type ContactProblems = { name?: string; relationship?: string; phone_number?: string };

/** Digits after the country code: 10 in India and the USA. */
export function phoneProblem(phone: string, country: string): string | null {
  const code = country === 'US' ? '1' : '91';
  const digits = phone.replace(/\D/g, '');
  const local = digits.startsWith(code) && digits.length > 10 ? digits.slice(code.length) : digits;
  if (local.length !== 10) return 'Enter a 10-digit mobile number.';
  if (country !== 'US' && !/^[6-9]/.test(local)) return 'Enter a mobile number that starts with 6, 7, 8 or 9.';
  return null;
}

/** Each contact row's problems; contact 1 is required, contact 2 only once something is typed in it. */
export function contactProblems(rows: ContactRow[], country: string, prefix: string): ContactProblems[] {
  return rows.map((r, i) => {
    const typed = r.name.trim() || r.relationship || r.phone_number.replace(/\s/g, '') !== prefix;
    if (i > 0 && !typed) return {};
    const out: ContactProblems = {};
    if (!r.name.trim()) out.name = 'Enter their name.';
    if (!r.relationship) out.relationship = 'Choose how you know them.';
    const p = phoneProblem(r.phone_number, country);
    if (p) out.phone_number = p;
    return out;
  });
}

export type AddressDraft = { line1: string; city: string; state_code: string; postal_code: string };
/** A started address must be finished; an untouched one is left to the checklist. */
export function addressProblem(a: AddressDraft, country: string): string | null {
  const any = a.line1.trim() || a.city.trim() || a.state_code || a.postal_code.trim();
  if (!any) return null;
  if (!a.line1.trim() || !a.city.trim() || !a.state_code || !a.postal_code.trim()) return 'Finish the address: line 1, city, state and PIN code.';
  if (!(country === 'US' ? /^\d{5}$/ : /^\d{6}$/).test(a.postal_code.trim())) return country === 'US' ? 'Enter a 5-digit ZIP code.' : 'Enter a 6-digit PIN code.';
  return null;
}

/** A date typed but not readable in the market's order. */
export function dateProblem(text: string, order: DateOrder): string | null {
  if (!text.trim()) return null;
  return parseNumericDate(text, order) ? null : `Enter the date as ${order === 'mdy' ? 'mm/dd/yyyy' : 'dd/mm/yyyy'}.`;
}

export type VehicleDraft = { type: string; make: string; modelId: string; year: string; colour: string; plate: string };
/** A vehicle started but not finished; nothing typed is left to the checklist. */
export function vehicleProblem(v: VehicleDraft, saved: boolean): string | null {
  const any = v.make || v.modelId || v.year || v.colour || v.plate.trim();
  if (!any && !saved) return null;
  const missing = (['make', 'modelId', 'year', 'colour', 'plate'] as const).some((k) => !String(v[k]).trim());
  return missing ? 'Choose the make, model, year, colour and number plate.' : null;
}

export type BankDraft = { holder: string; number: string; confirm: string; code: string; upi: string; method: 'bank' | 'upi' };
/** Bank or UPI details started but not complete or not matching. */
export function payoutProblem(b: BankDraft): string | null {
  if (b.method === 'upi') return b.upi && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(b.upi) ? 'Enter a UPI ID like name@okaxis.' : null;
  const any = b.holder.trim() || b.number || b.confirm || b.code;
  if (!any) return null;
  if (!b.holder.trim()) return 'Enter the account holder name.';
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(b.code)) return 'Enter an 11-character IFSC, like HDFC0001234.';
  if (b.number.length < 6) return 'Enter the account number.';
  if (b.number !== b.confirm) return 'The account numbers do not match.';
  return null;
}

/** "+91 98765 43210" / "+1 512 555 0142": a saved number, readable. */
export function spacedPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const d = phone.replace(/[^\d+]/g, '');
  const m91 = /^\+91(\d{5})(\d{5})$/.exec(d);
  if (m91) return `+91 ${m91[1]} ${m91[2]}`;
  const m1 = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(d);
  if (m1) return `+1 ${m1[1]} ${m1[2]} ${m1[3]}`;
  return phone;
}
