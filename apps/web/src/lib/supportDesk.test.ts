import { describe, expect, it } from 'vitest';
import type { AdminAccess } from './adminScope';
import {
  canRestore, canViewDashboard, configSentence, dashboardPath, dashboardRangeError, formatMedian,
  formatPct, inboxBadge, inboxLabel, pendingFor, pendingSummary, versionLine,
  DEFAULT_SUPPORT_FILTERS, type Sla, type SupportActions, activeSupportFilterCount, canEditSla,
  canManageMacros, composerModes, filterMacros, formatMinutes, messageKind, priorityTone,
  slaChip, slaSentence, supportApiPath, supportFiltersFromSearch, supportFiltersToQuery,
  unknownPlaceholders, visibleSupportActions,
} from './supportDesk';

const access = (permissions: string[]): AdminAccess => ({
  id: 1, email: 'op@example.test', full_name: 'Op', is_superuser: false, is_break_glass: false,
  permissions, roles: [], scopes: [], access_model: 'scoped',
} as unknown as AdminAccess);

const clock = { due_at: null, done_at: null, breached: false, minutes_remaining: null };
const sla = (patch: Partial<Sla>): Sla => ({
  state: 'ok', next: 'first_response', minutes_remaining: 120, breached: false,
  first_response: clock, resolution: clock, ...patch,
});

const server = (patch: Partial<SupportActions>): SupportActions => ({
  reply: false, note: false, status: false, priority: false, category: false, assign: false,
  macros: false, reveal: false, refund: false, ...patch,
});

describe('SLA formatting', () => {
  it('words minutes the way an operator reads a clock', () => {
    expect(formatMinutes(0)).toBe('0m');
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(60)).toBe('1h');
    expect(formatMinutes(130)).toBe('2h 10m');
    expect(formatMinutes(1440)).toBe('1d');
    expect(formatMinutes(2880 + 120)).toBe('2d 2h');
    expect(formatMinutes(-35)).toBe('35m');
  });

  it('is red only once a deadline has passed, and says so in words', () => {
    expect(slaChip(sla({ state: 'ok', minutes_remaining: 190 }))).toEqual({ label: '3h 10m left', tone: 'good' });
    expect(slaChip(sla({ state: 'due_soon', minutes_remaining: 25 }))).toEqual({ label: '25m left', tone: 'wait' });
    expect(slaChip(sla({ state: 'breached', breached: true, minutes_remaining: -35 })))
      .toEqual({ label: 'Breached 35m ago', tone: 'bad' });
  });

  it('is quiet for a closed ticket and honest about a missing clock', () => {
    expect(slaChip(sla({ state: 'closed', next: null, minutes_remaining: null })).label).toBe('Closed');
    expect(slaChip(sla({ next: null, minutes_remaining: null })).label).toBe('No clock');
    expect(slaChip(null).label).toBe('No clock');
  });

  it('names the clock that matters on the ticket page', () => {
    expect(slaSentence(sla({ minutes_remaining: 90 }))).toBe('1h 30m until the first reply deadline.');
    expect(slaSentence(sla({ state: 'breached', next: 'resolution', minutes_remaining: -75 })))
      .toBe('The resolution deadline passed 1h 15m ago.');
    expect(slaSentence(sla({ state: 'closed', next: null, minutes_remaining: null })))
      .toBe('Closed. The clock has stopped.');
  });

  it('marks urgent red and high gold', () => {
    expect(priorityTone('urgent')).toBe('bad');
    expect(priorityTone('high')).toBe('wait');
    expect(priorityTone('normal')).toBe('neutral');
  });
});

describe('queue tabs and filters <-> query string', () => {
  it('maps each tab to the server filters it means', () => {
    const path = (queue: 'mine' | 'unassigned' | 'breaching' | 'open' | 'closed') =>
      Object.fromEntries(new URLSearchParams(supportApiPath({ ...DEFAULT_SUPPORT_FILTERS, queue }).split('?')[1]));
    expect(path('mine')).toMatchObject({ assigned: 'me', status: 'open' });
    expect(path('unassigned')).toMatchObject({ assigned: 'none', status: 'open' });
    expect(path('breaching')).toMatchObject({ breach: 'breached' });
    expect(path('open')).toMatchObject({ status: 'open' });
    expect(path('closed')).toMatchObject({ status: 'CLOSED' });
  });

  it('sends every filter under the name the server reads', () => {
    const path = supportApiPath({
      ...DEFAULT_SUPPORT_FILTERS, queue: 'open', scope: 'IN-TG-HYD', priority: 'urgent',
      issueType: 'safety', dueSoon: true, country: 'IN', q: ' 3210 ', dateFrom: '2026-10-01',
      dateTo: '2026-10-30', ordering: 'resolution_due', page: 2, pageSize: 25,
    });
    expect(path.startsWith('/support/admin/tickets/?')).toBe(true);
    expect(Object.fromEntries(new URLSearchParams(path.split('?')[1]))).toEqual({
      status: 'open', breach: 'due_soon', scope: 'IN-TG-HYD', priority: 'urgent',
      issue_type: 'safety', country: 'IN', q: '3210', date_from: '2026-10-01',
      date_to: '2026-10-30', ordering: 'resolution_due', page: '2', page_size: '25',
    });
  });

  it('always sends a page size and a sort', () => {
    expect(supportApiPath(DEFAULT_SUPPORT_FILTERS)).toBe(
      '/support/admin/tickets/?status=open&ordering=-created&page_size=50');
  });

  it('leaves defaults out of the page URL', () => {
    expect(supportFiltersToQuery(DEFAULT_SUPPORT_FILTERS)).toBe('');
    expect(activeSupportFilterCount(DEFAULT_SUPPORT_FILTERS)).toBe(0);
  });

  it('round-trips through the URL and drops what is malformed', () => {
    const f = supportFiltersFromSearch(new URLSearchParams(
      'queue=breaching&priority=urgent&issue_type=nonsense&country=in&date_from=2026/10/01'
      + '&date_to=2026-10-28&ordering=name&page=-3&page_size=7&due_soon=yes&q=%20%203210'));
    expect(f).toEqual({
      ...DEFAULT_SUPPORT_FILTERS, queue: 'breaching', priority: 'urgent', country: 'IN',
      dateTo: '2026-10-28', q: '3210',
    });
    expect(supportFiltersFromSearch(new URLSearchParams(supportFiltersToQuery(f)))).toEqual(f);
    expect(activeSupportFilterCount(f)).toBe(4);
  });

  it('does not let a breaching tab and the due-soon box contradict each other', () => {
    const q = new URLSearchParams(supportApiPath({ ...DEFAULT_SUPPORT_FILTERS, queue: 'breaching', dueSoon: true }).split('?')[1]);
    expect(q.get('breach')).toBe('breached');
  });
});

describe('action visibility', () => {
  it('follows the server answer, ticket by ticket', () => {
    expect(visibleSupportActions(server({ reply: true, note: true, status: true, assign: true }), access([])))
      .toEqual(['reply', 'note', 'status', 'assign']);
    expect(visibleSupportActions(server({}), access(['support.reply', 'support.refund']))).toEqual([]);
    expect(visibleSupportActions(server({ refund: true }), access([]))).toEqual(['refund']);
  });

  it('falls back to what the operator holds when the server sends nothing', () => {
    expect(visibleSupportActions(null, access(['support.read']))).toEqual([]);
    expect(visibleSupportActions(undefined, access(['support.reply']))).toEqual(
      ['reply', 'note', 'status', 'priority', 'category', 'assign']);
    expect(visibleSupportActions(null, access(['support.reply', 'support.refund']))).toContain('refund');
  });

  it('offers the composer only the modes the operator may use', () => {
    expect(composerModes(['reply', 'note', 'status'])).toEqual(['reply', 'note']);
    expect(composerModes(['note'])).toEqual(['note']);
    expect(composerModes([])).toEqual([]);
  });

  it('keeps macro and SLA editing to their own capabilities', () => {
    expect(canManageMacros(access(['support.reply']))).toBe(false);
    expect(canManageMacros(access(['support.macro']))).toBe(true);
    expect(canEditSla(access(['support.macro']))).toBe(false);
    expect(canEditSla(access(['support.sla']))).toBe(true);
    expect(canManageMacros(null)).toBe(false);
  });
});

describe('thread and macros', () => {
  it('tells an internal note from a reply', () => {
    expect(messageKind('internal')).toBe('internal');
    expect(messageKind('support')).toBe('support');
    expect(messageKind('system')).toBe('system');
    expect(messageKind('user')).toBe('user');
    expect(messageKind('anything else')).toBe('user');
  });

  it('searches macros by every word, in title or body', () => {
    const macros = [
      { title: 'Refund issued', body: 'Hi {first_name}, we refunded your fare.' },
      { title: 'Lost item', body: 'We are asking the driver about your bag.' },
    ];
    expect(filterMacros(macros, '')).toHaveLength(2);
    expect(filterMacros(macros, 'REFUND').map((m) => m.title)).toEqual(['Refund issued']);
    expect(filterMacros(macros, 'driver bag').map((m) => m.title)).toEqual(['Lost item']);
    expect(filterMacros(macros, 'driver refund')).toEqual([]);
  });

  it('spots a placeholder the server would refuse', () => {
    expect(unknownPlaceholders('Hi {first_name}, #{ticket_id} about {trip_id}')).toEqual([]);
    expect(unknownPlaceholders('Hi {name} and {name} and {first_name}')).toEqual(['{name}']);
  });
});

describe('a paused clock (waiting on the user)', () => {
  it('reads Paused, never breached, and says why', () => {
    const paused = sla({ state: 'paused', breached: false, paused: true, minutes_remaining: 90 });
    expect(slaChip(paused)).toEqual({ label: 'Paused', tone: 'neutral' });
    expect(slaSentence(paused)).toMatch(/waiting on the user/i);
    expect(slaSentence(paused)).toMatch(/paused/i);
  });

  it('still reports a late first reply while paused', () => {
    const late = sla({ state: 'breached', breached: true, paused: true, minutes_remaining: -20 });
    expect(slaChip(late)).toEqual({ label: 'Breached 20m ago', tone: 'bad' });
  });
});

describe('the Returned to you tab', () => {
  it('asks the server for the tickets sent back to me', () => {
    const f = supportFiltersFromSearch(new URLSearchParams('queue=returned'));
    expect(f.queue).toBe('returned');
    expect(supportApiPath(f)).toContain('returned=me');
    expect(supportFiltersToQuery(f)).toBe('queue=returned');
  });
});

describe('the header inbox', () => {
  it('shows nothing for zero or unknown, and caps the badge', () => {
    expect(inboxBadge(0)).toBeNull();
    expect(inboxBadge(undefined)).toBeNull();
    expect(inboxBadge(3)).toBe('3');
    expect(inboxBadge(250)).toBe('99+');
    expect(inboxLabel(0)).toBe('Inbox');
    expect(inboxLabel(2)).toBe('Inbox, 2 unread');
  });
});

describe('macro history', () => {
  it('names a restore and offers it for every version but the current one', () => {
    expect(versionLine({ version: 2, restored_from: null })).toBe('Version 2');
    expect(versionLine({ version: 3, restored_from: 1 })).toBe('Version 3 · restored from version 1');
    expect(canRestore({ version: 2 }, 3)).toBe(true);
    expect(canRestore({ version: 3 }, 3)).toBe(false);
  });
});

describe('the SLA dashboard helpers', () => {
  it('shows a dash, not a zero, when nothing was due', () => {
    expect(formatPct(null)).toBe('—');
    expect(formatPct(66.666)).toBe('66.7%');
    expect(formatPct(0)).toBe('0.0%');
    expect(formatMedian(null)).toBe('—');
    expect(formatMedian(155)).toBe('2h 35m');
  });

  it('builds the query and refuses a bad range before the server does', () => {
    expect(dashboardPath('', '')).toBe('/support/admin/sla/dashboard/');
    expect(dashboardPath('2026-10-01', '2026-10-07', 'IN-TG-HYD'))
      .toBe('/support/admin/sla/dashboard/?date_from=2026-10-01&date_to=2026-10-07&scope=IN-TG-HYD');
    expect(dashboardRangeError('', '')).toBeNull();
    expect(dashboardRangeError('2026-10-01', '')).toBe('Pick both dates.');
    expect(dashboardRangeError('2026-10-08', '2026-10-01')).toMatch(/after/);
    expect(dashboardRangeError('2026-01-01', '2026-12-31')).toMatch(/92/);
    expect(dashboardRangeError('2026-10-01', '2026-10-07')).toBeNull();
  });

  it('is for operators who hold support.dashboard', () => {
    expect(canViewDashboard(access(['support.dashboard']))).toBe(true);
    expect(canViewDashboard(access(['support.read']))).toBe(false);
  });
});

describe('SLA change requests', () => {
  const policy = {
    id: 7, country: 'IN', kind: 'sla_policy' as const, priority: 'normal',
    first_response_minutes: 120, resolution_minutes: 600,
  };
  const cfg = {
    id: 8, country: 'IN', kind: 'country_config' as const, waiting_reminder_days: 3,
    waiting_autoclose_days: 10, refund_review_hours: 96,
  };

  it('says what a pending request asks for', () => {
    expect(pendingSummary(policy)).toBe('Normal: first reply within 2h, resolved within 10h');
    expect(pendingSummary(cfg)).toContain('auto-close after 10 days');
  });

  it('finds the request waiting for a row', () => {
    expect(pendingFor([policy, cfg], 'IN', 'normal')?.id).toBe(7);
    expect(pendingFor([policy, cfg], 'IN', null)?.id).toBe(8);
    expect(pendingFor([policy, cfg], 'US', 'normal')).toBeNull();
    expect(pendingFor([policy], 'IN', 'high')).toBeNull();
  });

  it('says plainly when a country is not configured', () => {
    const none = { country: 'US', configured: false, waiting_reminder_days: null, waiting_autoclose_days: null, refund_review_hours: null, version: 0 };
    expect(configSentence(none)).toMatch(/^Not configured/);
    expect(configSentence({ ...none, configured: true, waiting_reminder_days: 2, waiting_autoclose_days: 7, refund_review_hours: 72, version: 1 }))
      .toBe('Reminder after 2 days, auto-close after 7 days, refund review 72 hours.');
  });
});
