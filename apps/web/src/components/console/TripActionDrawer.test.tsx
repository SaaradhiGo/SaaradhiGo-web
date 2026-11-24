/**
 * The trip action dialog: what it sends, and what it says back.
 *
 * The 202 case is the one that matters: a refund over the maker's limit
 * changes nothing until a checker approves, and the operator must be told
 * that plainly ("Sent for approval · request #N"), not "refunded".
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionDrawer } from './TripActionDrawer';

function respond(status: number, data: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(status < 300 ? { data } : { error: data }), {
    status, headers: { 'Content-Type': 'application/json' },
  }));
}

function open(action: 'refund' | 'cancel' | 'note', onDone = vi.fn()) {
  render(
    <ActionDrawer
      action={action} tripId={81} currency="INR" refundable={60_000}
      refundKey="support.refund" riderName="the rider" onClose={vi.fn()} onDone={onDone}
    />,
  );
  return onDone;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('ActionDrawer', () => {
  it('sends a refund in minor units with a reason and a key, and shows the 202 as pending', async () => {
    const fetchMock = respond(202, { state: 'pending_approval', approval_request: { id: 42, status: 'requested' } });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = open('refund');
    fireEvent.change(screen.getByLabelText(/Amount \(INR\)/), { target: { value: '501' } });
    fireEvent.change(screen.getByLabelText(/Reason \(required\)/), { target: { value: 'driver took a detour' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
    await waitFor(() => expect(screen.getByText('Sent for approval · request #42')).toBeTruthy());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/ride\/admin\/trips\/81\/refund\/$/);
    const body = JSON.parse(String(init.body));
    expect(body.amount_minor).toBe(50_100);
    expect(body.reason).toBe('driver took a detour');
    expect(typeof body.idempotency_key).toBe('string');
    expect(onDone).toHaveBeenCalledWith('Sent for approval · request #42', 'pending');
  });

  it('reports a within-limit refund as done', async () => {
    vi.stubGlobal('fetch', respond(200, { state: 'executed', approval_request: { id: 7, status: 'executed' } }));
    open('refund');
    fireEvent.change(screen.getByLabelText(/Amount \(INR\)/), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText(/Reason \(required\)/), { target: { value: 'late' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refund' }));
    await waitFor(() => expect(screen.getByText('Refund of ₹500 recorded.')).toBeTruthy());
  });

  it('will not send more than is left to refund', () => {
    vi.stubGlobal('fetch', vi.fn());
    open('refund');
    fireEvent.change(screen.getByLabelText(/Amount \(INR\)/), { target: { value: '601' } });
    fireEvent.change(screen.getByLabelText(/Reason \(required\)/), { target: { value: 'x' } });
    expect(screen.getByText('That is more than is left to refund.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Refund' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the server refusal and changes nothing', async () => {
    vi.stubGlobal('fetch', respond(409, { code: 'NOT_CANCELLABLE', message: 'A in_progress trip cannot be cancelled here.' }));
    open('cancel');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel trip' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/cannot be cancelled/));
  });

  it('requires the note text before sending a note', () => {
    vi.stubGlobal('fetch', vi.fn());
    open('note');
    expect((screen.getByRole('button', { name: 'Internal note' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the refund limits and says when a refund goes to a checker (15 Nov ruling)', () => {
    render(
      <ActionDrawer
        action="refund" tripId={218} currency="USD" refundable={2_958} refundKey="finance.refund"
        riderName="Avery" onClose={vi.fn()} onDone={vi.fn()}
        limits={{ action_key: 'finance.refund', currency: 'USD', per_trip_minor: 5_000, per_trip_left_minor: 5_000,
          per_day_minor: 25_000, used_today_minor: 23_000, per_day_left_minor: 2_000, alone_up_to_minor: 2_000 }}
      />,
    );
    const text = screen.getByTestId('refund-limits').textContent ?? '';
    expect(text).toContain('$50.00 per trip');
    expect(text).toContain('$250.00 a day');
    expect(text).toContain('$20.00 today');
    expect(screen.getByText('This refund goes to a checker for approval.')).toBeTruthy();   // $29.58 > $20.00 left
  });
});
