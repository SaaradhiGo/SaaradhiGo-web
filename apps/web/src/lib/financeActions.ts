/**
 * The Finance module's WRITE-side client logic (module 7, part B), kept out of
 * the pages so it can be tested.
 *
 * Every money write here is a maker-checker request on the server. Nothing in
 * this file decides whether a write is allowed (the server does, and so does
 * the country's approval policy); it decides what to DRAW, what to SEND, and
 * what to SAY, and it says "blocked: no approval policy in this country"
 * plainly when the server says so.
 */
import { can, type AdminAccess } from './adminScope';
import { canActOnPayouts, formatMinor } from './finance';
import { exponentOf, parseMajorToMinor } from './trips';

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const canAdjustBalance = (access: AdminAccess | null) => can(access, 'finance.adjust');
export const canCreditWallet = (access: AdminAccess | null) => can(access, 'finance.adjust');
export const canConfigurePayouts = (access: AdminAccess | null) => can(access, 'finance.config');
export const canSeeAggregate = (access: AdminAccess | null) => can(access, 'finance.aggregate');

// ---------------------------------------------------------------------------
// Payout rows: which buttons, and what is said when there are none
// ---------------------------------------------------------------------------

export const NO_POLICY_WORDS = 'Blocked: no approval policy in this country.';

export type PayoutRowLike = {
  id?: number;
  status: string;
  approval_blocked?: boolean;
  approval_blocked_reason?: string | null;
  retryable?: boolean;
  under_investigation?: boolean;
  approval?: { status: string } | null;
};

export type PayoutActions = {
  approve: boolean;
  reject: boolean;
  retry: boolean;
  investigate: boolean;
  /** Plain words when releasing is blocked, else null. */
  blocked: string | null;
  /** A request for this payout is already waiting for a checker. */
  awaitingChecker: boolean;
};

const INVESTIGABLE = new Set(['pending', 'approved', 'processed', 'failed', 'unresolved']);

export function payoutActions(row: PayoutRowLike, access: AdminAccess | null): PayoutActions {
  const may = canActOnPayouts(access);
  const pending = row.status === 'pending';
  const awaitingChecker = pending && row.approval?.status === 'requested';
  const blocked = pending && row.approval_blocked ? (row.approval_blocked_reason || NO_POLICY_WORDS) : null;
  return {
    // A blocked row can still be REJECTED (that returns the money), never released.
    approve: may && pending && !blocked && !awaitingChecker,
    reject: may && pending,
    retry: may && row.status === 'failed' && Boolean(row.retryable),
    investigate: may && INVESTIGABLE.has(row.status),
    blocked: may ? blocked : null,
    awaitingChecker: may && awaitingChecker,
  };
}

/** The ids a bulk approve may send: pending, not blocked, not already waiting. */
export function bulkApprovable(rows: readonly (PayoutRowLike & { id: number })[], picked: ReadonlySet<number>,
  access: AdminAccess | null): number[] {
  return rows.filter((r) => picked.has(r.id) && payoutActions(r, access).approve).map((r) => r.id);
}

/** The ids a bulk reject may send: pending rows only. */
export function bulkRejectable(rows: readonly (PayoutRowLike & { id: number })[], picked: ReadonlySet<number>,
  access: AdminAccess | null): number[] {
  return rows.filter((r) => picked.has(r.id) && payoutActions(r, access).reject).map((r) => r.id);
}

/** A bulk request must be one currency (the server refuses a mix). */
export function bulkCurrencyProblem(rows: readonly { id: number; currency: string }[],
  ids: readonly number[]): string | null {
  const currencies = new Set(rows.filter((r) => ids.includes(r.id)).map((r) => r.currency));
  return currencies.size > 1
    ? 'A bulk payout must be one currency. Untick the rows in another currency.' : null;
}

export const RETRY_NOTE = 'The money was approved already, so a retry does not need another approval. '
  + 'It takes the amount out of the driver\'s balance again and sends it through the same payout path; '
  + 'it is refused if the balance is no longer there or if the gateway already holds a payout for it.';

// ---------------------------------------------------------------------------
// Driver balance adjustment
// ---------------------------------------------------------------------------

export const ADJUST_REASONS: Record<string, string> = {
  correction: 'Correction', goodwill: 'Goodwill', chargeback: 'Chargeback',
  damage_recovery: 'Damage recovery', other: 'Other',
};
export const CREDIT_REASONS: Record<string, string> = {
  service_recovery: 'Service recovery', goodwill: 'Goodwill', correction: 'Correction', other: 'Other',
};

export type Direction = 'credit' | 'debit';

export type AdjustInput = {
  direction: Direction;
  amount: string;
  currency: string;
  balanceMinor: number | null;
  reasonCode: string;
  note: string;
};

/** Why the form cannot be sent yet, or null. The server checks all of it again. */
export function adjustProblem(i: AdjustInput): string | null {
  if (!i.amount.trim()) return 'Enter the amount.';
  const minor = parseMajorToMinor(i.amount, i.currency);
  if (minor === null) return `Enter a positive ${i.currency} amount with the right number of decimals.`;
  if (i.direction === 'debit' && i.balanceMinor !== null && minor > i.balanceMinor) {
    return `A debit cannot take the balance below zero. The balance is ${formatMinor(i.balanceMinor, i.currency)}.`;
  }
  if (!(i.reasonCode in ADJUST_REASONS)) return 'Choose a reason.';
  if (!i.note.trim()) return 'A note is required.';
  return null;
}

export function adjustBody(i: AdjustInput, key: string) {
  return {
    direction: i.direction,
    amount_minor: parseMajorToMinor(i.amount, i.currency),
    currency: i.currency,
    reason_code: i.reasonCode,
    note: i.note.trim(),
    idempotency_key: key,
  };
}

export type CreditInput = {
  amount: string;
  currency: string;
  reasonCode: string;
  note: string;
  ticketId: string;
};

export function creditProblem(i: CreditInput): string | null {
  if (!i.amount.trim()) return 'Enter the amount.';
  if (parseMajorToMinor(i.amount, i.currency) === null) {
    return `Enter a positive ${i.currency} amount with the right number of decimals.`;
  }
  if (!(i.reasonCode in CREDIT_REASONS)) return 'Choose a reason.';
  if (i.reasonCode === 'other' && !i.note.trim()) return 'A note is required for "Other".';
  if (i.ticketId.trim() && !/^\d+$/.test(i.ticketId.trim())) return 'The ticket number is digits only.';
  return null;
}

export function creditBody(i: CreditInput, key: string) {
  return {
    amount_minor: parseMajorToMinor(i.amount, i.currency),
    currency: i.currency,
    reason_code: i.reasonCode,
    note: i.note.trim(),
    ...(i.ticketId.trim() ? { ticket_id: Number(i.ticketId.trim()) } : {}),
    idempotency_key: key,
  };
}

// ---------------------------------------------------------------------------
// Payout settings
// ---------------------------------------------------------------------------

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export type PayoutConfig = {
  fee_percent: string;
  minimum_withdrawal_minor: number;
  stuck_payout_hours: number | null;
  payout_schedule: 'on_request' | 'weekly';
  payout_weekday: number | null;
};

export function scheduleLabel(c: Pick<PayoutConfig, 'payout_schedule' | 'payout_weekday'>): string {
  if (c.payout_schedule !== 'weekly') return 'On request';
  const day = c.payout_weekday !== null && c.payout_weekday >= 0 && c.payout_weekday <= 6
    ? WEEKDAYS[c.payout_weekday] : null;
  return day ? `Weekly, ${day}s` : 'Weekly';
}

/** The fee warning is drawn for any fee above zero (including while typing it). */
export function feeNeedsWarning(fee: string): boolean {
  const n = Number(fee);
  return Number.isFinite(n) && n > 0;
}

export type ConfigDraft = {
  fee: string;
  minimum: string;
  stuckHours: string;
  schedule: 'on_request' | 'weekly';
  weekday: number;
};

export function draftFrom(c: PayoutConfig, currency: string): ConfigDraft {
  return {
    fee: String(Number(c.fee_percent)),
    minimum: minimumToDraft(c.minimum_withdrawal_minor, currency),
    stuckHours: c.stuck_payout_hours === null ? '' : String(c.stuck_payout_hours),
    schedule: c.payout_schedule,
    weekday: c.payout_weekday ?? 0,
  };
}

/** The minimum is typed in MAJOR units; the server wants minor units. */
export function minimumToDraft(minor: number, currency: string): string {
  const exp = exponentOf(currency);
  return (minor / 10 ** exp).toFixed(exp);
}

/** The typed minimum in minor units: zero is allowed (no minimum), nothing else is blank. */
export function minimumMinor(text: string, currency: string): number | null {
  if (text.trim() !== '' && Number(text) === 0) return 0;
  return parseMajorToMinor(text, currency);
}

export type ConfigChange = { label: string; from: string; to: string };

/** What the request will change, in words, for the confirmation. Empty = nothing. */
export function configChanges(current: PayoutConfig, draft: ConfigDraft, currency: string): ConfigChange[] {
  const out: ConfigChange[] = [];
  const draftMinimum = minimumMinor(draft.minimum, currency);
  if (Number(draft.fee) !== Number(current.fee_percent)) {
    out.push({ label: 'Transfer fee', from: `${Number(current.fee_percent)}%`, to: `${Number(draft.fee)}%` });
  }
  if (draftMinimum !== null && draftMinimum !== current.minimum_withdrawal_minor) {
    out.push({ label: 'Minimum withdrawal', from: formatMinor(current.minimum_withdrawal_minor, currency),
      to: formatMinor(draftMinimum, currency) });
  }
  const hours = draft.stuckHours.trim() === '' ? null : Number(draft.stuckHours);
  if (hours !== current.stuck_payout_hours) {
    const words = (h: number | null) => (h === null ? 'not checked' : `${h} h`);
    out.push({ label: 'Stuck after', from: words(current.stuck_payout_hours), to: words(hours) });
  }
  const nextWeekday = draft.schedule === 'weekly' ? draft.weekday : null;
  if (draft.schedule !== current.payout_schedule || nextWeekday !== current.payout_weekday) {
    out.push({
      label: 'Payout schedule', from: scheduleLabel(current),
      to: scheduleLabel({ payout_schedule: draft.schedule, payout_weekday: nextWeekday }),
    });
  }
  return out;
}

/** Why the draft cannot be sent, or null. */
export function configProblem(draft: ConfigDraft, currency: string): string | null {
  const fee = Number(draft.fee);
  if (draft.fee.trim() === '' || !Number.isFinite(fee) || fee < 0 || fee > 100) {
    return 'The fee is a percentage from 0 to 100.';
  }
  if (!/^\d+(\.\d{1,2})?$/.test(draft.fee.trim())) return 'The fee has at most two decimals.';
  if (minimumMinor(draft.minimum, currency) === null) return `Enter the minimum in ${currency}.`;
  if (draft.stuckHours.trim() !== '') {
    const h = Number(draft.stuckHours);
    if (!Number.isInteger(h) || h < 1 || h > 2160) return 'Stuck-after hours: a whole number from 1 to 2160, or leave empty.';
  }
  return null;
}

export function configBody(draft: ConfigDraft, currency: string, reason: string, key: string) {
  const minimum = minimumMinor(draft.minimum, currency) ?? 0;
  return {
    fee_percent: Number(draft.fee).toFixed(2),
    minimum_withdrawal_minor: minimum,
    stuck_payout_hours: draft.stuckHours.trim() === '' ? null : Number(draft.stuckHours),
    payout_schedule: draft.schedule,
    payout_weekday: draft.schedule === 'weekly' ? draft.weekday : null,
    reason: reason.trim(),
    idempotency_key: key,
  };
}

// ---------------------------------------------------------------------------
// Command Centre finance tiles
// ---------------------------------------------------------------------------

export type FinanceTile = {
  code: string; name: string; country: string; currency: string; window: string; timezone: string;
  gmv: Record<string, number>;
  commission: Record<string, number>;
  take_rate_percent: Record<string, number | null>;
  payouts_pending: { count: number; amount: Record<string, number> };
  reconciliation: { open_findings: number };
};

export type FinanceBlock = {
  visible: boolean;
  tiles: FinanceTile[];
  /** Only finance.read holders can open the reconciliation page. */
  reconciliation_link: boolean;
};

/** "18.4%" or "Unavailable" when nothing was settled (never 0). */
export function takeRateLabel(pct: number | null | undefined): string | null {
  return pct === null || pct === undefined ? null : `${pct.toFixed(1)}%`;
}

/** One entry per currency, sorted; never a sum across currencies. */
export function perCurrency(values: Record<string, number> | undefined): Array<[string, number]> {
  return Object.entries(values ?? {}).sort(([a], [b]) => a.localeCompare(b));
}

/**
 * The reconciliation tile links to /finance/reconciliation ONLY for a
 * finance.read holder (the link rule); everyone else gets the number as text.
 */
export function reconciliationHref(block: Pick<FinanceBlock, 'reconciliation_link'>,
  access: AdminAccess | null): string | undefined {
  return block.reconciliation_link && can(access, 'finance.read') ? '/finance/reconciliation' : undefined;
}
