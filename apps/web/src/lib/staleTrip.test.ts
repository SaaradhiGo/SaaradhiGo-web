import { describe, expect, it } from 'vitest';
import {
  type StaleActions, consequence, failureText, outcomeText, panelModel, reasonProblem, silentFor,
  staleReasonText,
} from './staleTrip';

const base: StaleActions = {
  can_resolve: true, is_stale: true, mark_reviewed: true, release_driver: true, release_case: 'B',
  refusal: null, routes: [], reason_min_length: 5, reason_max_length: 500,
};
const stale = { is_stale: true, reason: 'driver_silent_long' };

describe('panelModel', () => {
  it('offers both buttons for a ghost trip before pickup', () => {
    const m = panelModel(stale, base);
    expect(m.show).toBe(true);
    expect(m.buttons).toEqual(['mark_reviewed', 'release_driver']);
    expect(m.refusal).toBeNull();
  });

  it('offers only review for a started trip and carries the refusal and routes', () => {
    const refusal = { code: 'started_trip_needs_policy', message: 'Ending a ride that has already started needs the fare policy.' };
    const m = panelModel(stale, { ...base, release_driver: false, release_case: 'C', refusal, routes: ['safety', 'support'] });
    expect(m.buttons).toEqual(['mark_reviewed']);
    expect(m.refusal).toEqual(refusal);
    expect(m.routes).toEqual(['safety', 'support']);
    expect(m.readOnly).toBe(false);
  });

  it('draws nothing for a trip that is not stale', () => {
    expect(panelModel({ is_stale: false, reason: null }, { ...base, mark_reviewed: false, release_driver: false, release_case: null }).show).toBe(false);
  });

  it('draws nothing when the server sent no stale answer (older backend)', () => {
    expect(panelModel(stale, undefined).show).toBe(false);
    expect(panelModel(undefined, undefined).show).toBe(false);
  });

  it('shows a read-only note, with no buttons, to a role without the capability', () => {
    const m = panelModel(stale, { ...base, can_resolve: false, mark_reviewed: false, release_driver: false, release_case: null });
    expect(m.show).toBe(true);
    expect(m.buttons).toEqual([]);
    expect(m.readOnly).toBe(true);
  });

  it('offers the repair for a finished trip whose driver is still marked busy, though it is not stale', () => {
    const m = panelModel({ is_stale: false, reason: null }, { ...base, is_stale: false, mark_reviewed: false, release_case: 'A' });
    expect(m.show).toBe(true);
    expect(m.buttons).toEqual(['release_driver']);
  });
});

describe('reasonProblem', () => {
  it('requires a reason of 5 to 500 characters after trimming', () => {
    expect(reasonProblem('')).toBe('A reason is required.');
    expect(reasonProblem('    ')).toBe('A reason is required.');
    expect(reasonProblem('abcd')).toBe('Write at least 5 characters.');
    expect(reasonProblem('  abcd  ')).toBe('Write at least 5 characters.');
    expect(reasonProblem('abcde')).toBeNull();
    expect(reasonProblem('x'.repeat(500))).toBeNull();
    expect(reasonProblem('x'.repeat(501))).toMatch(/500 characters or fewer/);
  });
});

describe('silentFor', () => {
  it('speaks in minutes, then hours, then days', () => {
    expect(silentFor(20)).toBe('less than a minute');
    expect(silentFor(60)).toBe('1 minute');
    expect(silentFor(30 * 60)).toBe('30 minutes');
    expect(silentFor(3600)).toBe('1 hour');
    expect(silentFor(3600 + 5 * 60)).toBe('1 hour 5 minutes');
    expect(silentFor(26 * 3600)).toBe('1 day 2 hours');
  });
  it('never invents a number', () => {
    expect(silentFor(null)).toBe('unknown');
    expect(silentFor(undefined)).toBe('unknown');
    expect(silentFor(-5)).toBe('unknown');
    expect(silentFor(Number.NaN)).toBe('unknown');
  });
});

describe('what the dialog says', () => {
  it('reads back the no-charge, no-fee consequence for a ghost trip', () => {
    expect(consequence('release_driver', 'B')).toBe(
      'The trip will be cancelled with no charge to the rider and no fee to the driver, and the driver can take trips again.');
  });
  it('says a repair leaves the trip alone', () => {
    expect(consequence('release_driver', 'A')).toMatch(/not changed/);
    expect(consequence('mark_reviewed', null)).toMatch(/not changed/);
  });
  it('reports each outcome plainly', () => {
    expect(outcomeText('mark_reviewed', { trip_id: 1, outcome: 'marked_reviewed' })).toBe('Marked reviewed. The trip is unchanged.');
    expect(outcomeText('release_driver', { trip_id: 1, outcome: 'cancelled_and_released', case: 'B' })).toMatch(/no charge to the rider/);
    expect(outcomeText('release_driver', { trip_id: 1, outcome: 'repaired_cleared', case: 'A' })).toMatch(/can take trips again/);
    expect(outcomeText('release_driver', { trip_id: 1, outcome: 'repaired_set', case: 'A' })).toMatch(/not released/);
  });
  it('names the stale reasons in words', () => {
    expect(staleReasonText('driver_silent')).toBe('The driver has gone quiet');
    expect(staleReasonText('something_new')).toBe('something new');
    expect(staleReasonText(null)).toBe('This trip has stopped progressing');
  });
});

describe('failureText', () => {
  it('keeps a server refusal and its code so it can be shown as text', () => {
    expect(failureText({ fromServer: true, code: 'trip_active', message: 'This trip is not stale.' })).toEqual({
      code: 'trip_active', message: 'This trip is not stale.',
    });
  });
  it('does not show a transport error as if the server said it', () => {
    expect(failureText(new Error('HTTP 502'))).toEqual({ code: null, message: 'That did not go through. Nothing was changed.' });
    expect(failureText(null).code).toBeNull();
  });
});
