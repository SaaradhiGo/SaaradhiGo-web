import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAFETY_FILTERS, ackState, ackText, activeSafetyFilterCount, configPatch, configValue,
  elapsed, emergencyLine, incidentsApiPath, minutesBetween, parseConfigDraft,
  safetyFiltersFromSearch, safetyFiltersToQuery, signalSummary, signalsApiPath, tabCount,
  type IncidentRow, type Signal, type Timer,
} from './safety';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * 60000).toISOString();

const row = (patch: Partial<IncidentRow['sos']> = {}, country: string | null = 'IN'): Pick<IncidentRow, 'sos' | 'country'> => ({
  country,
  sos: {
    active: 1, unacknowledged: 1, oldest_unacknowledged_at: ago(3), oldest_active_at: ago(3), ...patch,
  },
});

const timers = (ackMinutes: number | null): Record<string, Timer> => ({
  IN: { configured: ackMinutes !== null, sos_ack_minutes: ackMinutes, incident_assign_minutes: 5 },
});

describe('the filters <-> query string', () => {
  it('leaves defaults out, so "no filter" is the empty string', () => {
    expect(safetyFiltersToQuery(DEFAULT_SAFETY_FILTERS)).toBe('');
    expect(activeSafetyFilterCount(DEFAULT_SAFETY_FILTERS)).toBe(0);
  });

  it('round-trips and drops what is malformed', () => {
    const f = {
      tab: 'incidents' as const, severity: 'critical', category: 'medical', assigned: 'me' as const,
      country: 'US', q: ' 42 ', scope: 'US-TX-AUS',
    };
    const q = safetyFiltersToQuery(f);
    expect(Object.fromEntries(new URLSearchParams(q))).toEqual({
      tab: 'incidents', severity: 'critical', category: 'medical', assigned: 'me', country: 'US', q: '42', scope: 'US-TX-AUS',
    });
    expect(safetyFiltersFromSearch(new URLSearchParams(q))).toEqual({ ...f, q: '42' });
    expect(safetyFiltersFromSearch(new URLSearchParams('tab=nope&assigned=everyone&country=us'))).toEqual({
      ...DEFAULT_SAFETY_FILTERS, country: 'US',
    });
    expect(activeSafetyFilterCount(f)).toBe(6);
  });
});

describe('the server query for each tab', () => {
  const parse = (path: string) => {
    const [base, qs] = path.split('?');
    return { base, params: Object.fromEntries(new URLSearchParams(qs)) };
  };

  it('Active SOS is live incidents with an open SOS', () => {
    const { base, params } = parse(incidentsApiPath(DEFAULT_SAFETY_FILTERS));
    expect(base).toBe('/safety/admin/incidents/');
    expect(params).toMatchObject({ has_open_sos: 'true', status: 'open,investigating,action_taken' });
  });

  it('Incidents is every live one; Closed is closed, newest closure first', () => {
    expect(parse(incidentsApiPath({ ...DEFAULT_SAFETY_FILTERS, tab: 'incidents' })).params).toEqual({
      status: 'open,investigating,action_taken', limit: '100',
    });
    expect(parse(incidentsApiPath({ ...DEFAULT_SAFETY_FILTERS, tab: 'closed' })).params).toMatchObject({
      status: 'closed', sort: 'closed',
    });
  });

  it('passes the filters through', () => {
    const { params } = parse(incidentsApiPath({
      ...DEFAULT_SAFETY_FILTERS, tab: 'incidents', severity: 'high', category: 'accident',
      assigned: 'none', country: 'US', q: '9', scope: 'US-TX',
    }));
    expect(params).toMatchObject({
      severity: 'high', category: 'accident', assigned: 'none', country: 'US', q: '9', scope: 'US-TX',
    });
  });

  it('signals ask for the open ones', () => {
    expect(signalsApiPath({ ...DEFAULT_SAFETY_FILTERS, tab: 'signals', country: 'IN' })).toBe(
      '/safety/admin/signals/?state=open&country=IN');
  });

  it('tab counts come from the server, and unknown stays unknown', () => {
    expect(tabCount('sos', undefined)).toBeUndefined();
    expect(tabCount('incidents', { open: 2, investigating: 1, action_taken: 3 })).toBe(6);
    expect(tabCount('closed', { closed: 4 })).toBe(4);
    expect(tabCount('signals', { signals: 0 })).toBe(0);
  });
});

describe('time', () => {
  it('measures whole minutes and never goes negative', () => {
    expect(minutesBetween(ago(7.9), NOW)).toBe(7);
    expect(minutesBetween(new Date(NOW + 60000).toISOString(), NOW)).toBe(0);
    expect(minutesBetween(null, NOW)).toBeNull();
    expect(minutesBetween('garbage', NOW)).toBeNull();
  });

  it('reads like a person would say it', () => {
    expect(elapsed(null)).toBe('—');
    expect(elapsed(0)).toBe('just now');
    expect(elapsed(7)).toBe('7 min');
    expect(elapsed(65)).toBe('1 h 05 min');
    expect(elapsed(60 * 27)).toBe('1 d 3 h');
  });
});

describe('the unacknowledged timer is the country\'s, and absent is absent', () => {
  it('counts down against the configured limit', () => {
    const state = ackState(row(), timers(5), NOW);
    expect(state).toEqual({ kind: 'running', since: 3, remaining: 2 });
    expect(ackText(state, 'IN')).toBe('Unacknowledged 3 min · 2 min left');
  });

  it('turns overdue exactly at the limit', () => {
    expect(ackState(row({ oldest_unacknowledged_at: ago(5) }), timers(5), NOW).kind).toBe('overdue');
    const late = ackState(row({ oldest_unacknowledged_at: ago(9) }), timers(5), NOW);
    expect(late).toEqual({ kind: 'overdue', since: 9, over: 4 });
    expect(ackText(late, 'IN')).toBe('Unacknowledged 9 min · 4 min over the limit');
  });

  it('with no timer configured it says so and invents no deadline', () => {
    for (const t of [timers(null), {}, undefined]) {
      const state = ackState(row(), t, NOW);
      expect(state.kind).toBe('no_timer');
      expect(ackText(state, 'IN')).toBe('Unacknowledged 3 min · no timer configured for IN');
    }
  });

  it('never borrows another country\'s timer', () => {
    expect(ackState(row({}, 'US'), timers(2), NOW).kind).toBe('no_timer');
    expect(ackState(row({}, null), timers(2), NOW).kind).toBe('no_timer');
  });

  it('is quiet once everything is acknowledged', () => {
    expect(ackState(row({ unacknowledged: 0, oldest_unacknowledged_at: null }), timers(2), NOW)).toEqual({ kind: 'none' });
  });
});

describe('emergency numbers', () => {
  it('lists what the country has', () => {
    expect(emergencyLine({ country: 'IN', configured: true, numbers: [
      { label: 'unified', number: '112' }, { label: 'police', number: '100' },
    ] })).toBe('unified 112 · police 100');
  });

  it('says "not configured" rather than showing anything else', () => {
    expect(emergencyLine({ country: 'US', configured: false, numbers: [] })).toBe('Not configured for US');
    expect(emergencyLine({ country: null, configured: false, numbers: [] })).toMatch(/Not configured/);
    expect(emergencyLine(undefined)).toMatch(/Not configured/);
  });
});

describe('the settings form', () => {
  it('reads a blank as "off" and refuses anything that is not a whole number', () => {
    expect(parseConfigDraft('')).toEqual({ ok: true, value: null });
    expect(parseConfigDraft(' 12 ')).toEqual({ ok: true, value: 12 });
    expect(parseConfigDraft('1.5')).toEqual({ ok: false });
    expect(parseConfigDraft('-3')).toEqual({ ok: false });
    expect(parseConfigDraft('ten')).toEqual({ ok: false });
  });

  it('sends only what changed', () => {
    const { patch, invalid } = configPatch(
      { sos_ack_minutes: '3', incident_assign_minutes: '5', long_stop_minutes: '' },
      { sos_ack_minutes: 2, incident_assign_minutes: 5, long_stop_minutes: 8 },
    );
    expect(patch).toEqual({ sos_ack_minutes: 3, long_stop_minutes: null });
    expect(invalid).toEqual([]);
  });

  it('reports the fields that are not numbers', () => {
    expect(configPatch({ sos_ack_minutes: 'x' }, {}).invalid).toEqual(['sos_ack_minutes']);
  });

  it('shows a blank value as Off', () => {
    expect(configValue(null, 'min')).toBe('Off');
    expect(configValue(8, 'min')).toBe('8 min');
  });
});

describe('signal summaries', () => {
  const signal = (kind: string, measured: Signal['measured']) => ({ kind, measured } as Signal);
  it('says what was measured', () => {
    expect(signalSummary(signal('long_stop', { stopped_minutes: 12.4, radius_m: 50 }))).toBe('Stopped 12.4 min within 50 m');
    expect(signalSummary(signal('eta_overrun', { over_minutes: 25, over_percent: 125, estimated_minutes: 20 })))
      .toBe('25 min (125%) over a 20 min estimate');
  });
});
