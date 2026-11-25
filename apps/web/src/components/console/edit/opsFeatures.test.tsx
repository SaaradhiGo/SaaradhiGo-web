import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CallDrawer } from '@/components/console/CallDrawer';
import { ProviderModeDrawer } from '@/components/console/platform/ProviderModeDrawer';
import { HourlyRota } from '@/components/console/safety/HourlyRota';
import { ZoneAreas } from '@/components/console/zones/ZoneAreas';

const fetchMock = vi.fn();
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
  .map(([url, init]) => [decodeURIComponent(String(url)), JSON.parse(String(init.body))]);
let answer: (u: string, method: string) => unknown = () => ({});

beforeEach(() => {
  document.cookie = 'sg-staff-in=1; path=/';
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const u = decodeURIComponent(String(url));
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: answer(u, init?.method ?? 'GET') }) };
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => cleanup());

describe('25 Nov owner rulings in the console', () => {
  it('calls a rider through the masked bridge and says when it is the test bridge', async () => {
    answer = () => ({ call: { session_id: 4, to: 'rider', kind: 'number', number: '+910000000000', test: true } });
    render(<CallDrawer tripId={9} to="rider" onClose={() => undefined} onDone={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Why you are calling/), { target: { value: 'Lost phone in the car' } });
    fireEvent.click(screen.getByRole('button', { name: 'Call' }));
    expect(await screen.findByText(/no real phone rings/)).toBeTruthy();
    expect(posts()[0]).toEqual(['/api/staff?to=/ride/admin/trips/9/call/', { to: 'rider', reason: 'Lost phone in the car' }].map((x, i) => (i === 0 ? expect.stringContaining('/ride/admin/trips/9/call/') : x)));
  });

  it('switches a provider mode with a reason, showing before and after', async () => {
    answer = () => ({ approval_request: { id: 3, status: 'requested' }, state: 'pending_approval' });
    const done = vi.fn();
    render(<ProviderModeDrawer row={{ type: 'sms', label: 'SMS', country: 'IN', console_mode: null }} onClose={() => undefined} onDone={done} />);
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'off' } });
    expect(screen.getByText('Set by the environment')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Why/), { target: { value: 'Pause texts during the migration' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(posts()[0][1]).toMatchObject({ type: 'sms', country: 'IN', mode: 'off' });
  });

  it('edits the hourly rota with the server preview', async () => {
    answer = (u, m) => (u.includes('/preview/') ? { changes: [{ label: 'Monday', from: 'nobody', to: '09–17 Asha' }] }
      : m === 'POST' ? { approval_request: { id: 5, status: 'requested' }, state: 'pending_approval' }
        : { city: { code: 'IN-TG-HYD', name: 'Hyderabad' }, plan: null, grid: Array.from({ length: 7 }, () => Array(24).fill(null)),
          staff: [{ id: 11, name: 'Asha', reachable: true }, { id: 12, name: 'Ravi', reachable: true }], history: [] });
    render(<HourlyRota cityCode="IN-TG-HYD" canEdit />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a shift' }));
    expect(await screen.findByText('09–17 Asha')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Why/), { target: { value: 'Weekday cover' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(posts().some(([u]) => u.endsWith('/safety/admin/rota/IN-TG-HYD/'))).toBe(true));
  });

  it('adds a restricted area through a second person', async () => {
    answer = (u, m) => (u.includes('/preview/') ? { changes: [{ label: 'Restricted', from: 'none', to: 'Restricted area: Old city' }] }
      : m === 'POST' ? { approval_request: { id: 6, status: 'requested' }, state: 'pending_approval' } : { results: [] });
    render(<ZoneAreas zoneId={2} may classes={['sedan']} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Add an area…' }));
    fireEvent.change(screen.getByLabelText('Name riders see'), { target: { value: 'Old city' } });
    fireEvent.change(screen.getByLabelText(/The area/), { target: { value: '{"type":"Polygon","coordinates":[[[78.4,17.3],[78.5,17.3],[78.5,17.4],[78.4,17.3]]]}' } });
    expect(await screen.findByText('Restricted area: Old city')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Why/), { target: { value: 'Festival crowding' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for approval' }));
    await waitFor(() => expect(posts().some(([u, b]) => u.endsWith('/pricing/admin/zones/2/areas/') && b.kind === 'restricted')).toBe(true));
  });
});
