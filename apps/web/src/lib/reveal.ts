/**
 * Revealing one masked value: the two endpoints, their refusals in words,
 * and the count of reveals this session.
 *
 * EVERY OPERATOR RESPONSE IS MASKED. The server does it by field name at
 * the edge -- `+91••••••3210`, `r•••••@example.test`, `s••••@okaxis`, an
 * address cut to its locality -- for every role, Super Admin included. The
 * only way to a real value is to ask for ONE record's fields here, and the
 * server writes an audit row naming the operator, the record and the
 * fields (never the values) BEFORE it answers. If that row cannot be
 * written nothing is revealed (503). So the console's job is narrow: say
 * out loud that the reveal is logged, send exactly one target per call,
 * and keep what comes back in component state only -- not in a URL, not
 * in storage, not in a cache that outlives the page.
 *
 * SOS has its own door. An incident's contact is revealed through
 * `/sos/admin/<id>/reveal/` while the incident is open or acknowledged,
 * and refused with 409 once it is not: a closed incident has nobody left
 * to reach. The generic endpoint answers `REVEALED_ELSEWHERE` for it.
 */
import { useSyncExternalStore } from 'react';
import { ApiError, api } from '@/lib/api';

export type RevealTargetType =
  | 'driver' | 'user' | 'rider' | 'trip' | 'support_ticket' | 'withdrawal' | 'payment';

/** What the generic endpoint hands back. `fields` carries the values. */
export type RevealResult = {
  target_type: RevealTargetType;
  target_id: number;
  fields: Record<string, unknown>;
  audit_id: number;
  /** Reveals by this operator in the current minute, this one included. */
  reveals_in_window: number | null;
};

/** What the SOS endpoint hands back. `contact` carries the values. */
export type SosRevealResult = {
  sos_id: number;
  status: string;
  contact: {
    user_label: string | null;
    full_name: string | null;
    phone_number: string | null;
    emergency_contact: string | null;
  };
  audit_id: number | null;
};

/** The one record a reveal is about. */
export type RevealTarget =
  | { type: RevealTargetType; id: number }
  | { type: 'sos_event'; id: number };

/** Per-operator cap the server enforces per minute (`pii_reveal`). */
export const REVEAL_LIMIT_PER_MINUTE = 60;

/**
 * Ask for the named fields of one record. The body is exactly what the
 * server documents: `reason` is sent only when the operator wrote one.
 */
export async function revealFields(
  target: { type: RevealTargetType; id: number },
  fields: string[],
  reason?: string,
): Promise<RevealResult> {
  const trimmed = reason?.trim();
  const result = await api.post<RevealResult>('/admin-access/reveal/', {
    target_type: target.type,
    target_id: target.id,
    fields,
    ...(trimmed ? { reason: trimmed } : {}),
  });
  noteReveal(result.reveals_in_window);
  return result;
}

/** The SOS door: the raiser's contact, while the incident is active. */
export async function revealSosContact(sosId: number, reason?: string): Promise<SosRevealResult> {
  const trimmed = reason?.trim();
  const result = await api.post<SosRevealResult>(
    `/sos/admin/${sosId}/reveal/`,
    trimmed ? { reason: trimmed } : {},
  );
  // The SOS endpoint is not behind the per-minute throttle and reports no
  // window count; it still counts as a reveal this session.
  noteReveal(null);
  return result;
}

/**
 * The refusal, in words an operator can act on. Every code the contract
 * lists has its own sentence; anything else falls back to the server's
 * own message when it wrote one for a person.
 */
export function revealErrorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return 'The reveal did not go through. Try again.';
  switch (err.code) {
    case 'PII_VIEW_NOT_HELD_HERE':
      return 'You hold the reveal permission elsewhere, not where this record sits. Nothing was revealed.';
    case 'SOS_NOT_ACTIVE':
      return 'Contact details can only be revealed while the incident is open or acknowledged.';
    case 'AUDIT_UNAVAILABLE':
      return 'The reveal could not be logged, so nothing was revealed. Try again in a moment.';
    case 'BULK_REVEAL_REFUSED':
      return 'A reveal is one record at a time.';
    default:
      break;
  }
  switch (err.status) {
    case 403:
      return 'You do not hold the permission to reveal personal data. Nothing was revealed.';
    case 404:
      return 'This record is outside your scope, or no longer exists.';
    case 409:
      return 'Contact details can only be revealed while the incident is open or acknowledged.';
    case 429:
      return `Too many reveals in the last minute (the limit is ${REVEAL_LIMIT_PER_MINUTE}). Wait a minute and try again.`;
    case 503:
      return 'The reveal could not be logged, so nothing was revealed. Try again in a moment.';
    default:
      return err.fromServer ? err.message : 'The reveal did not go through. Try again.';
  }
}

// ---------------------------------------------------------------------------
// Reveals this session -- a number in memory, nothing more.
// ---------------------------------------------------------------------------

export type RevealStats = {
  /** Successful reveals since this console was loaded, both doors. */
  session: number;
  /** `reveals_in_window` from the last generic reveal; null before one. */
  inWindow: number | null;
};

// Module state, deliberately: it lives exactly as long as the page does.
// A reload starts from zero, and nothing here is written anywhere else.
let stats: RevealStats = { session: 0, inWindow: null };
const listeners = new Set<() => void>();

function noteReveal(inWindow: number | null) {
  stats = {
    session: stats.session + 1,
    inWindow: typeof inWindow === 'number' ? inWindow : stats.inWindow,
  };
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const getStats = () => stats;
const SERVER_STATS: RevealStats = { session: 0, inWindow: null };

/** The counter, as a hook; the Security page shows it. */
export function useRevealStats(): RevealStats {
  return useSyncExternalStore(subscribe, getStats, () => SERVER_STATS);
}

/** Tests only: back to a fresh session. */
export function resetRevealStatsForTests() {
  stats = { session: 0, inWindow: null };
  listeners.forEach((fn) => fn());
}
