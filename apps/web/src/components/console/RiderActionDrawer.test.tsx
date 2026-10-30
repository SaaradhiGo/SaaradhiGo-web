/**
 * The rider action and bulk dialogs: what they send, and what they say
 * back. A bulk over 50 is a 202 that changes nothing until a checker
 * approves, and must read "Sent for approval · request #N".
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RiderActionDrawer, RiderBulkDrawer } from './RiderActionDrawer';

function respond(status: number, data: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(status < 300 ? { data } : { error: data }), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
}

function call(fetchMock: ReturnType<typeof respond>, n = 0) {
  const [url, init] = fetchMock.mock.calls[n] as unknown as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : null };
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const many = Array.from({ length: 51 }, (_, i) => 100 + i);

describe('RiderBulkDrawer', () => {
  it('warns before, and shows a 202 as sent for approval, not done', async () => {
    const fetchMock = respond(202, { state: 'pending_approval', approval_request: { id: 31, status: 'requested' }, count: 51 });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    render(<RiderBulkDrawer action="block" ids={many} onClose={vi.fn()} onDone={onDone} />);
    expect(screen.getByText('Needs a checker')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(screen.getByText('Sent for approval · request #31')).toBeTruthy());
    expect(screen.getByText(/Nothing has changed yet/)).toBeTruthy();
    const sent = call(fetchMock);
    expect(sent.url).toMatch(/\/rider\/admin\/bulk\/$/);
    expect(sent.body.action).toBe('block');
    expect(sent.body.rider_ids).toHaveLength(51);
    expect(sent.body.reason_code).toBe('fraud');
    expect(typeof sent.body.idempotency_key).toBe('string');
    expect(onDone).toHaveBeenCalled();
  });

  it('within the limit runs now and lists each rider', async () => {
    const fetchMock = respond(200, {
      state: 'executed', approval_request: { id: 32, status: 'executed' },
      result: { results: [{ id: 7, result: 'blocked' }, { id: 8, result: 'not_found' }], counts: {} },
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<RiderBulkDrawer action="block" ids={[7, 8]} onClose={vi.fn()} onDone={vi.fn()} />);
    expect(screen.queryByText('Needs a checker')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Block riders' }));
    await waitFor(() => expect(screen.getByText('not found')).toBeTruthy());
    expect(screen.getByText('blocked')).toBeTruthy();
  });

  it('unblock needs a note and sends no reason code', async () => {
    const fetchMock = respond(200, { state: 'executed', approval_request: { id: 33, status: 'executed' } });
    vi.stubGlobal('fetch', fetchMock);
    render(<RiderBulkDrawer action="unblock" ids={[7]} onClose={vi.fn()} onDone={vi.fn()} />);
    const button = screen.getByRole('button', { name: 'Unblock riders' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Note (required)'), { target: { value: 'appeal upheld' } });
    fireEvent.click(button);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(call(fetchMock).body.reason_code).toBeUndefined();
  });
});

describe('RiderActionDrawer', () => {
  it('blocks with the chosen reason, and needs a note for "other"', async () => {
    const fetchMock = respond(201, { block_id: 3, created: true });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    render(<RiderActionDrawer action="block" riderId={23} riderName="Lakshmi" onClose={vi.fn()} onDone={onDone} />);
    expect(screen.getByText(/cannot request a ride/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Other (note required)'));
    const button = screen.getByRole('button', { name: 'Block rider' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Abusive to drivers' } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText('Lakshmi is blocked from requesting rides.')).toBeTruthy());
    expect(call(fetchMock).url).toMatch(/\/rider\/admin\/23\/block\/$/);
    expect(call(fetchMock).body).toEqual({ reason_code: 'other', note: 'Abusive to drivers' });
    expect(onDone).toHaveBeenCalledWith('Lakshmi is blocked from requesting rides.', 'done');
  });

  it('sign-out asks for a reason and reports how many sessions ended', async () => {
    const fetchMock = respond(200, { revoked: 2, changed: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<RiderActionDrawer action="sign_out" riderId={23} riderName="Lakshmi" onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'lost phone' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign out everywhere' }));
    await waitFor(() => expect(screen.getByText('2 sessions ended.')).toBeTruthy());
    expect(call(fetchMock).body).toEqual({ reason: 'lost phone' });
  });

  it('shows the server refusal and changes nothing', async () => {
    vi.stubGlobal('fetch', respond(403, { code: 'PERMISSION_DENIED', message: 'You do not hold rider.flag here.' }));
    const onDone = vi.fn();
    render(<RiderActionDrawer action="flag" riderId={23} riderName="Lakshmi" onClose={vi.fn()} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Flag rider' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(onDone).not.toHaveBeenCalled();
  });
});
