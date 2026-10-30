import type { AdminAccess } from './adminScope';
import { can } from './adminScope';

/**
 * Safety (console module 6): types and the helpers both pages share.
 *
 * NOTHING HERE ASSUMES A COUNTRY. The timers, thresholds and emergency
 * numbers the pages show are whatever the server sent for the incident's
 * country; a country with no configuration reads "not configured", never a
 * number from somewhere else. There is no default country, no currency and
 * no city in this file.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type IncidentStatus = 'open' | 'investigating' | 'action_taken' | 'closed';

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
};

/** Lower is more urgent; mirrors the server's sort. */
export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Open', investigating: 'Investigating', action_taken: 'Action taken', closed: 'Closed',
};

export const CATEGORY_LABEL: Record<string, string> = {
  assault: 'Assault', harassment: 'Harassment', accident: 'Accident', medical: 'Medical',
  dangerous_driving: 'Dangerous driving', route_deviation: 'Route deviation', long_stop: 'Long stop',
  eta_overrun: 'ETA overrun', lost_contact: 'Lost contact', other: 'Other',
};

export const SOURCE_LABEL: Record<string, string> = {
  sos: 'SOS', support_ticket: 'Support ticket', signal: 'Detected signal', manual: 'Manual',
};

export const OUTCOME_LABEL: Record<string, string> = {
  no_action: 'No action needed', warning: 'Warning issued', driver_suspended: 'Driver suspended',
  rider_blocked: 'Rider blocked', police_referral: 'Referred to police', other: 'Other',
};

export const SIGNAL_LABEL: Record<string, string> = {
  long_stop: 'Long stop', eta_overrun: 'ETA overrun', route_deviation: 'Route deviation',
};

export type Place = { source: string; node: string | null; node_name: string | null };

export type SosSummary = {
  active: number | null;
  unacknowledged: number | null;
  oldest_unacknowledged_at: string | null;
  oldest_active_at: string | null;
  unacknowledged_ids?: number[];
};

export type IncidentRow = {
  id: number;
  title: string;
  category: string;
  severity: Severity;
  status: IncidentStatus;
  source: string;
  country: string | null;
  anchor: Place;
  trip_id: number | null;
  assigned_to: number | null;
  assignee: { id: number; label: string } | null;
  opened_at: string;
  closed_at: string | null;
  outcome: string | null;
  police_referred_at: string | null;
  sos: SosSummary;
  escalated: boolean;
};

export type Timer = {
  configured: boolean;
  sos_ack_minutes: number | null;
  incident_assign_minutes: number | null;
};

export type QueueCounts = {
  open?: number; investigating?: number; action_taken?: number; closed?: number;
  mine?: number; unassigned?: number; unassigned_critical?: number;
  active_sos?: number; unacknowledged_sos?: number; signals?: number;
};

export type IncidentPage = {
  count: number; limit: number; offset: number;
  counts: QueueCounts;
  timers: Record<string, Timer>;
  results: IncidentRow[];
};

export type Signal = {
  id: number;
  kind: string;
  trip_id: number;
  country: string | null;
  anchor: { node: string | null; node_name: string | null };
  measured: Record<string, number | string>;
  threshold_version: number;
  incident_id: number | null;
  created_at: string;
  updated_at: string;
  dismissed_at: string | null;
  dismissed_by: number | null;
  dismiss_reason: string;
};

export type SignalPage = {
  count: number;
  results: Signal[];
  route_deviation: { detected: boolean; reason: string };
};

export type TimelineEntry = {
  id: number; kind: string; actor_id: number | null; actor_label: string;
  from_status: string | null; to_status: string | null; note: string;
  data: Record<string, unknown>; created_at: string;
};

export type LinkedDriver = {
  id: number; driver_name: string; in_scope: boolean; suspended: boolean;
  can_suspend: boolean; page: { type: 'driver'; id: number };
};
export type LinkedRider = {
  id: number; rider_name: string; in_scope: boolean; blocked: boolean;
  can_block: boolean; page: { type: 'rider'; id: number };
};
export type LinkedTrip = {
  id: number; status: string | null; requested_at: string; in_scope: boolean;
  primary: boolean; page: { type: 'trip'; id: number };
};
export type LinkedTicket = {
  id: number; issue_type: string; status: string; in_scope: boolean;
  page: { type: 'ticket'; id: number };
};

export type SosEventRow = {
  id: number; status: 'open' | 'acknowledged' | 'resolved' | 'false_alarm';
  event_type: string; initiated_by: string; user_label: string; user_phone?: string | null;
  created_at: string; escalated_at: string | null; active: boolean;
};

export type EmergencyNumbers = {
  country: string | null;
  configured: boolean;
  numbers: Array<{ label: string; number: string }>;
};

export type IncidentActions = {
  assign: boolean; note: boolean; status: boolean; link: boolean; unlink: boolean;
  refer_police: boolean; close: boolean;
  close_blockers: Array<{ code: string; message: string; sos_ids?: number[] }>;
  suspend_driver: boolean; block_rider: boolean; reveal_sos: boolean; edit_config: boolean;
};

export type IncidentDetail = IncidentRow & {
  closing_summary: string | null;
  police_reference: string | null;
  timeline: TimelineEntry[];
  people: {
    drivers: LinkedDriver[]; riders: LinkedRider[]; trips: LinkedTrip[]; tickets: LinkedTicket[];
  };
  sos_events: SosEventRow[];
  signals: Signal[];
  emergency: EmergencyNumbers;
  actions: IncidentActions;
  vocabulary: { categories: string[]; severities: string[]; statuses: string[]; outcomes: string[] };
};

export type ConfigValues = {
  sos_ack_minutes: number | null; incident_assign_minutes: number | null;
  long_stop_minutes: number | null; long_stop_radius_m: number | null;
  stop_exempt_radius_m: number | null; long_stop_incident_minutes: number | null;
  eta_overrun_percent: number | null; eta_overrun_minutes: number | null;
  eta_overrun_incident_percent: number | null; eta_overrun_incident_minutes: number | null;
  route_deviation_meters: number | null; route_deviation_minutes: number | null;
};

export type ConfigVersion = ConfigValues & {
  id: number; country: string; version: number; is_active: boolean;
  valid_from: string | null; valid_to: string | null; reason: string;
  emergency_numbers: Array<{ label: string; number: string }>;
  created_by: { id: number | null; label: string; email: string; role: string };
};

export type ConfigRow = {
  country: string; name: string; configured: boolean;
  active: ConfigVersion | null;
  registry_numbers: Array<{ label: string; number: string }>;
  history: ConfigVersion[];
  route_deviation: { detected: boolean; reason: string };
};

export type ConfigPage = {
  can_edit: boolean;
  fields: Array<keyof ConfigValues>;
  limits: Record<string, [number, number]>;
  results: ConfigRow[];
};

// ---------------------------------------------------------------------------
// Tabs, filters and the query they become
// ---------------------------------------------------------------------------

export type TabKey = 'sos' | 'incidents' | 'signals' | 'closed';

export const TAB_LABEL: Record<TabKey, string> = {
  sos: 'Active SOS', incidents: 'Incidents', signals: 'Signals', closed: 'Closed',
};

export const TAB_KEYS: TabKey[] = ['sos', 'incidents', 'signals', 'closed'];

export type SafetyFilters = {
  tab: TabKey;
  severity: string;
  category: string;
  assigned: '' | 'me' | 'none';
  country: string;
  q: string;
  scope: string;
};

export const DEFAULT_SAFETY_FILTERS: SafetyFilters = {
  tab: 'sos', severity: '', category: '', assigned: '', country: '', q: '', scope: '',
};

export function safetyFiltersFromSearch(params: URLSearchParams): SafetyFilters {
  const tab = params.get('tab') as TabKey | null;
  const assigned = params.get('assigned');
  return {
    tab: tab && TAB_KEYS.includes(tab) ? tab : 'sos',
    severity: params.get('severity') ?? '',
    category: params.get('category') ?? '',
    assigned: assigned === 'me' || assigned === 'none' ? assigned : '',
    country: (params.get('country') ?? '').toUpperCase(),
    q: params.get('q') ?? '',
    scope: params.get('scope') ?? '',
  };
}

/** The page's own URL query: defaults left out. */
export function safetyFiltersToQuery(f: SafetyFilters): string {
  const p = new URLSearchParams();
  if (f.tab !== 'sos') p.set('tab', f.tab);
  if (f.severity) p.set('severity', f.severity);
  if (f.category) p.set('category', f.category);
  if (f.assigned) p.set('assigned', f.assigned);
  if (f.country) p.set('country', f.country);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.scope) p.set('scope', f.scope);
  return p.toString();
}

export function activeSafetyFilterCount(f: SafetyFilters): number {
  return [f.severity, f.category, f.assigned, f.country, f.q.trim(), f.scope].filter(Boolean).length;
}

const LIVE = 'open,investigating,action_taken';

/** The server query for a tab. SOS-first ordering is the server's default. */
export function incidentsApiPath(f: SafetyFilters): string {
  const p = new URLSearchParams();
  if (f.tab === 'sos') {
    p.set('has_open_sos', 'true');
    p.set('status', LIVE);
  } else if (f.tab === 'incidents') {
    p.set('status', LIVE);
  } else {
    p.set('status', 'closed');
    p.set('sort', 'closed');
  }
  if (f.severity) p.set('severity', f.severity);
  if (f.category) p.set('category', f.category);
  if (f.assigned) p.set('assigned', f.assigned);
  if (f.country) p.set('country', f.country);
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.scope) p.set('scope', f.scope);
  p.set('limit', '100');
  return `/safety/admin/incidents/?${p.toString()}`;
}

export function signalsApiPath(f: SafetyFilters): string {
  const p = new URLSearchParams({ state: 'open' });
  if (f.country) p.set('country', f.country);
  if (f.scope) p.set('scope', f.scope);
  return `/safety/admin/signals/?${p.toString()}`;
}

/** The count that goes on a tab, or undefined while it is unknown. */
export function tabCount(tab: TabKey, c: QueueCounts | undefined): number | undefined {
  if (!c) return undefined;
  switch (tab) {
    case 'sos': return c.active_sos;
    case 'incidents': return (c.open ?? 0) + (c.investigating ?? 0) + (c.action_taken ?? 0);
    case 'signals': return c.signals;
    case 'closed': return c.closed;
    default: return undefined;
  }
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export function minutesBetween(fromIso: string | null | undefined, now: number): number | null {
  if (!fromIso) return null;
  const t = new Date(fromIso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now - t) / 60000));
}

/** "just now", "7 min", "1 h 05 min", "2 d 3 h". */
export function elapsed(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return `${h} h ${String(m).padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export type AckState =
  | { kind: 'none' }
  | { kind: 'no_timer'; since: number }
  | { kind: 'running'; since: number; remaining: number }
  | { kind: 'overdue'; since: number; over: number };

/**
 * Where an unacknowledged SOS stands against its country's timer.
 *
 * `no_timer` is a state, not a default: a country with no `sos_ack_minutes`
 * has no deadline, and the page says "no timer configured" instead of
 * inventing one.
 */
export function ackState(row: Pick<IncidentRow, 'sos' | 'country'>,
  timers: Record<string, Timer> | undefined, now: number): AckState {
  if (!row.sos.unacknowledged || !row.sos.oldest_unacknowledged_at) return { kind: 'none' };
  const since = minutesBetween(row.sos.oldest_unacknowledged_at, now) ?? 0;
  const limit = row.country ? timers?.[row.country]?.sos_ack_minutes ?? null : null;
  if (limit === null || limit <= 0) return { kind: 'no_timer', since };
  return since >= limit ? { kind: 'overdue', since, over: since - limit }
    : { kind: 'running', since, remaining: limit - since };
}

export function ackText(state: AckState, country: string | null): string {
  switch (state.kind) {
    case 'none': return 'Acknowledged';
    case 'no_timer': return `Unacknowledged ${elapsed(state.since)} · no timer configured${country ? ` for ${country}` : ''}`;
    case 'running': return `Unacknowledged ${elapsed(state.since)} · ${elapsed(state.remaining)} left`;
    case 'overdue': return `Unacknowledged ${elapsed(state.since)} · ${elapsed(state.over)} over the limit`;
  }
}

// ---------------------------------------------------------------------------
// Emergency numbers
// ---------------------------------------------------------------------------

/** "unified 112 · police 100", or the words "not configured". */
export function emergencyLine(e: EmergencyNumbers | undefined): string {
  if (!e || !e.configured || e.numbers.length === 0) {
    return e?.country ? `Not configured for ${e.country}` : 'Not configured: the incident has no country';
  }
  return e.numbers.map((n) => `${n.label} ${n.number}`).join(' · ');
}

// ---------------------------------------------------------------------------
// Permissions the pages ask
// ---------------------------------------------------------------------------

export const canRespond = (a: AdminAccess | null) => can(a, 'safety.respond');
export const canEditSafetyConfig = (a: AdminAccess | null) => can(a, 'safety.config');

// ---------------------------------------------------------------------------
// Config display
// ---------------------------------------------------------------------------

export const CONFIG_FIELDS: Array<{
  key: keyof ConfigValues; label: string; unit: string; hint: string;
}> = [
  { key: 'sos_ack_minutes', label: 'SOS acknowledge within', unit: 'min', hint: 'An SOS still open after this raises an alert and repeats the push.' },
  { key: 'incident_assign_minutes', label: 'Critical incident assigned within', unit: 'min', hint: 'A critical incident with no owner after this escalates.' },
  { key: 'long_stop_minutes', label: 'Long stop after', unit: 'min', hint: 'Driver has not left the circle for this long on a live trip.' },
  { key: 'long_stop_radius_m', label: 'Long stop circle', unit: 'm', hint: '“Has not moved” means within this distance.' },
  { key: 'stop_exempt_radius_m', label: 'Ignore stops within', unit: 'm of pickup or drop', hint: 'A stop this close to the pickup or the drop is normal.' },
  { key: 'long_stop_incident_minutes', label: 'Long stop opens an incident at', unit: 'min', hint: 'Below this the signal waits in the review queue.' },
  { key: 'eta_overrun_percent', label: 'ETA overrun over', unit: '%', hint: 'Trip running this far past its estimate…' },
  { key: 'eta_overrun_minutes', label: '…and by at least', unit: 'min', hint: 'Both lines must be crossed.' },
  { key: 'eta_overrun_incident_percent', label: 'Overrun opens an incident at', unit: '%', hint: 'With the minutes line below.' },
  { key: 'eta_overrun_incident_minutes', label: '…and at least', unit: 'min', hint: '' },
  { key: 'route_deviation_meters', label: 'Route deviation distance', unit: 'm', hint: 'Not measured yet: no planned route is stored per trip.' },
  { key: 'route_deviation_minutes', label: 'Route deviation time', unit: 'min', hint: 'Not measured yet.' },
];

/** What a config value reads as: the number, or "off" for a blank. */
export function configValue(v: number | null | undefined, unit: string): string {
  return v === null || v === undefined ? 'Off' : `${v} ${unit}`;
}

/**
 * A draft field -> the value to send. '' means "turn it off" (null);
 * anything else must be a whole number or the field is reported.
 */
export function parseConfigDraft(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (t === '') return { ok: true, value: null };
  if (!/^\d+$/.test(t)) return { ok: false };
  return { ok: true, value: Number(t) };
}

/** Only the fields that changed, so an edit never rewrites what it did not touch. */
export function configPatch(
  draft: Record<string, string>, current: Partial<ConfigValues> | null | undefined,
): { patch: Record<string, number | null>; invalid: string[] } {
  const patch: Record<string, number | null> = {};
  const invalid: string[] = [];
  for (const { key } of CONFIG_FIELDS) {
    if (!(key in draft)) continue;
    const parsed = parseConfigDraft(draft[key]);
    if (!parsed.ok) { invalid.push(key); continue; }
    if (parsed.value !== (current?.[key] ?? null)) patch[key] = parsed.value;
  }
  return { patch, invalid };
}

export function signalSummary(s: Signal): string {
  const m = s.measured;
  if (s.kind === 'long_stop') return `Stopped ${m.stopped_minutes} min within ${m.radius_m} m`;
  if (s.kind === 'eta_overrun') return `${m.over_minutes} min (${m.over_percent}%) over a ${m.estimated_minutes} min estimate`;
  return Object.entries(m).map(([k, v]) => `${k}: ${v}`).join(', ');
}
