/**
 * Fraud & Risk (module 13): the review queue, the flag detail and the detection rules.
 *
 * Pure helpers and the API shapes, so the pages stay thin and the rules that matter are tested in
 * one place. Nothing here talks to the network.
 *
 *   * the console never shows a person: a flag names its subject by the masked reference the
 *     server sent (`rider #12`), and its evidence names SIGNALS (the same device, the same phone
 *     number) and counts, never a value. `evidenceLines` turns that into the sentence a reviewer
 *     reads: "Same device as 2 other accounts".
 *   * the decision form mirrors the server (`servers/fraud/review.py`): a reason code from the
 *     list for the decision, and a note of 5 to 500 characters. The server re-checks both and is
 *     the authority; `decisionProblem` only spares a round trip and says what is wrong while typing.
 *   * nothing here moves money or tells the subject anything. Confirming records a decision and
 *     offers links to actions that already exist in other modules, each behind its own capability.
 */
import { can, type AdminAccess } from './adminScope';

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const canReadFraud = (a: AdminAccess | null) => can(a, 'fraud.read');
export const canReviewFraud = (a: AdminAccess | null) => can(a, 'fraud.review');
export const canChangeRules = (a: AdminAccess | null) => can(a, 'fraud.rules');

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type Severity = 'low' | 'medium' | 'high';
export type Status = 'open' | 'in_review' | 'confirmed' | 'dismissed';
export type Decision = 'confirmed' | 'dismissed';

export type Refs = { trip_ids?: number[]; campaign_ids?: number[]; counterpart_user_ids?: number[] };

export type Evidence = {
  signals?: string[];
  refs?: Refs;
  measures?: Record<string, number | null | undefined>;
  hit_count?: number;
  first_seen?: string;
  last_seen?: string;
  // The module-12 referral flag's own keys.
  referral_id?: number;
  campaign_id?: number;
  role?: string;
  trips_completed?: number;
  referee_user_id?: number;
};

export type StaffRef = { id: number; label: string };

export type Flag = {
  id: number;
  kind: string;
  status: Status;
  severity: Severity;
  score: number;
  rule_key: string;
  rule_version: number;
  hit_count: number;
  subject: { ref: string; role: string; user_id: number; href: string | null };
  evidence: Evidence;
  source_ref: string;
  scope: string | null;
  scope_name: string | null;
  assigned_to: StaffRef | null;
  assigned_at: string | null;
  decision_reason: string;
  decision_note: string;
  decided_by: StaffRef | null;
  decided_at: string | null;
  created_at: string;
  last_seen_at: string | null;
  age_hours: number;
};

export type Queue = {
  count: number; limit: number; offset: number; may_review: boolean;
  facets: { status: Record<string, number>; severity: Record<string, number> };
  results: Flag[];
};

export type LinkedAccount = {
  ref: string; role: string; user_id: number; signals: string[]; signal_labels: string[];
  status: 'active' | 'suspended' | 'inactive'; href: string | null;
};

export type Linked = {
  accounts: LinkedAccount[]; outside_scope: number; outside_scope_label: string | null;
};

export type TimelineEvent = {
  id: number; action: string; from_status: string; to_status: string; reason: string; note: string;
  actor: { id: number; label: string } | null; data: Record<string, unknown>; at: string;
};

export type Handoff = {
  kind: string; label: string; capability: string; href: string; available: boolean;
  taken_at: string | null;
};

export type FlagDetail = Flag & {
  may_review: boolean;
  linked: Linked;
  related: { trips: { id: number; href: string }[]; trip_count: number;
    campaigns: { id: number; name: string; href: string }[] };
  timeline: TimelineEvent[];
  handoffs: Handoff[];
  handoffs_taken: { kind: string; at: string; by: number }[];
  /** Absent from an older server. */
  money?: MoneyBlock;
};

export type Options = {
  kinds: { key: string; label: string }[];
  severities: { key: string; label: string }[];
  statuses: { key: string; label: string }[];
  confirm_reasons: { key: string; label: string }[];
  dismiss_reasons: { key: string; label: string }[];
  reopen_reasons: { key: string; label: string }[];
  note_min: number; note_max: number;
  handoffs: { kind: string; label: string; capability: string }[];
  may_review: boolean; may_change_rules: boolean;
};

export type RuleThreshold = {
  key: string; label: string; unit: string; value: number; default: number; low: number; high: number;
  hint: string;
};

export type PendingChange = {
  id: number; country: string; rule_key: string; thresholds: Record<string, number>;
  enabled: boolean | null; base_version: number | null; reason: string; maker_label: string;
  requested_at: string | null; expires_at: string | null;
};

export type RuleRow = {
  rule_key: string; title: string; summary: string; data_used: string; data_missing: string;
  subject_role: string; mode: 'scheduled' | 'event'; flags_7d: number; configured: boolean;
  enabled: boolean; version: number; last_run_at: string | null; thresholds: RuleThreshold[];
  pending: PendingChange[];
};

export type CountryRules = { country: string; country_name: string; may_edit: boolean; rules: RuleRow[] };

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const KIND_WORDS: Record<string, string> = {
  referral_abuse: 'Referral abuse', multi_accounting: 'Multiple accounts',
  collusion: 'Rider-driver collusion', incentive_farming: 'Incentive farming',
  gps_anomaly: 'GPS anomaly', cancellation_abuse: 'Cancellation abuse', payment_abuse: 'Payment abuse',
};

export const SEVERITY_WORDS: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };
export const SEVERITY_ORDER: Severity[] = ['high', 'medium', 'low'];

export const STATUS_WORDS: Record<Status, string> = {
  open: 'Open', in_review: 'In review', confirmed: 'Confirmed', dismissed: 'Dismissed',
};

export type Tone = 'good' | 'bad' | 'wait' | 'neutral';
export const severityTone = (s: Severity): Tone => (s === 'high' ? 'bad' : s === 'medium' ? 'wait' : 'neutral');
export const statusTone = (s: Status): Tone =>
  s === 'confirmed' ? 'bad' : s === 'in_review' ? 'wait' : s === 'open' ? 'wait' : 'neutral';

/** The reasons the server accepts, for a console talking to an older server and for the tests. */
export const FALLBACK_CONFIRM_REASONS = [
  { key: 'multi_accounting', label: 'Multiple accounts for one person' },
  { key: 'collusion', label: 'Rider and driver colluding' },
  { key: 'gps_spoofing', label: 'GPS spoofing or tampering' },
  { key: 'promo_abuse', label: 'Promotion or referral abuse' },
  { key: 'payment_abuse', label: 'Payment abuse' },
  { key: 'other', label: 'Other' },
];
export const FALLBACK_DISMISS_REASONS = [
  { key: 'false_positive', label: 'False positive' },
  { key: 'legitimate_shared_device', label: 'Legitimate shared device' },
  { key: 'insufficient_evidence', label: 'Insufficient evidence' },
  { key: 'duplicate', label: 'Duplicate of another flag' },
  { key: 'other', label: 'Other' },
];
export const FALLBACK_REOPEN_REASONS = [
  { key: 'new_evidence', label: 'New evidence' },
  { key: 'decided_in_error', label: 'Decided in error' },
  { key: 'appeal', label: 'Appeal or complaint' },
  { key: 'other', label: 'Other' },
];

export const NOTE_MIN = 5;
export const NOTE_MAX = 500;

/** A pill's word for a timeline line. */
export const EVENT_WORDS: Record<string, string> = {
  raised: 'Raised', hit: 'More evidence', assigned: 'Assigned', unassigned: 'Unassigned',
  note: 'Note', confirmed: 'Confirmed', dismissed: 'Dismissed', reopened: 'Reopened',
  handoff: 'Hand-off taken',
};

export const SIGNAL_WORDS: Record<string, string> = {
  same_device: 'the same device', same_phone: 'the same phone number',
  same_instrument: 'the same payment instrument', same_emergency_contact: 'the same emergency contact',
  named_in_evidence: 'named in the evidence',
};

// ---------------------------------------------------------------------------
// The decision form
// ---------------------------------------------------------------------------

export type DecisionForm = { reason: string; note: string };

/**
 * What is wrong with the form, in words, or null when it can be sent. The reason must be one of
 * the codes offered for this decision; the note is 5 to 500 characters once trimmed.
 */
export function decisionProblem(
  form: DecisionForm, allowed: readonly { key: string }[],
): string | null {
  if (!form.reason) return 'Choose a reason.';
  if (!allowed.some((r) => r.key === form.reason)) return 'Choose one of the listed reasons.';
  const note = form.note.trim();
  if (note.length < NOTE_MIN) {
    return note.length === 0 ? 'Add a note for the record.' : `The note needs at least ${NOTE_MIN} characters.`;
  }
  if (note.length > NOTE_MAX) return `Keep the note to ${NOTE_MAX} characters or fewer (it is ${note.length}).`;
  return null;
}

/** "12 of 500", for the counter under the note box. */
export const noteCount = (note: string) => `${note.trim().length} of ${NOTE_MAX}`;

// ---------------------------------------------------------------------------
// Evidence, in words
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * The evidence as sentences a reviewer can read, the headline first. Built only from signal names,
 * counts and ids the server sent: it cannot show a phone number, a token or an account number
 * because none is ever in the evidence.
 */
export function evidenceLines(flag: Pick<Flag, 'kind' | 'rule_key' | 'evidence'>): string[] {
  const ev = flag.evidence ?? {};
  const m = ev.measures ?? {};
  const signals = ev.signals ?? [];
  const others = ev.refs?.counterpart_user_ids?.length ?? 0;
  const kind = flag.rule_key || flag.kind;
  const lines: string[] = [];
  const num = (k: string) => (typeof m[k] === 'number' ? (m[k] as number) : null);

  if (kind === 'multi_accounting') {
    const how = signals.filter((s) => s in SIGNAL_WORDS).map((s) => SIGNAL_WORDS[s].replace(/^the /, ''));
    lines.push(`${capital(joinWords(how) || 'a shared signal')} as ${plural(others, 'other account')}`);
    const promos = num('promo_redemptions');
    if (promos) lines.push(`${plural(promos, 'promo redemption')} across the group`);
  } else if (kind === 'collusion') {
    const pair = num('top_pair_trips');
    if (pair) lines.push(`${plural(pair, 'trip')} between the same rider and driver`);
    const share = num('rider_share_pct');
    if (share != null) {
      lines.push(`${share}% of ${num('driver_trips') ?? 'the'} trips are with ${plural(others, 'rider')}`);
    }
    if (signals.includes('incentive_in_progress')) lines.push('An incentive was in progress');
  } else if (kind === 'incentive_farming') {
    const short = num('short_trips');
    const counted = num('counted_trips');
    if (short != null && counted != null) {
      lines.push(`${short} of ${counted} trips counted toward an incentive were very short`);
    }
  } else if (kind === 'gps_anomaly') {
    const trips = num('anomalous_trips');
    const parts = [
      signals.includes('impossible_jump') ? 'impossible jumps in the location trail' : '',
      signals.includes('trail_short_of_billed') ? 'a trail far shorter than the distance billed' : '',
    ].filter(Boolean);
    lines.push(`${plural(trips ?? 0, 'trip')} with ${joinWords(parts) || 'an odd trail'}`);
  } else if (kind === 'cancellation_abuse') {
    if (num('accepted') != null) {
      lines.push(`Cancelled ${num('cancelled')} of ${num('accepted')} accepted trips (${num('cancel_pct')}%)`);
    }
    if (num('cancelled_after_accept') != null) {
      lines.push(`Cancelled ${plural(num('cancelled_after_accept') ?? 0, 'trip')} after a driver accepted, ${num('refunded')} refunded`);
    }
  } else if (kind === 'payment_abuse') {
    const f = num('failed_online_payments');
    const r = num('refunds');
    const c = num('unpaid_cash_trips');
    if (f) lines.push(`${plural(f, 'failed online payment')}`);
    if (r) lines.push(`${plural(r, 'refunded payment')}`);
    if (c) lines.push(`${plural(c, 'completed cash trip')} left unpaid`);
  } else if (kind === 'referral_abuse') {
    const named = signals.map((s) => SIGNAL_WORDS[s] ?? s.replace(/_/g, ' '));
    const ref = ev.referral_id != null ? `Referral #${ev.referral_id}: ` : '';
    const trips = ev.trips_completed != null ? ` · ${plural(ev.trips_completed, 'trip')} completed` : '';
    lines.push(`${ref}${capital(joinWords(named) || 'no signal named')}${trips}`);
    if (others) lines.push(`Shared with ${plural(others, 'other account')}`);
  }
  if (lines.length === 0) {
    const named = signals.map((s) => SIGNAL_WORDS[s] ?? s.replace(/_/g, ' '));
    lines.push(named.length ? capital(joinWords(named)) : 'No evidence summary');
  }
  const hits = ev.hit_count ?? 1;
  if (hits > 1) lines.push(`Seen ${hits} times`);
  return lines;
}

/** The one-line version for a table cell. */
export const evidenceSummary = (flag: Pick<Flag, 'kind' | 'rule_key' | 'evidence'>) => evidenceLines(flag)[0];

/** Age as a person says it: "3 h", "2 d". */
export function ageWords(hours: number): string {
  if (hours < 1) return 'under 1 h';
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

// ---------------------------------------------------------------------------
// The queue's query
// ---------------------------------------------------------------------------

export type QueueFilters = {
  status: string; kind: string; severity: string; assigned: string; olderThanHours: string;
};
export const BLANK_FILTERS: QueueFilters = {
  status: 'active', kind: '', severity: '', assigned: '', olderThanHours: '',
};

export function queueQuery(f: QueueFilters, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams({ limit: '100' });
  if (f.status) q.set('status', f.status);
  if (f.kind) q.set('kind', f.kind);
  if (f.severity) q.set('severity', f.severity);
  if (f.assigned) q.set('assigned', f.assigned);
  if (f.olderThanHours) q.set('older_than_hours', f.olderThanHours);
  for (const [k, v] of Object.entries(extra)) q.set(k, v);
  return q.toString();
}

/** The filters a link carries (`/fraud?kind=referral_abuse`), falling back to the blank ones. */
export function filtersFromParams(get: (key: string) => string | null): QueueFilters {
  return {
    status: get('status') ?? BLANK_FILTERS.status,
    kind: get('kind') ?? '',
    severity: get('severity') ?? '',
    assigned: get('assigned') ?? '',
    olderThanHours: get('older_than_hours') ?? '',
  };
}

/** A rule threshold as a person reads it: "10 trips", "85 percent". */
export function thresholdWords(t: Pick<RuleThreshold, 'value' | 'unit'>): string {
  return `${t.value} ${t.unit}`;
}

/** The body of a rule-change request: only what differs from the current values. */
export function changedThresholds(
  rows: readonly RuleThreshold[], draft: Record<string, string>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const raw = (draft[row.key] ?? '').trim();
    if (raw !== '' && Number(raw) !== row.value) out[row.key] = Number(raw);
  }
  return out;
}

/** What is wrong with a draft threshold, or null. Whole numbers inside the server's bounds. */
export function thresholdProblem(row: RuleThreshold, raw: string): string | null {
  const text = raw.trim();
  if (text === '') return 'Enter a number.';
  if (!/^\d+$/.test(text)) return 'Whole numbers only.';
  const n = Number(text);
  if (n < row.low || n > row.high) return `Between ${row.low} and ${row.high}.`;
  return null;
}

// ---------------------------------------------------------------------------
// Money actions (owner rulings 2026-10-31, AUDIT 27.56)
// ---------------------------------------------------------------------------
//
// The server decides everything here (what is linked, what may be recovered, whether a payout hold
// is allowed). The console shows it, asks for the note, and sends it. Nothing is worked out from
// scratch except typing checks that spare a round trip.

export type RewardState = 'held' | 'credited' | 'paid' | 'forfeited';

export type LinkedReward = {
  ledger_entry_id: number; kind: string; campaign_id: number | null; campaign: string;
  amount_minor: number; currency: string; state: RewardState; held_minor: number;
  release_at: string | null; credited_at: string;
};

export type RecoveryDebtRow = {
  id: number; requested_minor: number; forfeited_minor: number; amount_minor: number;
  recovered_minor: number; uncollected_minor: number; remaining_minor: number; currency: string;
  created_at: string;
};

export type PayoutHoldRow = {
  id: number; status: 'active' | 'released' | 'lapsed'; starts_at: string; expires_at: string;
  max_days: number; renewal_of: number | null; note: string; released_at: string | null;
  release_note: string; approval_request_id: number;
};

export type MoneyBlock = {
  rewards: LinkedReward[]; currency: string | null; linked_minor: number; held_minor: number;
  paid_minor: number; recoverable_minor: number; can_recover: boolean; hold_days: number | null;
  debts: RecoveryDebtRow[];
  recover: { applies: boolean; may_request: boolean; max_minor: number; reason_code: string };
  cash: null | {
    offered: boolean; active: boolean; set_at: string | null; may_set: boolean; note: string;
    block_href: string;
  };
  payout_hold: {
    blockers: string[]; max_days: number; serious_reasons: string[]; active: boolean;
    holds: PayoutHoldRow[]; may_request: boolean; eligible: boolean;
  };
};

export const REWARD_STATE_WORDS: Record<RewardState, string> = {
  held: 'Held', credited: 'Credited, not yet paid', paid: 'Paid out', forfeited: 'Taken back',
};
export const rewardTone = (s: RewardState): Tone =>
  s === 'held' ? 'wait' : s === 'forfeited' ? 'bad' : s === 'paid' ? 'good' : 'neutral';

export const REWARD_KIND_WORDS: Record<string, string> = {
  incentive_reward: 'Incentive reward', referral_reward: 'Referral reward',
};

/** Why a payout hold cannot be requested yet, in words (the server's own codes). */
export const HOLD_BLOCKER_WORDS: Record<string, string> = {
  flag_not_confirmed: 'The flag is not confirmed.',
  reason_not_serious: 'It was confirmed for a reason that is not serious fraud (GPS spoofing or collusion).',
  subject_not_driver: 'The person is not a driver.',
  driver_not_suspended: 'The driver is not suspended. A payout hold goes together with a suspension.',
};
export const holdBlockers = (codes: readonly string[]) => codes.map((c) => HOLD_BLOCKER_WORDS[c] ?? c);

/** The typed amount (major units) as minor units, or null when it is not an amount. */
export function recoverAmountMinor(text: string, exponent: number): number | null {
  const t = text.trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  if (frac.length > exponent) return null;
  return Number(whole) * 10 ** exponent + Number(frac.padEnd(exponent, '0') || '0');
}

/** What is wrong with a recovery request, or null. The server re-checks the cap. */
export function recoverProblem(amountMinor: number | null, maxMinor: number, note: string): string | null {
  if (amountMinor === null || amountMinor <= 0) return 'Enter an amount above zero.';
  if (amountMinor > maxMinor) return 'That is more than the linked rewards allow.';
  const n = note.trim();
  if (n.length < NOTE_MIN) return `The note needs at least ${NOTE_MIN} characters.`;
  if (n.length > NOTE_MAX) return `Keep the note to ${NOTE_MAX} characters or fewer.`;
  return null;
}

/** What is wrong with a payout-hold request or release, or null. */
export function holdProblem(days: string, maxDays: number, note: string, needsDays = true): string | null {
  if (needsDays) {
    const d = days.trim();
    if (!/^\d+$/.test(d) || Number(d) < 1 || Number(d) > maxDays) return `Days must be a whole number from 1 to ${maxDays}.`;
  }
  const n = note.trim();
  if (n.length < NOTE_MIN) return `The note needs at least ${NOTE_MIN} characters.`;
  if (n.length > NOTE_MAX) return `Keep the note to ${NOTE_MAX} characters or fewer.`;
  return null;
}

/** The ledger carry-over line: what is left of a debt after the payouts so far. */
export function carryOverWords(d: Pick<RecoveryDebtRow, 'remaining_minor' | 'currency'>, fmt: (m: number, c: string) => string): string {
  return d.remaining_minor > 0
    ? `${fmt(d.remaining_minor, d.currency)} carries to the next payout`
    : 'Fully recovered';
}
