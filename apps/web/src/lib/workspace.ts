/**
 * The workspace API (owner, 2026-11-03): places, Needs action, a place's pulse.
 * Shapes mirror `servers/command_centre/workspace.py`.
 */

export type Severity = 'critical' | 'high' | 'waiting';
export type Health = 'critical' | 'watch' | 'normal' | 'quiet';

export type NeedsItem = {
  kind: 'sos' | 'stuck_trip' | 'approval' | 'payout_failed' | 'kyc' | 'alert' | string;
  severity: Severity;
  title: string;
  detail: string;
  ref: string | null;
  where: { code: string; name: string } | null;
  age_seconds: number;
  count: number;
  link: string;
  owner: { id: number; label: string | null } | null;
  time_left_seconds: number | null;
  actions: string[];
  viewers?: string[];
};

export type NeedsResponse = {
  generated_at: string;
  total: number;
  counts: Partial<Record<Severity, number>>;
  items: NeedsItem[];
};

export type Figures = {
  requests: number;
  completed: number;
  unfulfilled: number;
  unfulfilled_rate: number | null;
  fulfilment_rate: number | null;
  acceptance_rate: number | null;
  eta_minutes: number | null;
  eta_samples: number;
  sos_raised: number;
  tickets_raised: number;
  /** Only for callers who may see money. Integer minor units per currency. */
  collected_minor?: Record<string, number>;
  rates_reliable: boolean;
};

export type LiveCounts = {
  drivers_online: number;
  sos_active: number;
  sos_unacknowledged: number;
  alerts_critical: number;
  alerts_warning: number;
  kyc_waiting: number;
  stuck_trips: number;
};

export type PlaceRow = Figures & LiveCounts & {
  code: string;
  name: string;
  kind: string | null;
  status: string | null;
  live_cities: number;
  cities: number;
  last_week: { requests: number; unfulfilled_rate: number | null };
  health: Health;
  health_reason: string;
  worst_city: { code: string; name: string; health: Health; reason: string } | null;
};

export type CitySquare = {
  code: string; name: string; status: string; timezone: string; currency: string;
  health: Health; health_reason: string; country: string | null;
};

export type PlacesResponse = {
  node: { code: string; name: string; kind: string } | null;
  breadcrumb: { code: string; name: string; kind: string }[];
  window: string;
  generated_at: string;
  totals: Figures & LiveCounts & { cities: number; live_cities: number; paused_cities: number };
  health_counts: Partial<Record<Health, number>>;
  children: PlaceRow[];
  quiet: PlaceRow[];
  cities: CitySquare[];
};

export type Band = { low: number; high: number; weeks: number } | null;

export type PulseResponse = {
  scope: string | null;
  window_hours: number;
  timezone: string | null;
  now: Figures;
  usual: { requests: Band; fulfilment_rate: Band; eta_minutes: Band };
  hourly: { hour: string; requests: number; completed: number }[];
};

export const SEVERITY_WORD: Record<Severity, string> = {
  critical: 'Critical', high: 'High', waiting: 'Waiting',
};

export const HEALTH_WORD: Record<Health, string> = {
  critical: 'Critical', watch: 'Watch', normal: 'Normal', quiet: 'Quiet',
};

/** "2 min", "3 h", "1 d": how long something has waited. */
export function waited(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** Where a value sits against its usual range, in words, or null without one. */
export function againstUsual(value: number | null, band: Band, unit = ''): string | null {
  if (value === null || !band) return null;
  const range = `${band.low}${unit}–${band.high}${unit}`;
  if (value < band.low) return `Below usual ${range}`;
  if (value > band.high) return `Above usual ${range}`;
  return `Within usual ${range}`;
}
