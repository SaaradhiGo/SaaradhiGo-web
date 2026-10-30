/**
 * The driver action and document review dialogs: what they send, and what
 * they say back. A deactivation is a 202 that changes nothing until a
 * checker approves, and must read "Sent for approval · request #N".
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentReviewDrawer, DriverActionDrawer } from './DriverActionDrawer';

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

describe('DriverActionDrawer', () => {
  it('shows a deactivation 202 as sent for approval, not done', async () => {
    const fetchMock = respond(202, { state: 'pending_approval', approval_request: { id: 17, status: 'requested' } });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    render(<DriverActionDrawer action="deactivate" driverId={5} driverName="Ravi" onClose={vi.fn()} onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(screen.getByText('Sent for approval · request #17')).toBeTruthy());
    expect(call(fetchMock).method).toBe('DELETE');
    expect(call(fetchMock).url).toMatch(/\/driver\/admin\/5\/delete\/$/);
    expect(onDone).toHaveBeenCalledWith('Sent for approval · request #17', 'pending');
  });

  it('suspends with the chosen reason code, and needs a note for "other"', async () => {
    const fetchMock = respond(201, { suspension_id: 3, created: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<DriverActionDrawer action="suspend" driverId={5} driverName="Ravi" onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('Other (note required)'));
    const button = screen.getByRole('button', { name: 'Suspend driver' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Rider complaint' } });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByText('Ravi is suspended and off the road.')).toBeTruthy());
    expect(call(fetchMock).body).toEqual({ reason_code: 'other', note: 'Rider complaint' });
  });

  it('will not offer approval the server would refuse', () => {
    vi.stubGlobal('fetch', vi.fn());
    render(
      <DriverActionDrawer
        action="approve" driverId={5} driverName="Ravi" onClose={vi.fn()} onDone={vi.fn()}
        blockers={[{ code: 'DOCUMENTS_MISSING', message: 'Missing: Pollution Under Control' }]}
      />,
    );
    expect(screen.getByText('Missing: Pollution Under Control')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Approve to drive' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('says when a reinstated driver went back to review', async () => {
    vi.stubGlobal('fetch', respond(200, { changed: true, approved: false, back_to_review: true }));
    render(<DriverActionDrawer action="reinstate" driverId={5} driverName="Ravi" onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Reason (required)'), { target: { value: 'Cleared' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reinstate driver' }));
    await waitFor(() => expect(screen.getByText(/back in the KYC queue/)).toBeTruthy());
  });

  it('shows the server refusal and changes nothing', async () => {
    vi.stubGlobal('fetch', respond(409, { code: 'DRIVER_SUSPENDED', message: 'Suspended: reinstate before approving.' }));
    render(<DriverActionDrawer action="approve" driverId={5} driverName="Ravi" onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve to drive' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/reinstate before approving/));
  });
});

describe('DocumentReviewDrawer', () => {
  const doc = { key: 'puc', label: 'Pollution Under Control', owner: 'vehicle' as const, vehicle_id: 9 };

  it('needs a reason to reject, and sends it for the driver to read', async () => {
    const fetchMock = respond(201, { review_id: 1, state: 'rejected', created: true });
    vi.stubGlobal('fetch', fetchMock);
    const onDone = vi.fn();
    render(<DocumentReviewDrawer driverId={5} doc={doc} decision="reject" onClose={vi.fn()} onDone={onDone} />);
    const button = screen.getByRole('button', { name: 'Reject document' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/What does the driver need to change/), { target: { value: 'Certificate has expired' } });
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const sent = call(fetchMock);
    expect(sent.url).toMatch(/\/driver\/admin\/5\/documents\/review\/$/);
    expect(sent.body).toEqual({ document_key: 'puc', vehicle_id: 9, decision: 'reject', reason: 'Certificate has expired' });
    expect(screen.getByText(/The driver can read your reason in the app/)).toBeTruthy();
  });

  it('approves without a reason', async () => {
    const fetchMock = respond(201, { review_id: 2, state: 'approved', created: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<DocumentReviewDrawer driverId={5} doc={doc} decision="approve" onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Approve document' }));
    await waitFor(() => expect(screen.getByText('Pollution Under Control approved.')).toBeTruthy());
    expect(call(fetchMock).body.decision).toBe('approve');
  });
});
