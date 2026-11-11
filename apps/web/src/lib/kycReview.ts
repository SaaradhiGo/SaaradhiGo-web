/**
 * The KYC review screen's pure logic (design board E), kept out of the page
 * so it can be tested: which document comes next, what a key press means,
 * whether a document's date is still good, and the reviewer's own pace from
 * the audit log.
 */
import type { ChipTone } from '@/components/console/kit/StatusChip';

export type ReviewDoc = {
  key: string; label: string; description?: string; owner: 'driver' | 'vehicle';
  vehicle_id: number | null; present: boolean; recordable: boolean;
  viewable?: boolean; url_withheld: boolean; review_state: string;
  review: { state: string; reason: string; reviewed_at: string | null; current: boolean;
    created_by?: { label?: string } | null } | null;
};

/** One id per document: the same key exists on every vehicle. */
export function docId(doc: Pick<ReviewDoc, 'owner' | 'vehicle_id' | 'key'>): string {
  return `${doc.owner}-${doc.vehicle_id ?? 0}-${doc.key}`;
}

/** Decided means approved or rejected for the file on record now. */
export function isDecided(doc: Pick<ReviewDoc, 'review_state'>): boolean {
  return doc.review_state === 'approved' || doc.review_state === 'rejected';
}

/** A document can be decided only when a file is on record. */
export function isReviewable(doc: Pick<ReviewDoc, 'present' | 'recordable'>): boolean {
  return doc.present && doc.recordable;
}

/**
 * The next document still waiting for a decision after `from`, wrapping
 * round to the start. -1 when every document on file has been decided.
 */
export function nextUndecided(docs: ReviewDoc[], from: number): number {
  const n = docs.length;
  for (let step = 1; step <= n; step += 1) {
    const i = (from + step + n) % n;
    if (isReviewable(docs[i]) && !isDecided(docs[i])) return i;
  }
  return -1;
}

/** Where to start on a driver: the first undecided document, else the first. */
export function firstUndecided(docs: ReviewDoc[]): number {
  if (docs.length === 0) return -1;
  const i = nextUndecided(docs, -1);
  return i === -1 ? 0 : i;
}

/** J and K: step through every document, missing ones included, without wrapping. */
export function stepIndex(length: number, current: number, delta: 1 | -1): number {
  if (length === 0) return -1;
  return Math.min(length - 1, Math.max(0, current + delta));
}

/** Every required document has a file and is approved. */
export function allApproved(docs: ReviewDoc[]): boolean {
  return docs.length > 0 && docs.every((d) => d.review_state === 'approved');
}

/** Nothing left to decide on this driver (some may be rejected or missing). */
export function nothingLeft(docs: ReviewDoc[]): boolean {
  return nextUndecided(docs, -1) === -1;
}

export const DOC_STATE: Record<string, [string, ChipTone]> = {
  approved: ['Approved', 'good'],
  rejected: ['Rejected', 'critical'],
  not_reviewed: ['Pending', 'neutral'],
  missing: ['Missing', 'neutral'],
};

export function docState(doc: Pick<ReviewDoc, 'review_state' | 'recordable'>): [string, ChipTone] {
  if (!doc.recordable) return ['Cannot be stored', 'neutral'];
  return DOC_STATE[doc.review_state] ?? [doc.review_state.replace(/_/g, ' '), 'neutral'];
}

/** The other side of a two-sided document on file, if there is one. */
export function otherSide(docs: ReviewDoc[], index: number): number {
  const doc = docs[index];
  if (!doc) return -1;
  const m = /^(.*)_(front|back)$/.exec(doc.key);
  if (!m) return -1;
  const want = `${m[1]}_${m[2] === 'front' ? 'back' : 'front'}`;
  return docs.findIndex((d) => d.key === want && d.owner === doc.owner && d.vehicle_id === doc.vehicle_id && d.present);
}

export function sideOf(doc: Pick<ReviewDoc, 'key'>): 'front' | 'back' | null {
  const m = /_(front|back)$/.exec(doc.key);
  return m ? (m[1] as 'front' | 'back') : null;
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

export type KycKey = 'approve' | 'reject' | 'reupload' | 'next' | 'prev';

const KEYS: Record<string, KycKey> = { a: 'approve', r: 'reject', u: 'reupload', j: 'next', k: 'prev' };

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * What a key press means here, or null. Never while the operator is typing
 * (the reason box), and never with a modifier: Ctrl R still reloads.
 */
export function kycKeyAction(e: {
  key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
}): KycKey | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  const t = e.target;
  if (t && (TYPING.has((t.tagName ?? '').toUpperCase()) || t.isContentEditable)) return null;
  return KEYS[e.key.toLowerCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Reasons
// ---------------------------------------------------------------------------

/** The reason chips, and the sentence the driver reads for each. */
export const REJECT_REASONS: ReadonlyArray<readonly [string, string]> = [
  ['Blurry photo', 'The photo is blurry. Please take a clear photo in good light.'],
  ['Expired', 'This document has expired. Please upload one that is still valid.'],
  ['Name mismatch', 'The name on this document does not match the name on your profile.'],
  ['Wrong document', 'This is not the document we asked for.'],
  ['Back side missing', 'We need the back side of this document as well.'],
];

export const REUPLOAD_PREFIX = 'Please upload again: ';

/** The reason sent for "Ask to re-upload": a reject whose reason starts with the prefix. */
export function reuploadReason(reason: string): string {
  const text = reason.trim();
  return text.startsWith(REUPLOAD_PREFIX) ? text : `${REUPLOAD_PREFIX}${text}`;
}

/** The server takes any non-empty reason; the console asks for a few words. */
export const MIN_REASON = 5;

export function reasonReady(reason: string): boolean {
  return reason.trim().length >= MIN_REASON;
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

type Vehicleish = {
  id: number; insurance_expiry: string | null; permit_expiry: string | null;
  fitness_expiry: string | null; puc_expiry: string | null;
};

const VEHICLE_EXPIRY: Record<string, keyof Vehicleish> = {
  insurance: 'insurance_expiry', permit: 'permit_expiry', fitness: 'fitness_expiry', puc: 'puc_expiry',
};

/**
 * The expiry date on record for this document, or undefined when the
 * document has no date field at all (as opposed to null: a date it should
 * have and does not).
 */
export function expiryFor(
  doc: Pick<ReviewDoc, 'key' | 'owner' | 'vehicle_id'>,
  licenceExpiry: string | null,
  vehicles: Vehicleish[],
): string | null | undefined {
  if (doc.owner === 'driver') return doc.key.startsWith('license') ? licenceExpiry : undefined;
  const field = VEHICLE_EXPIRY[doc.key];
  if (!field) return undefined;
  const v = vehicles.find((x) => x.id === doc.vehicle_id);
  return v ? (v[field] as string | null) : null;
}

/** Today as YYYY-MM-DD on the operator's clock. */
export function localToday(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export type ExpiryCheck =
  | { state: 'none' }
  | { state: 'valid'; days: number }
  | { state: 'expired'; days: number };

/** Still valid on `today`? A document is good through its expiry date. */
export function expiryCheck(iso: string | null | undefined, today: string): ExpiryCheck {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return { state: 'none' };
  const day = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  const days = Math.round((day(iso) - day(today)) / 86_400_000);
  return days >= 0 ? { state: 'valid', days } : { state: 'expired', days: -days };
}

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

export type AuditEntry = { created_at: string; target_id: string };

/**
 * "You today": how many drivers this reviewer decided documents on, and the
 * median gap between their consecutive document reviews. Null without at
 * least two reviews, since one review has no gap to measure.
 */
export function paceFrom(entries: AuditEntry[]): { drivers: number; medianSeconds: number } | null {
  const times = entries.map((e) => Date.parse(e.created_at)).filter(Number.isFinite).sort((a, b) => a - b);
  if (times.length < 2) return null;
  const gaps = times.slice(1).map((t, i) => (t - times[i]) / 1000).sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  const median = gaps.length % 2 ? gaps[mid] : (gaps[mid - 1] + gaps[mid]) / 2;
  return { drivers: new Set(entries.map((e) => e.target_id)).size, medianSeconds: Math.round(median) };
}

/** "45s", "3m 10s", "1h 5m": a short duration. */
export function shortDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

/** Is a signed link a PDF? Judged on the path, not the query string. */
export function looksLikePdf(url: string): boolean {
  return /\.pdf$/i.test(url.split(/[?#]/)[0]);
}
