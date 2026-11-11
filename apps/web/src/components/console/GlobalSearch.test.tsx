/**
 * The search box as the operator meets it: the debounce, the four parallel
 * requests, the grouped list, the keyboard, a hidden 403 group, and the
 * empty and error states.
 *
 * `fetch` is stubbed rather than the API helper, so what is asserted is the
 * request that leaves the browser: four GETs with the term, each with the
 * bearer token. Run with `npm test` (vitest, jsdom).
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import { GlobalSearch } from './GlobalSearch';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/dashboard',
}));

type Reply = { status: number; body: unknown };

const trips = (results: unknown[]): Reply => ({ status: 200, body: { status: 'success', data: { kind: 'number', results } } });
const okEmpty: Reply = { status: 200, body: { status: 'success', data: { kind: 'name', results: [] } } };
const forbidden: Reply = { status: 403, body: { status: 'error', error: { code: 'FORBIDDEN', message: 'You do not have permission to do that here.' } } };
const broken: Reply = { status: 500, body: { status: 'error', error: { code: 'INTERNAL_ERROR', message: 'boom' } } };

const RAVI = { id: 9, full_name: 'Ravi K.', phone: '+91••••••3210' };
const driverHit = { type: 'driver', id: 5, status: 'online', approved: true, doc_status: 'approved', city_code: 'IN-TG-HYD', user: RAVI };
const tripHit = { type: 'trip', id: 42, status: 'completed', city_code: 'IN-TG-HYD', requested_at: null, rider: { id: 7, full_name: 'Priya S.', phone: '+91••••••1111' }, driver: RAVI };
const vehicleHit = { type: 'vehicle', id: 11, plate: 'TS 09 AB 1234', status: 'active', make: 'Maruti Dzire', city_code: 'IN-TG-HYD', driver_id: 5, driver: RAVI };

/** Route each of the four endpoints to a reply; anything else is a 404. */
function stubFetch(replies: Partial<Record<'trips' | 'drivers' | 'riders' | 'vehicles', Reply>>) {
  const calls: { url: string; auth: string | undefined }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, auth: headers.Authorization });
    const key = (['trips', 'drivers', 'riders', 'vehicles'] as const).find((k) => url.includes(`/search/admin/${k}/`));
    const reply = (key && replies[key]) ?? { status: 404, body: { error: { code: 'NOT_FOUND', message: 'no' } } };
    return new Response(JSON.stringify(reply.body), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

function type(text: string) {
  const box = screen.getByRole('combobox');
  fireEvent.change(box, { target: { value: text } });
  return box as HTMLInputElement;
}

const settle = () => new Promise((r) => setTimeout(r, 320));

beforeEach(() => {
  window.localStorage.setItem(TOKEN_KEY, 'operator-token');
  push.mockReset();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

describe('debounce and fan-out', () => {
  it('waits 250 ms, then asks all four endpoints once, with the token', async () => {
    const { calls } = stubFetch({ trips: okEmpty, drivers: okEmpty, riders: okEmpty, vehicles: okEmpty });
    render(<GlobalSearch access={null} />);

    type('ra');
    type('rav');
    type('ravi');
    expect(calls).toHaveLength(0);

    await act(settle);

    expect(calls).toHaveLength(4);
    const paths = calls.map((c) => new URL(c.url).pathname).sort();
    expect(paths).toEqual([
      '/api/v1/search/admin/drivers/', '/api/v1/search/admin/riders/',
      '/api/v1/search/admin/trips/', '/api/v1/search/admin/vehicles/',
    ]);
    for (const c of calls) {
      expect(new URL(c.url).searchParams.get('q')).toBe('ravi');
      expect(c.auth).toBe('Bearer operator-token');
    }
  });

  it('does not search a single letter, but does search a single digit', async () => {
    const { calls } = stubFetch({ trips: okEmpty, drivers: okEmpty, riders: okEmpty, vehicles: okEmpty });
    render(<GlobalSearch access={null} />);

    type('r');
    await act(settle);
    expect(calls).toHaveLength(0);

    type('7');
    await act(settle);
    expect(calls).toHaveLength(4);
  });

  it('skips a group the operator is known not to hold, without a request', async () => {
    const { calls } = stubFetch({ drivers: okEmpty, vehicles: okEmpty });
    const kycOnly = {
      id: 1, email: 'kyc@x', full_name: 'K', is_superuser: false, is_break_glass: false,
      permissions: ['driver.read', 'driver.kyc', 'pii.view'], roles: [], scopes: [],
      access_model: 'assignments' as const, super_admin_shortfall: 0,
    };
    render(<GlobalSearch access={kycOnly} />);

    type('ravi');
    await act(settle);

    const paths = calls.map((c) => new URL(c.url).pathname).sort();
    expect(paths).toEqual(['/api/v1/search/admin/drivers/', '/api/v1/search/admin/vehicles/']);
  });
});

describe('grouped results', () => {
  it('draws one group per answering endpoint and hides a 403 group', async () => {
    stubFetch({ trips: trips([tripHit]), drivers: trips([driverHit]), riders: forbidden, vehicles: trips([vehicleHit]) });
    render(<GlobalSearch access={null} />);

    type('ravi');
    await act(settle);

    const list = await screen.findByRole('listbox', { name: 'Search results' });
    const groups = screen.getAllByRole('group').map((g) => g.getAttribute('aria-labelledby'))
      .map((id) => document.getElementById(id!)?.textContent);
    expect(groups).toEqual(['Trips', 'Drivers', 'Vehicles']);
    expect(screen.queryByText('Riders')).toBeNull();
    expect(list.querySelectorAll('[role="option"]')).toHaveLength(3);
    expect(screen.getByRole('combobox').getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the masked phone exactly as returned and never the full number', async () => {
    stubFetch({ trips: okEmpty, drivers: trips([driverHit]), riders: okEmpty, vehicles: okEmpty });
    render(<GlobalSearch access={null} />);

    type('98765');
    await act(settle);

    const option = await screen.findByRole('option', { name: /^Ravi K\./ });
    expect(option.textContent).toContain('+91••••••3210');
    expect(document.body.textContent).not.toContain('9876543210');
  });

  it('says so when every group is forbidden', async () => {
    stubFetch({ trips: forbidden, drivers: forbidden, riders: forbidden, vehicles: forbidden });
    render(<GlobalSearch access={null} />);

    type('ravi');
    await act(settle);

    // Said twice on purpose: once in the popover, once in the live region.
    const copies = await screen.findAllByText('You do not have access to search.');
    expect(copies).toHaveLength(2);
    expect(screen.getByRole('status').textContent).toBe('You do not have access to search.');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('says when nothing matched', async () => {
    stubFetch({ trips: okEmpty, drivers: okEmpty, riders: okEmpty, vehicles: okEmpty });
    render(<GlobalSearch access={null} />);

    type('zzzz');
    await act(settle);

    expect(await screen.findByText(/Nothing matches “zzzz”/)).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('No results for zzzz');
  });

  it('reports a failing group without losing the others', async () => {
    stubFetch({ trips: okEmpty, drivers: trips([driverHit]), riders: okEmpty, vehicles: broken });
    render(<GlobalSearch access={null} />);

    type('ravi');
    await act(settle);

    expect(await screen.findByText(/Vehicles could not be searched/)).toBeTruthy();
    expect(screen.getByRole('option', { name: /^Ravi K\./ })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('vehicles could not be searched');
  });

  it('shows a loading state while the four requests are in flight', async () => {
    let release: (() => void) | null = null;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response(JSON.stringify(okEmpty.body), { status: 200 }));
    })));
    render(<GlobalSearch access={null} />);

    type('ravi');
    await act(settle);

    expect(screen.getByText('Searching…')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Searching');
    await act(async () => { release?.(); });
  });
});

describe('keyboard', () => {
  async function openWithThree() {
    stubFetch({ trips: trips([tripHit]), drivers: trips([driverHit]), riders: okEmpty, vehicles: trips([vehicleHit]) });
    render(<GlobalSearch access={null} />);
    const box = type('ravi');
    await act(settle);
    await screen.findByRole('listbox');
    return box;
  }

  it('moves the active option with the arrows and reports it on the input', async () => {
    const box = await openWithThree();
    expect(box.getAttribute('aria-activedescendant')).toBeNull();

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    const first = screen.getByRole('option', { name: /Trip #42/ });
    expect(box.getAttribute('aria-activedescendant')).toBe(first.id);
    expect(first.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /TS 09 AB 1234/ }).id);

    // Wraps.
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box.getAttribute('aria-activedescendant')).toBe(first.id);
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: /TS 09 AB 1234/ }).id);
  });

  it('Enter opens the active option; without one, the first', async () => {
    const box = await openWithThree();

    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/drivers/5');
    expect(box.value).toBe('');
    expect(box.getAttribute('aria-expanded')).toBe('false');

    push.mockReset();
    type('ravi');
    await act(settle);
    await screen.findByRole('listbox');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/trips/42');
  });

  it('a vehicle opens its driver', async () => {
    const box = await openWithThree();
    fireEvent.keyDown(box, { key: 'End' });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(push).toHaveBeenCalledWith('/drivers/5');
  });

  it('Escape closes the list and keeps the text; a second Escape clears it', async () => {
    const box = await openWithThree();

    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect(box.value).toBe('ravi');

    fireEvent.keyDown(box, { key: 'Escape' });
    expect(box.value).toBe('');
  });

  it('a click on an option opens it', async () => {
    await openWithThree();
    fireEvent.click(screen.getByRole('option', { name: /^Ravi K\./ }));
    expect(push).toHaveBeenCalledWith('/drivers/5');
  });

  it('a stale answer does not overwrite a newer one', async () => {
    const answers: Record<string, () => void> = {};
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => new Promise<Response>((resolve) => {
      const url = new URL(String(input));
      const q = url.searchParams.get('q')!;
      const key = (['trips', 'drivers', 'riders', 'vehicles'] as const).find((k) => url.pathname.includes(k))!;
      const body = key === 'drivers' && q === 'old'
        ? trips([{ ...driverHit, user: { ...RAVI, full_name: 'Old Answer' } }]).body
        : key === 'drivers' ? trips([driverHit]).body : okEmpty.body;
      answers[`${q}:${key}`] = () => resolve(new Response(JSON.stringify(body), { status: 200 }));
    })));
    render(<GlobalSearch access={null} />);

    type('old');
    await act(settle);
    type('ravi');
    await act(settle);

    // The newer search answers first, then the older one trickles in.
    await act(async () => { for (const k of ['trips', 'drivers', 'riders', 'vehicles']) answers[`ravi:${k}`]?.(); });
    await screen.findByRole('option', { name: /^Ravi K\./ });
    await act(async () => { for (const k of ['trips', 'drivers', 'riders', 'vehicles']) answers[`old:${k}`]?.(); });
    await waitFor(() => expect(screen.queryByText(/Old Answer/)).toBeNull());
    expect(screen.getByRole('option', { name: /^Ravi K\./ })).toBeTruthy();
  });
});
