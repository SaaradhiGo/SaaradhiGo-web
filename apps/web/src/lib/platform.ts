/**
 * Platform Settings & Integrations (module 15): shapes, capability checks and the pure rules.
 *
 * Pure helpers and the API shapes, so the pages stay thin and the rules are tested in one place.
 * Nothing here talks to the network. Every rule that matters is re-checked by the server
 * (`servers/platform_ops`); what is mirrored here only spares a round trip and makes a refusal
 * visible while typing.
 *
 * NO MARKET IS ASSUMED. Nothing in this file names a country, a currency or a city: countries and
 * cities come from the API, and a status word is just a word.
 */
import { can, type AdminAccess } from './adminScope';

// ---------------------------------------------------------------------------
// Capabilities (what draws a tab or a button; the server still decides)
// ---------------------------------------------------------------------------

export const canReadPlatform = (a: AdminAccess | null) => can(a, 'platform.read');
export const canWritePlatform = (a: AdminAccess | null) => can(a, 'platform.settings');
export const canPauseCity = (a: AdminAccess | null) => can(a, 'platform.city_pause') || can(a, 'platform.settings');
export const canReadIntegrations = (a: AdminAccess | null) => can(a, 'platform.integrations.read');
export const canReadAudit = (a: AdminAccess | null) => can(a, 'audit.read');
export const canCheck = (a: AdminAccess | null) => can(a, 'approval.check');

export type PlatformTab = 'markets' | 'flags' | 'versions' | 'notices' | 'settings' | 'integrations' | 'audit';

export const TABS: { key: PlatformTab; href: string; label: string; open: (a: AdminAccess | null) => boolean }[] = [
  { key: 'markets', href: '/settings', label: 'Markets', open: canReadPlatform },
  { key: 'flags', href: '/settings/flags', label: 'Feature flags', open: canReadPlatform },
  { key: 'versions', href: '/settings/app-versions', label: 'App versions', open: canReadPlatform },
  { key: 'notices', href: '/settings/notices', label: 'Notices', open: canReadPlatform },
  { key: 'settings', href: '/settings/platform', label: 'Platform settings', open: canWritePlatform },
  { key: 'integrations', href: '/settings/integrations', label: 'Integrations', open: canReadIntegrations },
  { key: 'audit', href: '/settings/audit', label: 'Audit log', open: canReadAudit },
];

/** The tabs this operator may open, in order. Empty when none: the page says so. */
export function visibleTabs(a: AdminAccess | null) {
  return TABS.filter((t) => t.open(a));
}

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export type Pending = {
  id: number; target?: string; kind?: string | null; to_status?: string | null;
  payload?: Record<string, unknown>; node?: { kind: string; code: string; name: string } | null;
  reason: string; maker_label: string; maker_id: number | null; requested_at: string | null;
  expires_at: string | null; country?: string;
};

/** May this operator act as the checker on `req`? (Not their own request; they hold approval.check.) */
export function mayDecide(a: AdminAccess | null, req: Pick<Pending, 'maker_id'>): boolean {
  if (!canCheck(a)) return false;
  if (!a) return false;
  return String(req.maker_id ?? '') !== String(a.id);
}

// ---------------------------------------------------------------------------
// Markets
// ---------------------------------------------------------------------------

export type MarketStatus = 'live' | 'paused' | 'draft';
export const MARKET_STATUS_WORDS: Record<MarketStatus, string> = { live: 'Live', paused: 'Paused', draft: 'Draft' };
export const marketTone = (s: MarketStatus): 'good' | 'bad' | 'wait' | 'neutral' =>
  (s === 'live' ? 'good' : s === 'paused' ? 'bad' : 'neutral');

export type ReadinessStatus = 'ok' | 'missing' | 'warning';
export type ReadinessItem = {
  key: string; ok: boolean; status: ReadinessStatus; blocking: boolean; label: string; detail: string; href: string;
};
export const READINESS_WORDS: Record<ReadinessStatus, string> = { ok: 'Ready', missing: 'Missing', warning: 'Warning' };
export const readinessTone = (s: ReadinessStatus): 'good' | 'bad' | 'wait' => (s === 'ok' ? 'good' : s === 'missing' ? 'bad' : 'wait');

export type CityRow = {
  code: string; name: string; status: MarketStatus; country: string | null;
  state: { code: string; name: string } | null; blocking_count: number; warning_count: number; ready: boolean;
  readiness: ReadinessItem[] | null; pending_request: Pending | null; may_launch: boolean; may_pause: boolean;
};
export type CountryRow = {
  code: string; name: string; currency: string | null; status: MarketStatus; in_registry: boolean;
  cities: CityRow[]; may_add_city: boolean;
};
export type MarketsPayload = { countries: CountryRow[]; pending: Pending[] };

/** One sentence for a city's readiness, for a table cell. */
export function readinessSummary(city: Pick<CityRow, 'blocking_count' | 'warning_count' | 'status'>): string {
  if (city.blocking_count > 0) {
    return `${city.blocking_count} blocking item${city.blocking_count === 1 ? '' : 's'}`;
  }
  if (city.warning_count > 0) {
    return `Ready, ${city.warning_count} warning${city.warning_count === 1 ? '' : 's'}`;
  }
  return 'Ready';
}

/** Can a launch be asked for right now? (Blocking items present means no.) */
export function launchBlockedBy(items: ReadinessItem[] | null | undefined): ReadinessItem[] {
  return (items ?? []).filter((i) => i.blocking);
}

/** The words for what a pending city request asks. */
export function pendingWords(p: Pending): string {
  if (p.kind === 'add_node' && p.node) return `Add ${p.node.kind} ${p.node.name} (${p.node.code}) as a draft`;
  if (p.to_status === 'live') return `Launch ${p.target ?? 'the city'}`;
  if (p.to_status === 'paused') return `Pause ${p.target ?? 'the city'}`;
  return `Change ${p.target ?? 'a place'}`;
}

// ---------------------------------------------------------------------------
// Feature flags
// ---------------------------------------------------------------------------

export type Flag = {
  key: string; description: string; owner_area: string; default_enabled: boolean;
  overrides: Record<string, boolean>; money_affecting: boolean; safety: boolean; needs_checker: boolean;
  is_archived: boolean; version: number; updated_by: string | null; updated_at: string | null;
};
export type FlagHistory = { version: number; snapshot: { default: boolean; overrides: Record<string, boolean> };
  changed_by: string; reason: string; approval_request_id: number | null; created_at: string };

/**
 * What a flag resolves to at a place: the city override, else the country override, else the
 * default (the same order as the server, `platform_ops.flags.resolve`).
 */
export function resolveFlag(flag: Pick<Flag, 'default_enabled' | 'overrides'>, cityCode: string | null, countryCode: string | null) {
  if (cityCode && cityCode in flag.overrides) return { enabled: flag.overrides[cityCode], source: 'city' as const };
  if (countryCode && countryCode in flag.overrides) return { enabled: flag.overrides[countryCode], source: 'country' as const };
  return { enabled: flag.default_enabled, source: 'default' as const };
}

export const FLAG_KEY_RE = /^[a-z][a-z0-9_.]{2,79}$/;

export function validateFlagKey(key: string): string | null {
  return FLAG_KEY_RE.test(key) ? null : 'A flag key is lowercase letters, digits, "_" or "." (3 to 80 characters, starting with a letter).';
}

// ---------------------------------------------------------------------------
// App versions
// ---------------------------------------------------------------------------

export type VersionSlot = {
  app: 'rider' | 'driver'; platform: 'android' | 'ios'; minimum_version: string; latest_version: string;
  store_url: string; message: string; version: number; updated_by: string | null; updated_at: string | null;
};

const VERSION_RE = /^\d{1,4}(\.\d{1,4}){0,3}$/;

/** `[1, 4, 2, 0]` from "1.4.2", "1.4.2+17" or "1.4.2-beta"; null when it is not a version. */
export function parseVersion(text: string | null | undefined): number[] | null {
  const base = String(text ?? '').trim().split(/[+\-\s]/)[0];
  if (!VERSION_RE.test(base)) return null;
  const parts = base.split('.').map((p) => Number(p));
  while (parts.length < 4) parts.push(0);
  return parts;
}

/** -1, 0 or 1; null when either is not a version. Numeric, so 1.10.0 is above 1.9.0. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return null;
  for (let i = 0; i < 4; i += 1) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/** Does moving the minimum from `from` to `to` force users off old builds (so needs a checker)? */
export function isMinimumRaise(from: string, to: string): boolean {
  return compareVersions(to, from) === 1;
}

export function validateVersionSlot(v: { minimum: string; latest: string; storeUrl: string; message: string }): string | null {
  if (parseVersion(v.minimum) === null || !VERSION_RE.test(v.minimum.trim())) return 'The minimum version must look like 1.4.2.';
  if (parseVersion(v.latest) === null || !VERSION_RE.test(v.latest.trim())) return 'The latest version must look like 1.4.2.';
  if (compareVersions(v.latest.trim(), v.minimum.trim()) === -1) return 'The latest version cannot be below the minimum.';
  if (v.storeUrl.trim() && !/^https:\/\//i.test(v.storeUrl.trim())) return 'The store link must start with https://.';
  if (v.storeUrl.length > 300 || v.message.length > 300) return 'The store link and the message are at most 300 characters.';
  return null;
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export const NOTICE_MAX = 280;
export type Notice15 = {
  id: number; scope: string | null; scope_name: string; audience: 'rider' | 'driver' | 'console';
  starts_at: string; ends_at: string; message: string; severity: 'info' | 'warning';
  state: 'scheduled' | 'active' | 'ended' | 'cancelled'; created_by: string | null; created_at: string;
};
export const AUDIENCE_WORDS = { rider: 'Rider app', driver: 'Driver app', console: 'Console' } as const;
export const NOTICE_STATE_WORDS = { scheduled: 'Scheduled', active: 'Showing now', ended: 'Ended', cancelled: 'Cancelled' } as const;
export const noticeTone = (s: Notice15['state']): 'good' | 'bad' | 'wait' | 'neutral' =>
  (s === 'active' ? 'good' : s === 'scheduled' ? 'wait' : 'neutral');

export function validateNotice(n: { message: string; startsAt: string; endsAt: string }): string | null {
  const text = n.message.trim();
  if (!text) return 'Write the message.';
  if (text.length > NOTICE_MAX) return `A notice is at most ${NOTICE_MAX} characters.`;
  if (/[<>]/.test(text)) return 'A notice is plain text: no markup.';
  const start = new Date(n.startsAt).getTime();
  const end = new Date(n.endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Give a start and an end.';
  if (end <= start) return 'The end must be after the start.';
  if ((end - start) / 86_400_000 > 90) return 'A notice runs at most 90 days.';
  return null;
}

/** Is this notice showing at `now`? Start inclusive, end exclusive, cancelled never. */
export function noticeActiveAt(n: Pick<Notice15, 'starts_at' | 'ends_at' | 'state'>, now: Date): boolean {
  if (n.state === 'cancelled') return false;
  const t = now.getTime();
  return new Date(n.starts_at).getTime() <= t && t < new Date(n.ends_at).getTime();
}

// ---------------------------------------------------------------------------
// Platform settings
// ---------------------------------------------------------------------------

export const SETTING_TYPES = ['integer', 'decimal', 'boolean', 'string', 'json'] as const;
export type SettingType = (typeof SETTING_TYPES)[number];
export type SettingRow = {
  key: string; setting_type: SettingType; value: string; masked: boolean; description: string;
  is_sensitive: boolean; deprecated: boolean; deprecated_note: string | null; deprecated_href: string | null;
  editable: boolean; controls: string[]; updated_by: string | null; updated_at: string | null;
};
export const SETTING_KEY_RE = /^[A-Z][A-Z0-9_]{2,127}$/;
const SENSITIVE_WORDS = ['SECRET', 'TOKEN', 'PASSWORD', 'KEY', 'CREDENTIAL'];

export const looksSensitive = (key: string) => SENSITIVE_WORDS.some((w) => key.includes(w));

/** Null when `raw` is a valid `type`; else a sentence (mirrors `settings_editor.canonical`). */
export function validateSettingValue(type: SettingType, raw: string): string | null {
  const text = raw.trim();
  switch (type) {
    case 'integer': return /^-?\d+$/.test(text) ? null : 'That is not a whole number.';
    case 'decimal': return /^-?\d+(\.\d+)?$/.test(text) ? null : 'That is not a number.';
    case 'boolean': return ['true', 'false', '1', '0', 'yes', 'no'].includes(text.toLowerCase()) ? null : 'Use true or false.';
    case 'json': try { JSON.parse(text); return null; } catch { return 'That is not valid JSON.'; }
    default: return text.length <= 2000 ? null : 'A string setting is at most 2000 characters.';
  }
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export type IntegrationMode = 'live' | 'sandbox' | 'stubbed' | 'off';
export type IntegrationRow = {
  type: string; label: string; provider: string; country: string; configured: boolean; mode: IntegrationMode;
  env_vars: string[]; blocker: number | null; note: string; last_success_at: string | null; last_error_at: string | null;
};
export type IntegrationsPayload = {
  rows: IntegrationRow[]; live_send: boolean; production: boolean; live_providers_required: boolean; note: string;
};
export const MODE_WORDS: Record<IntegrationMode, string> = { live: 'Live', sandbox: 'Sandbox', stubbed: 'Stubbed', off: 'Off' };
export const modeTone = (m: IntegrationMode): 'good' | 'bad' | 'wait' | 'neutral' =>
  (m === 'live' ? 'good' : m === 'off' ? 'bad' : m === 'stubbed' ? 'wait' : 'neutral');

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export type AuditRow = {
  id: number; created_at: string; actor: { id: number | null; label: string | null; role: string };
  action: string; target_type: string; target_id: string; place: string | null; reason: string;
};
export type AuditDetail = AuditRow & {
  before: Record<string, unknown>; after: Record<string, unknown>; ip: string | null; user_agent: string;
  hash: { previous: string; content: string; hashed: boolean };
};
export type ChainStatus = {
  status: 'ok' | 'broken' | 'empty'; checked: number; problems: { id: number; issue: string }[];
  problem_count?: number; truncated: boolean; first_id: number | null; last_id: number | null; pre_chain_rows: number;
};
export type AuditPage = { count: number; next: string | null; previous: string | null; results: AuditRow[]; chain: ChainStatus | null };

export type AuditFilters = {
  actor: string; action: string; target_type: string; target_id: string; from: string; to: string; city: string;
};
export const emptyAuditFilters = (): AuditFilters => ({ actor: '', action: '', target_type: '', target_id: '', from: '', to: '', city: '' });

/** The query string for the list and the export: only the filters that have a value. */
export function auditQuery(f: AuditFilters, extra: Record<string, string | number> = {}): string {
  const q = new URLSearchParams();
  (Object.keys(f) as (keyof AuditFilters)[]).forEach((k) => {
    const v = f[k].trim();
    if (v) q.set(k, v);
  });
  Object.entries(extra).forEach(([k, v]) => q.set(k, String(v)));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** The changed keys between two JSON objects, for the drawer: `{key, before, after}` rows. */
export function diffRows(before: Record<string, unknown>, after: Record<string, unknown>) {
  const keys = Array.from(new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])).sort();
  const show = (v: unknown) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v));
  return keys.map((k) => {
    const b = (before ?? {})[k];
    const a = (after ?? {})[k];
    return { key: k, before: show(b), after: show(a), changed: JSON.stringify(b) !== JSON.stringify(a) };
  });
}

export const chainWords = (c: ChainStatus | null): string => {
  if (!c) return 'Not checked';
  if (c.status === 'empty') return 'Nothing in this range';
  if (c.status === 'ok') return `Verified ${c.checked} entr${c.checked === 1 ? 'y' : 'ies'}${c.truncated ? ' (the oldest part of a large range was not checked)' : ''}`;
  return `Broken: ${c.problem_count ?? c.problems.length} problem${(c.problem_count ?? c.problems.length) === 1 ? '' : 's'}`;
};
