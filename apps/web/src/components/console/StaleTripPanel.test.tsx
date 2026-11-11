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
  reason_codes: [], reason_min_length: 5, reason_max_length: 500,
};
const startedActions: StaleActions = {
  ...actions, release_case: 'C',
  reason_codes: [
    { code: 'driver_unresponsive', label: 'Driver unresponsive', rule: 'standard' },
    { code: 'safety_incident', label: 'Safety incident', rule: 'platform_funded' },
  ],
};
const previewData = {
  reason_code: 'driver_unresponsive', rule: 'standard', currency: 'INR', payment_method: 'online',
  distance_km: '2.00', distance_source: 'trail', elapsed_minutes: '3.00',
  uncapped_fare_minor: 4900, upfront_price_minor: 5300, capped_fare_minor: 4900, cap_applied: false,
  rider_pays_minor: 4900, commission_percent: '20.00', commission_minor: 980,
  driver_earnings_minor: 3920, funded_by: 'rider', driver_collects_cash: false,
};

/** A fetch that answers the preview GET with `preview` and the release POST with `release`. */
function routed(preview: { status: number; data: unknown }, release?: { status: number; data: unknown }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const r = init?.method === 'POST' && release ? release : preview;
    return new Response(JSON.stringify(r.status < 300 ? { data: r.data } : { error: r.data }), {
      status: r.status, headers: { 'Content-Type': 'application/json' },
    });
  });
}
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

  it('for a started trip offers the release, with no refusal text and no support routes', () => {
    draw(startedActions);
    expect(screen.getByRole('button', { name: 'Release driver…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mark reviewed…' })).toBeTruthy();
    expect(screen.queryByText(/needs the fare policy/)).toBeNull();
    expect(screen.queryByText('Open Safety')).toBeNull();
  });

  it('asks for a reason code in a radio group, and shows no figures until one is chosen', () => {
    vi.stubGlobal('fetch', routed({ status: 200, data: previewData }));
    draw(startedActions);
    fireEvent.click(screen.getByRole('button', { name: 'Release driver…' }));
    const group = screen.getByRole('group', { name: /Why is this trip being ended/ });
    expect(group).toBeTruthy();
    expect(screen.getAllByRole('radio').length).toBe(2);
    expect(screen.getByText('Choose a reason to see what the rider pays and what the driver earns.')).toBeTruthy();
    expect(screen.getByText(/Choose why the trip is being ended/)).toBeTruthy();
  });

  it("shows the server's figures for the chosen code and sends the code with the reason", async () => {
    const fetchMock = routed({ status: 200, data: previewData },
      { status: 200, data: { trip_id: 81, case: 'C', rule: 'standard', outcome: 'ended_by_operator', driver_released: true } });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = draw(startedActions);
    fireEvent.click(screen.getByRole('button', { name: 'Release driver…' }));
    fireEvent.click(screen.getByLabelText(/Driver unresponsive/));
    await waitFor(() => expect(screen.getAllByText('₹49.00').length).toBe(2));
    expect(screen.getByText('₹39.20 after 20.00% commission')).toBeTruthy();
    const [previewUrl] = fetchMock.mock.calls[0] as unknown as [string];
    expect(previewUrl).toMatch(/\/ride\/admin\/trips\/81\/stale\/release-preview\/\?reason_code=driver_unresponsive$/);
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Driver phone off for an hour' } });
    fireEvent.click(screen.getByRole('button', { name: 'End trip and release driver' }));
    await waitFor(() => expect(screen.getByText(/Trip ended\. The rider pays the fare/)).toBeTruthy());
    const post = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST') as unknown as [string, RequestInit];
    expect(post[0]).toMatch(/\/stale\/release-driver\/$/);
    expect(JSON.parse(String(post[1].body))).toEqual({ reason: 'Driver phone off for an hour', reason_code: 'driver_unresponsive' });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it('says Not charged and who funds it for a safety incident', async () => {
    vi.stubGlobal('fetch', routed({
      status: 200,
      data: { ...previewData, reason_code: 'safety_incident', rule: 'platform_funded', rider_pays_minor: 0, funded_by: 'platform' },
    }));
    draw(startedActions);
    fireEvent.click(screen.getByRole('button', { name: 'Release driver…' }));
    fireEvent.click(screen.getByLabelText(/Safety incident/));
    await waitFor(() => expect(screen.getByText('Not charged')).toBeTruthy());
    expect(screen.getByText('SaaradhiGo (platform-funded)')).toBeTruthy();
    expect(screen.getByText(/SaaradhiGo pays the driver their earnings/)).toBeTruthy();
  });

  it('will not send without a reason code, even with a reason', async () => {
    const fetchMock = routed({ status: 200, data: previewData });
    vi.stubGlobal('fetch', fetchMock);
    draw(startedActions);
    fireEvent.click(screen.getByRole('button', { name: 'Release driver…' }));
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Driver phone off for an hour' } });
    fireEvent.click(screen.getByRole('button', { name: 'End trip and release driver' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows a preview failure as text with a way to try again, and sends nothing meanwhile', async () => {
    const fetchMock = routed({ status: 409, data: { code: 'fare_card_unavailable', message: 'The fare card this trip was quoted on cannot be found.' } });
    vi.stubGlobal('fetch', fetchMock);
    draw(startedActions);
    fireEvent.click(screen.getByRole('button', { name: 'Release driver…' }));
    fireEvent.click(screen.getByLabelText(/Driver unresponsive/));
    await waitFor(() => expect(screen.getByText(/fare card this trip was quoted on/)).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Driver phone off for an hour' } });
    fireEvent.click(screen.getByRole('button', { name: 'End trip and release driver' }));
    expect(fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === 'POST').length).toBe(0);
  });

  it('shows a loading state while the figures are worked out', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
    draw(startedActions);
    fireEvent.click(screen.getByRole('button', { name: 'Release driver…' }));
    fireEvent.click(screen.getByLabelText(/Driver unresponsive/));
    expect(screen.getByText('Working out the figures…')).toBeTruthy();
  });
});
