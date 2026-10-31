/**
 * The Stale trip panel and its dialog: what is offered, what is sent, and that a
 * refusal stays on screen as text.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StaleTripPanel } from './StaleTripPanel';
import { type StaleActions, panelModel } from '@/lib/staleTrip';

vi.mock('@/components/console/PageLink', () => ({
  PageButtonLink: ({ children }: { children: React.ReactNode }) => <a href="#x">{children}</a>,
  PageLink: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const actions: StaleActions = {
  can_resolve: true, is_stale: true, mark_reviewed: true, release_driver: true, release_case: 'B',
  refusal: null, routes: [], reason_min_length: 5, reason_max_length: 500,
};
const detail = { silent_seconds: 1800, last_activity_at: null, flagged_at: null, reviewed_at: null, reviewed_by: null };

function respond(status: number, data: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(status < 300 ? { data } : { error: data }), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
}

function draw(a: StaleActions = actions, onDone = vi.fn()) {
  render(
    <StaleTripPanel
      model={panelModel({ is_stale: true, reason: 'driver_silent_long' }, a)}
      tripId={81} reason="driver_silent_long" actions={a} detail={detail} timeZone="Asia/Kolkata" onDone={onDone}
    />,
  );
  return onDone;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('StaleTripPanel', () => {
  it('shows the reason, the silence and the two actions', () => {
    draw();
    expect(screen.getByText('The driver has been quiet for a long time', { exact: false })).toBeTruthy();
    expect(screen.getByText('30 minutes')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark reviewed…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Release driver…' })).toBeTruthy();
  });

  it('reads back the consequence and will not send without a reason', async () => {
    const fetchMock = respond(200, {});
    vi.stubGlobal('fetch', fetchMock);
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Release driver…' }));
    expect(screen.getByText('The trip will be cancelled with no charge to the rider and no fee to the driver, and the driver can take trips again.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Release driver' }));
    expect(screen.getByRole('alert').textContent).toBe('A reason is required.');
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Release driver' }));
    expect(screen.getByRole('alert').textContent).toBe('Write at least 5 characters.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the reason to the release endpoint and shows the outcome in the dialog', async () => {
    const fetchMock = respond(200, { trip_id: 81, case: 'B', outcome: 'cancelled_and_released', driver_released: true });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Release driver…' }));
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Driver unreachable, ghost trip' } });
    fireEvent.click(screen.getByRole('button', { name: 'Release driver' }));
    await waitFor(() => expect(screen.getByText(/Trip cancelled with no charge to the rider/)).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/ride\/admin\/trips\/81\/stale\/release-driver\/$/);
    expect(JSON.parse(String(init.body))).toEqual({ reason: 'Driver unreachable, ghost trip' });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('sends mark-reviewed to its own endpoint', async () => {
    const fetchMock = respond(200, { trip_id: 81, outcome: 'marked_reviewed' });
    vi.stubGlobal('fetch', fetchMock);
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed…' }));
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Spoke to the driver' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark reviewed' }));
    await waitFor(() => expect(screen.getByText('Marked reviewed. The trip is unchanged.')).toBeTruthy());
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toMatch(/\/stale\/mark-reviewed\/$/);
  });

  it('keeps a 409 refusal on screen as text', async () => {
    vi.stubGlobal('fetch', respond(409, { code: 'trip_active', message: 'This trip is not stale and is still active, so the driver cannot be released from it.' }));
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Release driver…' }));
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Looks stuck to me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Release driver' }));
    await waitFor(() => expect(screen.getByText(/not stale and is still active/)).toBeTruthy());
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Close' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Release driver' })).toBeNull();
  });

  it('for a started trip draws the refusal text and the routes, and no release button', () => {
    draw({
      ...actions, release_driver: false, release_case: 'C', routes: ['safety', 'support'],
      refusal: { code: 'started_trip_needs_policy', message: 'Ending a ride that has already started needs the fare policy.' },
    });
    expect(screen.getByText(/needs the fare policy/)).toBeTruthy();
    expect(screen.getByText('Open Safety')).toBeTruthy();
    expect(screen.getByText('Open Support')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Release driver…' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Mark reviewed…' })).toBeTruthy();
  });
});
