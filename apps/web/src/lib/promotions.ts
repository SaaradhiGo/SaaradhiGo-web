/**
 * Promotions & Incentives (module 12): rider promos, driver incentives, referrals, and the fraud
 * flags they raise.
 *
 * Pure helpers and the API shapes, so the pages stay thin and the rules that matter are tested in
 * one place. Nothing here talks to the network.
 *
 *   * money is integer minor units plus a currency, parsed and formatted by `lib/trips`, never a
 *     float: the budget bar and the cost projection are integer arithmetic;
 *   * the form's validation and the projection mirror the server (`servers/promotions/workflow.py`).
 *     The server re-checks every field and is the authority; these only spare a round trip and make
 *     the refusal visible while typing;
 *   * the console never shows a person: activity rows carry the masked reference the server sent
 *     (`rider #12`), and a fraud flag names the SIGNALS that matched, never a value.
 *
 * THE RULINGS THE SCREEN HAS TO SAY (owner, 2026-10-31, AUDIT 27.51)
 * -------------------------------------------------------------------
 * A rider promo is platform-funded: it lowers what the rider pays, never what the driver earns.
 * A budget is a hard cap. Driver rewards are paid in the weekly payout with no commission.
 * Going live, and raising a budget, need a second admin.
 */
import { can, type AdminAccess } from './adminScope';
import { exponentOf, formatMinor, parseMajorToMinor } from './trips';

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

export const canReadPromos = (a: AdminAccess | null) => can(a, 'promo.read');
export const canReadFraud = (a: AdminAccess | null) => can(a, 'fraud.read');

export type Kind = 'rider_promo' | 'driver_incentive' | 'referral';
export type Audience = 'rider' | 'driver';

/** Rider promos and rider referrals are Marketing's (`promo.write`); driver incentives and driver
 * referrals are City Ops' (`incentive.write`). */
export function writeCapability(kind: Kind, audience?: Audience | null): 'promo.write' | 'incentive.write' {
  if (kind === 'rider_promo') return 'promo.write';
  if (kind === 'driver_incentive') return 'incentive.write';
  return audience === 'driver' ? 'incentive.write' : 'promo.write';
}

export function canWrite(a: AdminAccess | null, kind: Kind, audience?: Audience | null): boolean {
  return can(a, writeCapability(kind, audience));
}

/** May the operator start a campaign of any kind on this tab? (Referrals: either audience.) */
export function canStart(a: AdminAccess | null, kind: Kind): boolean {
  if (kind === 'referral') return can(a, 'promo.write') || can(a, 'incentive.write');
  return canWrite(a, kind);
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type State =
  | 'draft' | 'pending_approval' | 'scheduled' | 'live' | 'paused' | 'exhausted' | 'ended' | 'cancelled';

export type StaffRef = { id: number | null; email: string; label: string; role: string };

export type BudgetView = {
  budget_minor: number | null; committed_minor: number; spent_minor: number;
  remaining_minor: number | null; overshoot_minor: number; used_percent: number | null;
  strict_cap: boolean; currency: string;
};

export type PromoConfig = {
  code: string; auto_apply: boolean; discount_type: 'percent' | 'flat';
  discount_percent: string | null; discount_flat_minor: number | null; max_discount_minor: number | null;
  min_fare_minor: number; max_per_user: number; max_total_redemptions: number | null;
  zone_code: string; new_riders_only: boolean;
};
export type IncentiveConfig = {
  target_trips: number; reward_minor: number; zone_code: string;
  hour_from: number | null; hour_to: number | null; vehicle_type: string;
};
export type ReferralConfig = {
  audience: Audience; required_trips: number; referrer_reward_minor: number; referee_reward_minor: number;
};

export type Projection = {
  budget_minor: number | null; average_minor: number | null; basis: string; max_redemptions: number | null;
};

export type Campaign = {
  id: number; kind: Kind; name: string; description: string; state: State; country: string;
  currency: string; scope: string | null; scope_name: string | null; scope_kind: string | null;
  budget: BudgetView; starts_at: string | null; ends_at: string | null;
  config: Partial<PromoConfig & IncentiveConfig & ReferralConfig>; is_legacy: boolean; reason: string;
  approval_request_id: number | null; budget_request_id: number | null; created_by: StaffRef;
  created_at: string; launched_at: string | null; paused_at: string | null; cancelled_at: string | null;
  exhausted_at: string | null; ended_at: string | null; write_capability: 'promo.write' | 'incentive.write';
  tax: string; projection?: Projection;
  ledger?: { kind: string; total_minor: number; entries: number; currency: string }[];
};

export type Redemption = {
  id: number; who: string; trip_id: number | null; discount_minor: number; currency: string;
  state: 'committed' | 'settled' | 'released' | 'legacy'; created_at: string; settled_at: string | null;
};
export type ProgressRow = {
  id: number; who: string; trips_counted: number; status: 'in_progress' | 'completed' | 'unfunded';
  reward_minor: number; currency: string; completed_at: string | null;
};
export type ReferralRow = {
  id: number; referrer: string; referee: string; status: 'attached' | 'qualified' | 'rewarded' | 'blocked';
  trips_completed: number; required_trips: number; blocked_signals: string[];
  referrer_reward_minor: number; referee_reward_minor: number; currency: string;
  created_at: string; rewarded_at: string | null; blocked_at: string | null;
};
export type Activity =
  | { activity: 'redemptions'; count: number; results: Redemption[] }
  | { activity: 'progress'; count: number; results: ProgressRow[] }
  | { activity: 'referrals'; count: number; results: ReferralRow[] };

export type Place = {
  code: string; name: string; kind: string; country: string; currency: string; can_write: string[];
};
export type Options = {
  places: Place[]; zones: { code: string; name: string; node: string; country: string }[]; vehicle_types: string[];
};

export type FraudFlag = {
  id: number; kind: string; status: 'open' | 'dismissed' | 'confirmed';
  subject: { ref: string; role: string; user_id: number };
  evidence: { signals?: string[]; referral_id?: number; campaign_id?: number; role?: string;
    trips_completed?: number; referee_user_id?: number };
  source_ref: string; scope: string | null; scope_name: string | null; created_at: string;
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const KIND_WORDS: Record<Kind, string> = {
  rider_promo: 'Rider promo', driver_incentive: 'Driver incentive', referral: 'Referral',
};

export const STATE_WORDS: Record<State, string> = {
  draft: 'Draft', pending_approval: 'Waiting for a checker', scheduled: 'Scheduled', live: 'Live',
  paused: 'Paused', exhausted: 'Budget used up', ended: 'Ended', cancelled: 'Cancelled',
};

export type Tone = 'good' | 'bad' | 'wait' | 'neutral';

/** The order a list reads in: what is running first, what is finished last. */
export const STATE_ORDER: Record<State, number> = {
  live: 0, scheduled: 1, pending_approval: 2, paused: 3, exhausted: 4, draft: 5, ended: 6, cancelled: 7,
};

export const stateTone = (s: State): Tone =>
  s === 'live' ? 'good' : s === 'exhausted' ? 'bad'
    : s === 'pending_approval' || s === 'scheduled' || s === 'paused' ? 'wait' : 'neutral';

export const SIGNAL_WORDS: Record<string, string> = {
  same_device: 'the same device', same_phone: 'the same phone number',
  same_instrument: 'the same payment instrument',
};

/** "Blocked: the same phone number and the same device." The reason a reward was held. */
export function blockedWords(signals: readonly string[] | null | undefined): string {
  const named = (signals ?? []).map((s) => SIGNAL_WORDS[s] ?? s.replace(/_/g, ' '));
  if (named.length === 0) return 'Blocked';
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  return `Blocked: ${list}`;
}

export const REFERRAL_STATUS_WORDS: Record<ReferralRow['status'], string> = {
  attached: 'Waiting for trips', qualified: 'Qualified, unpaid', rewarded: 'Rewarded', blocked: 'Reward blocked',
};

/** "Matched on the same phone number and the same device": the reason line under a blocked reward. */
export function matchedWords(signals: readonly string[] | null | undefined): string {
  const named = (signals ?? []).map((s) => SIGNAL_WORDS[s] ?? s.replace(/_/g, ' '));
  if (named.length === 0) return 'Matched on a signal';
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}`;
  return `Matched on ${list}`;
}

export const referralTone = (s: ReferralRow['status']): Tone =>
  s === 'rewarded' ? 'good' : s === 'blocked' ? 'bad' : s === 'qualified' ? 'wait' : 'neutral';

export const PROGRESS_WORDS: Record<ProgressRow['status'], string> = {
  in_progress: 'In progress', completed: 'Reward paid', unfunded: 'Completed, budget used up',
};

export const REDEMPTION_WORDS: Record<Redemption['state'], string> = {
  committed: 'Reserved on a booked trip', settled: 'Settled', released: 'Released (trip cancelled)',
  legacy: 'Before budgets',
};

export const FRAUD_KIND_WORDS: Record<string, string> = { referral_abuse: 'Referral abuse' };

// ---------------------------------------------------------------------------
// The budget bar
// ---------------------------------------------------------------------------

export type Segments = {
  /** Widths in whole percent of the budget; they never sum above 100. */
  spent: number; committed: number; remaining: number;
  /** True when `committed + spent` stands above the budget (honoured trips crossed the cap). */
  over: boolean; overshootMinor: number; unlimited: boolean;
};

/**
 * The bar: spent (settled), committed (reserved on booked trips, not yet settled) and what is
 * left. A wrapped legacy campaign has no budget and draws no bar (`unlimited`). Integer maths on
 * minor units; a pixel never decides money, so the percentages round DOWN for the used parts and
 * the rest is "remaining", which keeps the three honest at any width.
 */
export function segments(b: Pick<BudgetView, 'budget_minor' | 'committed_minor' | 'spent_minor'>): Segments {
  const budget = b.budget_minor;
  if (budget === null || budget === undefined) {
    return { spent: 0, committed: 0, remaining: 0, over: false, overshootMinor: 0, unlimited: true };
  }
  if (budget <= 0) return { spent: 0, committed: 0, remaining: 0, over: false, overshootMinor: 0, unlimited: false };
  const used = b.committed_minor + b.spent_minor;
  const over = used > budget;
  const spent = Math.min(100, Math.floor((b.spent_minor * 100) / budget));
  const committed = Math.min(100 - spent, Math.floor((b.committed_minor * 100) / budget));
  return {
    spent, committed, remaining: Math.max(0, 100 - spent - committed), over,
    overshootMinor: over ? used - budget : 0, unlimited: false,
  };
}

/** "₹1,250.00 spent · ₹300.00 reserved · ₹8,450.00 left" for the bar's text alternative. */
export function budgetWords(b: BudgetView): string {
  if (b.budget_minor === null) return 'No budget (an existing code, not capped)';
  const c = b.currency;
  const parts = [
    `${formatMinor(b.spent_minor, c)} spent`, `${formatMinor(b.committed_minor, c)} reserved`,
    `${formatMinor(b.remaining_minor ?? 0, c)} left of ${formatMinor(b.budget_minor, c)}`,
  ];
  if (b.overshoot_minor > 0) parts.push(`${formatMinor(b.overshoot_minor, c)} over the cap (honoured trips)`);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// The form
// ---------------------------------------------------------------------------

export type DraftForm = {
  kind: Kind;
  name: string; description: string; scope: string; startsAt: string; endsAt: string;
  budget: string; strictCap: boolean; reason: string;
  // rider promo
  code: string; autoApply: boolean; discountType: 'percent' | 'flat'; discountPercent: string;
  discountFlat: string; maxDiscount: string; minFare: string; maxPerUser: string; maxTotal: string;
  zoneCode: string; newRidersOnly: boolean; typicalFare: string;
  // driver incentive
  targetTrips: string; reward: string; hourFrom: string; hourTo: string; vehicleType: string;
  // referral
  audience: Audience; requiredTrips: string; referrerReward: string; refereeReward: string;
};

export function blankForm(kind: Kind, audience: Audience = 'rider'): DraftForm {
  return {
    kind, name: '', description: '', scope: '', startsAt: '', endsAt: '', budget: '', strictCap: true,
    reason: '', code: '', autoApply: false, discountType: 'flat', discountPercent: '', discountFlat: '',
    maxDiscount: '', minFare: '', maxPerUser: '1', maxTotal: '', zoneCode: '', newRidersOnly: false,
    typicalFare: '', targetTrips: '', reward: '', hourFrom: '', hourTo: '', vehicleType: '', audience,
    requiredTrips: '', referrerReward: '', refereeReward: '',
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** An ISO instant as the value of a `datetime-local` input, in the browser's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const majorText = (minor: number | null | undefined, currency: string): string => {
  if (minor === null || minor === undefined) return '';
  const exp = exponentOf(currency);
  const digits = String(minor).padStart(exp + 1, '0');
  const whole = digits.slice(0, digits.length - exp);
  return exp ? `${whole}.${digits.slice(digits.length - exp)}` : whole;
};

export function fromCampaign(c: Campaign): DraftForm {
  const cfg = c.config;
  const currency = c.currency;
  const form = blankForm(c.kind, (cfg.audience as Audience | undefined) ?? 'rider');
  return {
    ...form,
    name: c.name, description: c.description, scope: c.scope ?? '',
    startsAt: toLocalInput(c.starts_at), endsAt: toLocalInput(c.ends_at),
    budget: majorText(c.budget.budget_minor, currency), strictCap: c.budget.strict_cap, reason: c.reason,
    code: cfg.code ?? '', autoApply: cfg.auto_apply === true,
    discountType: cfg.discount_type ?? 'flat', discountPercent: cfg.discount_percent ?? '',
    discountFlat: majorText(cfg.discount_flat_minor, currency),
    maxDiscount: majorText(cfg.max_discount_minor, currency),
    minFare: cfg.min_fare_minor ? majorText(cfg.min_fare_minor, currency) : '',
    maxPerUser: String(cfg.max_per_user ?? 1),
    maxTotal: cfg.max_total_redemptions ? String(cfg.max_total_redemptions) : '',
    zoneCode: cfg.zone_code ?? '', newRidersOnly: cfg.new_riders_only === true,
    targetTrips: cfg.target_trips ? String(cfg.target_trips) : '',
    reward: majorText(cfg.reward_minor, currency),
    hourFrom: cfg.hour_from === null || cfg.hour_from === undefined ? '' : String(cfg.hour_from),
    hourTo: cfg.hour_to === null || cfg.hour_to === undefined ? '' : String(cfg.hour_to),
    vehicleType: cfg.vehicle_type ?? '',
    requiredTrips: cfg.required_trips ? String(cfg.required_trips) : '',
    referrerReward: cfg.referrer_reward_minor ? majorText(cfg.referrer_reward_minor, currency) : '',
    refereeReward: cfg.referee_reward_minor ? majorText(cfg.referee_reward_minor, currency) : '',
  };
}

/** A typed amount as minor units; blank is "not given" (null), zero is `0`, junk is `undefined`. */
export function minorOf(text: string, currency: string): number | null | undefined {
  const t = text.trim();
  if (t === '') return null;
  if (/^0+(\.0*)?$/.test(t.replace(/[\s,]/g, ''))) return 0;
  const parsed = parseMajorToMinor(t, currency);
  return parsed === null ? undefined : parsed;
}

const wholeNumber = (text: string): number | null => {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
};

export const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,31}$/;
export const REASON_MIN = 5;

export type Problems = Partial<Record<keyof DraftForm | 'window' | 'amount', string>>;

/** The smallest budget that can fund one reward (the server's `clean_budget` floor). */
export function budgetFloor(form: DraftForm, currency: string): number {
  if (form.kind === 'rider_promo') return 1;
  if (form.kind === 'driver_incentive') return minorOf(form.reward, currency) || 1;
  return (minorOf(form.referrerReward, currency) || 0) + (minorOf(form.refereeReward, currency) || 0) || 1;
}

/**
 * Every problem with a draft, keyed by field. Empty means the form may be saved. The server
 * repeats each check; this makes the refusal visible while typing.
 */
export function validateForm(form: DraftForm, currency: string, now: Date = new Date()): Problems {
  const p: Problems = {};
  if (!form.name.trim()) p.name = 'Give it a name.';
  else if (form.name.trim().length > 120) p.name = 'The name is at most 120 characters.';
  if (!form.scope) p.scope = 'Choose where it runs.';

  const starts = form.startsAt ? new Date(form.startsAt) : null;
  const ends = form.endsAt ? new Date(form.endsAt) : null;
  if (!starts || Number.isNaN(starts.getTime())) p.startsAt = 'Say when it starts.';
  if (!ends || Number.isNaN(ends.getTime())) p.endsAt = 'Say when it ends.';
  if (starts && ends && !Number.isNaN(starts.getTime()) && !Number.isNaN(ends.getTime())) {
    if (ends <= starts) p.endsAt = 'It must end after it starts.';
    else if (ends <= now) p.endsAt = 'That end time has already passed.';
  }

  const budget = minorOf(form.budget, currency);
  if (budget === null) p.budget = 'Set a budget: a campaign stops when it is used up.';
  else if (budget === undefined || budget <= 0) p.budget = 'Enter an amount above zero, with at most two decimals.';

  if (form.kind === 'rider_promo') validatePromo(form, currency, p);
  else if (form.kind === 'driver_incentive') validateIncentive(form, currency, p);
  else validateReferral(form, currency, p);

  if (typeof budget === 'number' && budget > 0 && !p.reward && !p.referrerReward && !p.discountFlat) {
    const floor = budgetFloor(form, currency);
    if (budget < floor) p.budget = `The budget cannot fund even one reward (at least ${formatMinor(floor, currency)}).`;
  }
  return p;
}

function validatePromo(form: DraftForm, currency: string, p: Problems) {
  const code = form.code.trim().toUpperCase();
  if (!form.autoApply && !code) p.code = 'Give it a code, or apply it automatically.';
  else if (code && !CODE_RE.test(code)) p.code = 'A code is 3 to 32 letters, digits, dashes or underscores.';
  if (form.discountType === 'percent') {
    const pct = Number(form.discountPercent);
    if (form.discountPercent.trim() === '' || !Number.isFinite(pct) || pct <= 0 || pct > 100
      || !/^\d+(\.\d{1,2})?$/.test(form.discountPercent.trim())) {
      p.discountPercent = 'A percentage above 0 and at most 100, with at most two decimals.';
    }
    const cap = minorOf(form.maxDiscount, currency);
    if (cap === undefined || cap === 0) p.maxDiscount = 'Enter an amount above zero, or leave it empty.';
  } else {
    const flat = minorOf(form.discountFlat, currency);
    if (flat === null) p.discountFlat = 'How much comes off?';
    else if (flat === undefined || flat <= 0) p.discountFlat = 'Enter an amount above zero, with at most two decimals.';
  }
  if (minorOf(form.minFare, currency) === undefined) p.minFare = 'Enter an amount, or leave it empty.';
  const per = wholeNumber(form.maxPerUser);
  if (per === null || per < 1 || per > 1000) p.maxPerUser = 'A whole number from 1 to 1000.';
  if (form.maxTotal.trim() !== '') {
    const total = wholeNumber(form.maxTotal);
    if (total === null || total < 1) p.maxTotal = 'A whole number above zero, or leave it empty.';
  }
}

function validateIncentive(form: DraftForm, currency: string, p: Problems) {
  const target = wholeNumber(form.targetTrips);
  if (target === null || target < 1 || target > 1000) p.targetTrips = 'A whole number of trips, 1 to 1000.';
  const reward = minorOf(form.reward, currency);
  if (reward === null) p.reward = 'How much is the reward?';
  else if (reward === undefined || reward <= 0) p.reward = 'Enter an amount above zero, with at most two decimals.';
  const from = form.hourFrom.trim(); const to = form.hourTo.trim();
  if ((from === '') !== (to === '')) p.hourFrom = 'Give both hours, or neither.';
  else if (from !== '') {
    const a = wholeNumber(from); const b = wholeNumber(to);
    if (a === null || a > 23) p.hourFrom = 'The start hour is 0 to 23.';
    if (b === null || b > 24) p.hourTo = 'The end hour is 0 to 24.';
    if (a !== null && b !== null && a === b) p.hourTo = 'The hours must differ.';
  }
}

function validateReferral(form: DraftForm, currency: string, p: Problems) {
  const trips = wholeNumber(form.requiredTrips);
  if (trips === null || trips < 1 || trips > 100) p.requiredTrips = 'A whole number of trips, 1 to 100.';
  const a = minorOf(form.referrerReward, currency);
  const b = minorOf(form.refereeReward, currency);
  if (a === undefined) p.referrerReward = 'Enter an amount, or leave it empty.';
  if (b === undefined) p.refereeReward = 'Enter an amount, or leave it empty.';
  if (a !== undefined && b !== undefined && (a ?? 0) + (b ?? 0) <= 0) {
    p.referrerReward = 'Reward the referrer, the referee, or both.';
  }
}

/** The server's body for the form. Call only when `validateForm` is empty. */
export function toPayload(form: DraftForm, currency: string): Record<string, unknown> {
  const base = {
    kind: form.kind, name: form.name.trim(), description: form.description.trim(), scope: form.scope,
    budget_minor: minorOf(form.budget, currency), strict_cap: form.strictCap,
    starts_at: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    ends_at: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    reason: form.reason.trim(),
  };
  if (form.kind === 'rider_promo') {
    return {
      ...base,
      config: {
        code: form.code.trim().toUpperCase(), auto_apply: form.autoApply, discount_type: form.discountType,
        discount_percent: form.discountType === 'percent' ? form.discountPercent.trim() : null,
        discount_flat_minor: form.discountType === 'flat' ? minorOf(form.discountFlat, currency) : null,
        max_discount_minor: form.discountType === 'percent' ? (minorOf(form.maxDiscount, currency) ?? null) : null,
        min_fare_minor: minorOf(form.minFare, currency) ?? 0, max_per_user: Number(form.maxPerUser),
        max_total_redemptions: form.maxTotal.trim() ? Number(form.maxTotal) : null,
        zone_code: form.zoneCode, new_riders_only: form.newRidersOnly,
      },
    };
  }
  if (form.kind === 'driver_incentive') {
    return {
      ...base,
      config: {
        target_trips: Number(form.targetTrips), reward_minor: minorOf(form.reward, currency),
        zone_code: form.zoneCode,
        hour_from: form.hourFrom.trim() === '' ? null : Number(form.hourFrom),
        hour_to: form.hourTo.trim() === '' ? null : Number(form.hourTo),
        vehicle_type: form.vehicleType,
      },
    };
  }
  return {
    ...base,
    config: {
      audience: form.audience, required_trips: Number(form.requiredTrips),
      referrer_reward_minor: minorOf(form.referrerReward, currency) ?? 0,
      referee_reward_minor: minorOf(form.refereeReward, currency) ?? 0,
    },
  };
}

/** The reason a submit needs (kept in the audit log), separate from saving a draft. */
export function submitProblem(reason: string): string | null {
  return reason.trim().length >= REASON_MIN ? null : 'Say why, in a few words.';
}

// ---------------------------------------------------------------------------
// The cost projection
// ---------------------------------------------------------------------------

export type Cost = {
  budgetMinor: number | null;
  /** What one redemption (or reward) costs on average, or null if it cannot be known yet. */
  averageMinor: number | null;
  /** How many the budget funds, at that average, never above a per-campaign redemption cap. */
  maxRedemptions: number | null;
  basis: string;
  /** Why there is no average yet (percent promo with no typical fare). */
  hint: string;
};

/**
 * What the budget buys: the average discount (or reward) and how many redemptions it funds. Integer
 * maths on minor units. A percentage promo needs a typical fare to price a discount; the form asks
 * for one, and after saving the server projects from the last 30 days of fares in that place.
 */
export function projectCost(form: DraftForm, currency: string): Cost {
  const budget = minorOf(form.budget, currency);
  const budgetMinor = typeof budget === 'number' && budget > 0 ? budget : null;
  let average: number | null = null;
  let basis = ''; let hint = '';
  if (form.kind === 'rider_promo') {
    if (form.discountType === 'flat') {
      const flat = minorOf(form.discountFlat, currency);
      average = typeof flat === 'number' && flat > 0 ? flat : null;
      basis = 'a flat amount per ride';
    } else {
      const fare = minorOf(form.typicalFare, currency);
      const pct = form.discountPercent.trim();
      if (typeof fare === 'number' && fare > 0 && /^\d+(\.\d{1,2})?$/.test(pct)) {
        // percent in hundredths, so 12.5 % of 20000 is (20000 * 1250 + 5000) / 10000, rounded half up.
        const hundredths = Math.round(Number(pct) * 100);
        average = Math.floor((fare * hundredths + 5000) / 10000);
        const cap = minorOf(form.maxDiscount, currency);
        if (typeof cap === 'number' && cap > 0) average = Math.min(average, cap);
        basis = 'the percentage of the typical fare you entered';
      } else {
        hint = 'Enter a typical fare to price a percentage discount.';
      }
    }
  } else if (form.kind === 'driver_incentive') {
    const reward = minorOf(form.reward, currency);
    average = typeof reward === 'number' && reward > 0 ? reward : null;
    basis = 'the reward, once per driver who completes it';
  } else {
    const a = minorOf(form.referrerReward, currency) ?? 0;
    const b = minorOf(form.refereeReward, currency) ?? 0;
    average = a > 0 || b > 0 ? a + b : null;
    basis = 'both rewards per qualified referral';
  }
  let max: number | null = null;
  if (budgetMinor !== null && average) {
    max = Math.floor(budgetMinor / average);
    const cap = form.kind === 'rider_promo' && form.maxTotal.trim() ? Number(form.maxTotal) : null;
    if (cap && Number.isFinite(cap)) max = Math.min(max, cap);
  }
  return { budgetMinor, averageMinor: average, maxRedemptions: max, basis, hint };
}

/** "Funds about 20 rides at ₹50.00 each." */
export function costWords(cost: Cost, kind: Kind, currency: string): string | null {
  if (cost.maxRedemptions === null || cost.averageMinor === null) return null;
  const unit = kind === 'rider_promo' ? 'ride' : kind === 'driver_incentive' ? 'driver reward' : 'referral';
  const n = cost.maxRedemptions;
  return `Funds about ${n} ${unit}${n === 1 ? '' : 's'} at ${formatMinor(cost.averageMinor, currency)} each.`;
}

// ---------------------------------------------------------------------------
// What can be done to a campaign in a state
// ---------------------------------------------------------------------------

export type Action = 'edit' | 'submit' | 'pause' | 'resume' | 'cancel' | 'raise';

/** The actions the server will accept for a state. The link rule: hide what would be refused. */
export function actionsFor(c: Pick<Campaign, 'state' | 'is_legacy' | 'budget'>): Action[] {
  const budgeted = c.budget.budget_minor !== null;
  switch (c.state) {
    case 'draft': return c.is_legacy ? ['cancel'] : ['edit', 'submit', 'cancel'];
    case 'pending_approval': return ['cancel'];
    case 'scheduled': return budgeted ? ['pause', 'cancel', 'raise'] : ['pause', 'cancel'];
    case 'live': return budgeted ? ['pause', 'cancel', 'raise'] : ['pause', 'cancel'];
    case 'paused': return budgeted ? ['resume', 'cancel', 'raise'] : ['resume', 'cancel'];
    case 'exhausted': return budgeted ? ['cancel', 'raise'] : ['cancel'];
    default: return [];
  }
}

/** A raised budget must be strictly more than the current one (the server refuses the rest). */
export function raiseProblem(text: string, current: number | null, currency: string): string | null {
  const minor = minorOf(text, currency);
  if (minor === null) return 'Enter the new total budget.';
  if (minor === undefined || minor <= 0) return 'Enter an amount above zero, with at most two decimals.';
  if (current !== null && minor <= current) return `A budget can only go up. It is ${formatMinor(current, currency)} now.`;
  return null;
}

/** The scope-aware default place: the first place the operator may write in for a tab's kind. */
export function placesFor(options: Options | null, kind: Kind, audience: Audience): Place[] {
  const need = writeCapability(kind, audience);
  return (options?.places ?? []).filter((p) => p.can_write.includes(need));
}

// ---------------------------------------------------------------------------
// A campaign's terms, in a line
// ---------------------------------------------------------------------------

/** "WELCOME50 · ₹50.00 off" / "3 trips, ₹300.00 reward" / "2 trips · ₹100.00 + ₹50.00 (riders)". */
export function termsWords(c: Pick<Campaign, 'kind' | 'config' | 'currency'>): string {
  const cfg = c.config;
  const money = (m: number | null | undefined) => formatMinor(m ?? 0, c.currency);
  if (c.kind === 'rider_promo') {
    const code = cfg.auto_apply ? 'Applied automatically' : (cfg.code ?? '');
    const off = cfg.discount_type === 'percent'
      ? `${cfg.discount_percent ?? '?'}% off${cfg.max_discount_minor ? ` up to ${money(cfg.max_discount_minor)}` : ''}`
      : `${money(cfg.discount_flat_minor)} off`;
    return `${code} · ${off}`;
  }
  if (c.kind === 'driver_incentive') {
    const filters = [cfg.zone_code, cfg.vehicle_type,
      cfg.hour_from !== null && cfg.hour_from !== undefined ? `${cfg.hour_from}:00 to ${cfg.hour_to}:00` : '']
      .filter(Boolean).join(', ');
    return `${cfg.target_trips ?? '?'} trips, ${money(cfg.reward_minor)} reward${filters ? ` (${filters})` : ''}`;
  }
  const parts = [cfg.referrer_reward_minor ? `${money(cfg.referrer_reward_minor)} to the referrer` : '',
    cfg.referee_reward_minor ? `${money(cfg.referee_reward_minor)} to the new ${cfg.audience ?? 'rider'}` : '']
    .filter(Boolean).join(', ');
  return `After ${cfg.required_trips ?? '?'} trips · ${parts} (${cfg.audience === 'driver' ? 'drivers' : 'riders'})`;
}

/**
 * Totals across a list, per currency, for the strip above it. Never summed across currencies, and
 * only for campaigns that were launched: a draft or a request waiting for a checker has committed
 * the platform to nothing.
 */
export function totalsByCurrency(
  rows: readonly (Pick<Campaign, 'budget' | 'currency'> & { state?: State })[],
): { currency: string; budget: number; spent: number; committed: number }[] {
  const by = new Map<string, { currency: string; budget: number; spent: number; committed: number }>();
  for (const r of rows) {
    if (r.budget.budget_minor === null) continue;
    if (r.state && ['draft', 'pending_approval', 'cancelled'].includes(r.state)) continue;
    const t = by.get(r.currency) ?? { currency: r.currency, budget: 0, spent: 0, committed: 0 };
    t.budget += r.budget.budget_minor;
    t.spent += r.budget.spent_minor;
    t.committed += r.budget.committed_minor;
    by.set(r.currency, t);
  }
  return [...by.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
