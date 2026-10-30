/**
 * The Support module's client logic, kept out of the pages so it can be
 * tested.
 *
 *   * the queue tabs and filters <-> the URL <-> the server's query string;
 *   * the SLA chip: how a clock is worded and which tone it carries;
 *   * which controls to draw on a ticket for this operator (the server's
 *     per-ticket `allowed_actions` wins);
 *   * the macro picker's search.
 *
 * `lib/support.ts` is the PUBLIC site's contact address; this file is the
 * console's.
 *
 * THE STATUS VALUES ARE UPPERCASE (`OPEN`, `IN_PROGRESS`, `WAITING_USER`,
 * `CLOSED`), as the model stores them. `open` (lowercase) is the server's
 * word for "every state but closed".
 */
import type { AdminAccess } from './adminScope';
import { can } from './adminScope';

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In progress', WAITING_USER: 'Waiting on them', CLOSED: 'Closed',
};

export const PRIORITIES = ['urgent', 'high', 'normal', 'low'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low',
};

/** Urgent is red and high is gold; the word always carries it. */
export function priorityTone(priority: string): 'good' | 'bad' | 'wait' | 'neutral' {
  if (priority === 'urgent') return 'bad';
  if (priority === 'high') return 'wait';
  return 'neutral';
}

export const ISSUE_LABEL: Record<string, string> = {
  payment: 'Payment issue', fare_dispute: 'Fare dispute', driver_behaviour: 'Driver behaviour',
  rider_behaviour: 'Rider behaviour', lost_item: 'Lost item', safety: 'Safety concern',
  account: 'Account / KYC', app_bug: 'App bug', other: 'Other',
};

export const LOCALE_LABEL: Record<string, string> = { en: 'English', hi: 'Hindi', te: 'Telugu' };

// ---------------------------------------------------------------------------
// SLA
// ---------------------------------------------------------------------------

export type SlaClock = {
  due_at: string | null;
  done_at: string | null;
  breached: boolean;
  minutes_remaining: number | null;
};

export type Sla = {
  state: 'ok' | 'due_soon' | 'breached' | 'closed';
  next: 'first_response' | 'resolution' | null;
  minutes_remaining: number | null;
  breached: boolean;
  first_response: SlaClock;
  resolution: SlaClock;
};

/** 45 -> "45m", 130 -> "2h 10m", 3000 -> "2d 2h". Never negative. */
export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(Math.abs(total)));
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(minutes / (60 * 24));
  const h = Math.floor((minutes % (60 * 24)) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}

const NEXT_LABEL: Record<string, string> = { first_response: 'first reply', resolution: 'resolution' };

/**
 * The chip beside a ticket: the next deadline in words. Red (`bad`) only
 * when a deadline has passed; gold (`wait`) inside the last hour. The
 * words carry it, so colour is never the only signal.
 */
export function slaChip(sla: Sla | null | undefined): { label: string; tone: 'good' | 'bad' | 'wait' | 'neutral' } {
  if (!sla) return { label: 'No clock', tone: 'neutral' };
  if (sla.state === 'closed') return { label: 'Closed', tone: 'neutral' };
  if (sla.minutes_remaining === null) return { label: 'No clock', tone: 'neutral' };
  if (sla.state === 'breached') {
    return { label: `Breached ${formatMinutes(sla.minutes_remaining)} ago`, tone: 'bad' };
  }
  return {
    label: `${formatMinutes(sla.minutes_remaining)} left`,
    tone: sla.state === 'due_soon' ? 'wait' : 'good',
  };
}

/** A longer sentence for the ticket page: which clock, and where it stands. */
export function slaSentence(sla: Sla | null | undefined): string {
  if (!sla) return 'No clock is running.';
  if (sla.state === 'closed') return 'Closed. The clock has stopped.';
  if (sla.next === null || sla.minutes_remaining === null) return 'No clock is running.';
  const what = NEXT_LABEL[sla.next] ?? sla.next;
  return sla.state === 'breached'
    ? `The ${what} deadline passed ${formatMinutes(sla.minutes_remaining)} ago.`
    : `${formatMinutes(sla.minutes_remaining)} until the ${what} deadline.`;
}

/** "4h" / "1d" for the policy table. */
export function policyMinutes(minutes: number): string {
  return formatMinutes(minutes);
}

// ---------------------------------------------------------------------------
// Queue tabs and filters
// ---------------------------------------------------------------------------

export type QueueKey = 'mine' | 'unassigned' | 'breaching' | 'open' | 'closed';

export const QUEUE_TABS: ReadonlyArray<{ key: QueueKey; label: string }> = [
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'breaching', label: 'Breaching' },
  { key: 'open', label: 'All open' },
  { key: 'closed', label: 'Closed' },
];

/** What a tab means to the server. */
export const QUEUE_QUERY: Record<QueueKey, Record<string, string>> = {
  mine: { assigned: 'me', status: 'open' },
  unassigned: { assigned: 'none', status: 'open' },
  breaching: { breach: 'breached' },
  open: { status: 'open' },
  closed: { status: 'CLOSED' },
};

export type QueueCounts = Partial<Record<QueueKey, number>>;

export type SupportFilters = {
  queue: QueueKey;
  scope: string;
  priority: string;
  issueType: string;
  dueSoon: boolean;
  country: string;
  q: string;
  dateFrom: string;
  dateTo: string;
  ordering: string;
  page: number;
  pageSize: number;
};

export const DEFAULT_SUPPORT_FILTERS: SupportFilters = {
  queue: 'open', scope: '', priority: '', issueType: '', dueSoon: false, country: '',
  q: '', dateFrom: '', dateTo: '', ordering: '-created', page: 1, pageSize: 50,
};

export const SUPPORT_SORT_OPTIONS = [
  ['-created', 'Newest first'],
  ['created', 'Oldest first'],
  ['resolution_due', 'Resolution due soonest'],
  ['priority', 'Most urgent first'],
  ['-updated', 'Recently updated'],
] as const;

export const SUPPORT_PAGE_SIZES = [25, 50, 100] as const;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Filters from the page URL. Anything malformed is dropped, not guessed. */
export function supportFiltersFromSearch(params: URLSearchParams): SupportFilters {
  const queues = new Set<string>(QUEUE_TABS.map((t) => t.key));
  const sorts = new Set<string>(SUPPORT_SORT_OPTIONS.map(([v]) => v));
  const date = (v: string | null) => (v && DATE.test(v) ? v : '');
  const page = Number(params.get('page'));
  const size = Number(params.get('page_size'));
  const queue = params.get('queue') ?? '';
  const priority = params.get('priority') ?? '';
  const issue = params.get('issue_type') ?? '';
  const country = (params.get('country') ?? '').toUpperCase();
  return {
    queue: (queues.has(queue) ? queue : DEFAULT_SUPPORT_FILTERS.queue) as QueueKey,
    scope: params.get('scope') ?? '',
    priority: (PRIORITIES as readonly string[]).includes(priority) ? priority : '',
    issueType: issue in ISSUE_LABEL ? issue : '',
    dueSoon: params.get('due_soon') === 'true',
    country: /^[A-Z]{2}$/.test(country) ? country : '',
    q: (params.get('q') ?? '').trim().slice(0, 40),
    dateFrom: date(params.get('date_from')),
    dateTo: date(params.get('date_to')),
    ordering: sorts.has(params.get('ordering') ?? '') ? (params.get('ordering') as string) : DEFAULT_SUPPORT_FILTERS.ordering,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (SUPPORT_PAGE_SIZES as readonly number[]).includes(size) ? size : DEFAULT_SUPPORT_FILTERS.pageSize,
  };
}

/** The page URL's query. Defaults are left out so a shared link stays short. */
export function supportFiltersToQuery(f: SupportFilters): string {
  const q = new URLSearchParams();
  if (f.queue !== DEFAULT_SUPPORT_FILTERS.queue) q.set('queue', f.queue);
  if (f.scope) q.set('scope', f.scope);
  if (f.priority) q.set('priority', f.priority);
  if (f.issueType) q.set('issue_type', f.issueType);
  if (f.dueSoon) q.set('due_soon', 'true');
  if (f.country) q.set('country', f.country);
  if (f.q.trim()) q.set('q', f.q.trim());
  if (f.dateFrom) q.set('date_from', f.dateFrom);
  if (f.dateTo) q.set('date_to', f.dateTo);
  if (f.ordering !== DEFAULT_SUPPORT_FILTERS.ordering) q.set('ordering', f.ordering);
  if (f.page > 1) q.set('page', String(f.page));
  if (f.pageSize !== DEFAULT_SUPPORT_FILTERS.pageSize) q.set('page_size', String(f.pageSize));
  return q.toString();
}

/**
 * The list API path. The tab becomes the server's own filters; "due within
 * the hour" is the server's `breach=due_soon` and replaces a breaching tab's
 * `breached` (the two are different questions).
 */
export function supportApiPath(f: SupportFilters): string {
  const q = new URLSearchParams();
  const tab = { ...QUEUE_QUERY[f.queue] };
  if (f.dueSoon && f.queue !== 'breaching') tab.breach = 'due_soon';
  Object.entries(tab).forEach(([k, v]) => q.set(k, v));
  if (f.scope) q.set('scope', f.scope);
  if (f.priority) q.set('priority', f.priority);
  if (f.issueType) q.set('issue_type', f.issueType);
  if (f.country) q.set('country', f.country);
  if (f.q.trim()) q.set('q', f.q.trim());
  if (f.dateFrom) q.set('date_from', f.dateFrom);
  if (f.dateTo) q.set('date_to', f.dateTo);
  q.set('ordering', f.ordering);
  if (f.page > 1) q.set('page', String(f.page));
  q.set('page_size', String(f.pageSize));
  return `/support/admin/tickets/?${q.toString()}`;
}

/** How many filters narrow the list (the tab, sort and paging are not filters). */
export function activeSupportFilterCount(f: SupportFilters): number {
  return [
    Boolean(f.scope), Boolean(f.priority), Boolean(f.issueType), f.dueSoon, Boolean(f.country),
    Boolean(f.q.trim()), Boolean(f.dateFrom || f.dateTo),
  ].filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** What the server says this operator may do on this ticket. */
export type SupportActions = {
  reply: boolean;
  note: boolean;
  status: boolean;
  priority: boolean;
  category: boolean;
  assign: boolean;
  macros: boolean;
  reveal: boolean;
  refund: boolean;
  statuses?: string[];
  priorities?: string[];
  issue_types?: Record<string, string>;
};

export type SupportActionKey = 'reply' | 'note' | 'status' | 'priority' | 'category' | 'assign' | 'refund';

const PERMISSION: Record<SupportActionKey, string> = {
  reply: 'support.reply', note: 'support.reply', status: 'support.reply',
  priority: 'support.reply', category: 'support.reply', assign: 'support.reply',
  refund: 'support.refund',
};

/**
 * The controls to draw, in page order. The server's per-ticket answer wins;
 * without one (an older backend) fall back to what the operator holds
 * anywhere, which only ever shows a control the server may then refuse.
 */
export function visibleSupportActions(
  actions: SupportActions | null | undefined,
  access: AdminAccess | null,
): SupportActionKey[] {
  const order: SupportActionKey[] = ['reply', 'note', 'status', 'priority', 'category', 'assign', 'refund'];
  return order.filter((k) => (actions ? Boolean(actions[k]) : can(access, PERMISSION[k])));
}

/** The composer's toggle: which of Reply and Internal note are on offer. */
export function composerModes(visible: SupportActionKey[]): Array<'reply' | 'note'> {
  return (['reply', 'note'] as const).filter((m) => visible.includes(m));
}

/** May this operator manage macros (the page and its write buttons)? */
export function canManageMacros(access: AdminAccess | null): boolean {
  return Boolean(access) && can(access, 'support.macro');
}

/** May this operator edit the SLA policy? */
export function canEditSla(access: AdminAccess | null): boolean {
  return Boolean(access) && can(access, 'support.sla');
}

// ---------------------------------------------------------------------------
// Thread and macros
// ---------------------------------------------------------------------------

export type MessageKind = 'user' | 'support' | 'system' | 'internal';

export function messageKind(role: string): MessageKind {
  return role === 'support' || role === 'system' || role === 'internal' ? role : 'user';
}

export type MacroSummary = {
  id: number;
  title: string;
  body: string;
  locale: string;
  country: string | null;
  issue_types: string[];
  active: boolean;
};

/** The picker's search: title or body, every word, any case. */
export function filterMacros<T extends Pick<MacroSummary, 'title' | 'body'>>(macros: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return macros;
  return macros.filter((m) => {
    const hay = `${m.title} ${m.body}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** The placeholders the server fills in, as the editor shows them. */
export const MACRO_PLACEHOLDERS = ['{first_name}', '{ticket_id}', '{trip_id}'] as const;

/** Placeholders in `body` that the server will refuse (before it does). */
export function unknownPlaceholders(body: string): string[] {
  const found = body.match(/\{[^{}]*\}/g) ?? [];
  return [...new Set(found.filter((p) => !(MACRO_PLACEHOLDERS as readonly string[]).includes(p)))];
}
