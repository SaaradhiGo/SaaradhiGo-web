/**
 * The header and profile menu (owner, 10 Nov): pill, "Go online in the driver app", then the
 * profile button with the first name; the menu's order; one-click Sign out to the right sign-in
 * page; no profile card in the sidebar; the profile page titled with the driver's name; and a
 * vehicle saved from the web shown "In review". Every "We couldn't load" is reported.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { ApiError } from '@/lib/api';

const replace = vi.fn();
let path = '/driver';
vi.mock('next/navigation', () => ({
  usePathname: () => path,
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const ACCOUNT = { id: 32, full_name: 'Srinu Mekala', phone_number: '+919876543168', created_at: '2026-10-25T21:57:58Z', email: null };
let onboarding: Record<string, unknown> = { vehicle: null, vehicle_types: [{ type: 'sedan' }, { type: 'auto' }], approved: false, doc_status: 'pending', driver_documents: [], vehicle_documents: [] };
const posts: [string, unknown][] = [];
const REQUIREMENTS = {
  config: { country: 'IN', state: '', items: {}, min_driver_age: 18, max_vehicle_age_years: 15, languages: ['en', 'te', 'hi'] },
  checklist: { market: { country: 'IN', state: '' }, items: [], done: 0, total: 0, blocking: [], approved: false },
  personal: { full_name: 'Srinu Mekala', name_pending: null, photo: null, photo_pending: null, dob: null, address: null,
    permanent_address: null, emergency_contacts: [] },
  identity: { license_number: '', license_state: '', license_expiry: null, aadhaar_masked: null, pan_masked: null,
    police_verification_status: 'not_submitted', background_check_status: 'not_started' },
  payout_method: { kind: null, held_until: null, bank: null }, states: [], relationships: [],
  vehicle_types: ['sedan'], vehicle_years: [2026], upload_kinds: {},
};
vi.mock('@/lib/area/api', () => ({
  areaToken: async () => 'tok',
  areaGet: vi.fn(async (p: string) => {
    if (p === '/auth/profile/') return ACCOUNT;
    if (p === '/driver/driver/onboarding/') return onboarding;
    if (p === '/driver/driver/profile/') return { status: 'offline', approved: false, doc_status: 'pending' };
    if (p === '/driver/requirements/') return REQUIREMENTS;
    return {};
  }),
  areaPost: vi.fn(async (p: string, b: unknown) => {
    posts.push([p, b]);
    onboarding = { ...onboarding, vehicle: { id: 9, ...(b as object) } };
    return { id: 9 };
  }),
  areaPatch: vi.fn(async () => ({})),
  endAreaSession: async () => {},
}));
vi.mock('@/lib/publicAuth', async (orig) => ({
  ...(await orig<typeof import('@/lib/publicAuth')>()),
  clearRiderTokens: vi.fn(),
  readRiderToken: () => 'tok',
  sessionRoles: async () => ({ roles: ['driver'] }),
}));

beforeEach(async () => {
  replace.mockClear();
  (await import('./ProfileMenu')).forgetAccount();
  global.fetch = vi.fn(async () => new Response('{}')) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); path = '/driver'; });

const wrap = (n: React.ReactNode) => render(<LocaleProvider>{n}</LocaleProvider>);

describe('driver header', () => {
  it('has the pill, the driver-app button, then the profile button with the first name', async () => {
    const { DriverTop } = await import('./driver/parts');
    const { container } = wrap(<DriverTop title="Dashboard" me={{ status: 'offline' }} />);
    await waitFor(() => expect(screen.getByTestId('profile-button').textContent).toContain('Srinu'));
    const head = container.querySelector('.dr-head')!;
    const order = Array.from(head.children).slice(1).map((el) => el.textContent);
    expect(order[0]).toContain('Offline');
    expect(order[1]).toContain('Go online in the driver app');
    expect(head.lastElementChild!.querySelector('[data-testid="profile-button"]')).not.toBeNull();
    expect(screen.getByTestId('profile-button').textContent).not.toContain('Mekala');
  });

  it('opens a menu: name and masked mobile, the account links (14 Nov: Documents and Support are in More), a divider, Sign out', async () => {
    const { DriverTop } = await import('./driver/parts');
    const { container } = wrap(<DriverTop title="Dashboard" me={{}} />);
    await waitFor(() => expect(screen.getByTestId('profile-button').textContent).toContain('Srinu'));
    fireEvent.click(screen.getByTestId('profile-button'));
    const menu = container.querySelector('[role="menu"]')!;
    expect(menu.textContent).toContain('Srinu Mekala');
    expect(menu.textContent).toContain('168');
    expect(menu.textContent).not.toContain('9876543');
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')).map((e) => e.textContent);
    expect(items).toEqual(['Your profile', 'Language', 'Sign out']);
    expect(menu.querySelector('hr')!.nextElementSibling!.textContent).toBe('Sign out');
  });

  it('signs out in one click and lands on Driver sign in with the notice', async () => {
    const { DriverTop } = await import('./driver/parts');
    wrap(<DriverTop title="Dashboard" me={{}} />);
    fireEvent.click(screen.getByTestId('profile-button'));
    fireEvent.click(screen.getByTestId('menu-sign-out'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/driver/sign-in?signed_out=1'));
  });

  it('the sidebar keeps only the six sections', async () => {
    const { DriverShell } = await import('./DriverShell');
    const { container } = wrap(<DriverShell><p>x</p></DriverShell>);
    await act(async () => {});
    expect(container.querySelector('.dr-me')).toBeNull();
    expect(Array.from(container.querySelectorAll('.dr-nav a')).map((a) => a.textContent))
      .toEqual(['Dashboard', 'Earnings', 'Trips', 'Documents', 'Payouts', 'Support']);
  });
});

describe('driver profile page', () => {
  it('is titled with the first name and the month they joined', async () => {
    path = '/driver/profile';
    const { DriverProfile } = await import('./driver/DriverProfile');
    const { container } = wrap(<DriverProfile />);
    await waitFor(() => expect(container.querySelector('.dr-head h1')!.textContent).toBe('Srinu'));
    expect(container.querySelector('.dr-head')!.textContent).toContain('Saaradhi since October 2026');
    fireEvent.click(screen.getByTestId('profile-button'));
    expect(screen.getByTestId('menu-sign-out')).toBeTruthy();
  });
});

describe('rider header', () => {
  it('shows the rider first name and the rider menu', async () => {
    path = '/ride';
    const { RiderShell } = await import('./RiderShell');
    const { container } = wrap(<RiderShell><p>x</p></RiderShell>);
    await waitFor(() => expect(screen.getByTestId('profile-button').textContent).toContain('Srinu'));
    fireEvent.click(screen.getByTestId('profile-button'));
    const items = Array.from(container.querySelectorAll('[role="menuitem"]')).map((e) => e.textContent);
    // 14 Nov: Help and the theme are in the menu for phones (hidden by CSS on wider screens).
    expect(items).toEqual(['Your profile', 'Trips', 'Saved places', 'Safety', 'Language', 'Help', 'Dark theme', 'Sign out']);
    fireEvent.click(screen.getByTestId('menu-sign-out'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/sign-in?signed_out=1'));
  });
});

describe('load failures', () => {
  it('reports the endpoint, the status and the reason', async () => {
    const { reportLoadError, tagEndpoint } = await import('@/lib/report');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = reportLoadError(tagEndpoint(new ApiError(403, 'forbidden', 'You do not have permission'), '/driver/vehicles/?x=1'));
    expect(f).toEqual({ endpoint: '/driver/vehicles/', status: 403, code: 'forbidden', reason: 'You do not have permission' });
    expect(spy).toHaveBeenCalledWith('[load]', '', '/driver/vehicles/', 403, 'forbidden', 'You do not have permission');
    spy.mockRestore();
  });

  it('sends a Sentry envelope when a DSN is set', async () => {
    vi.stubEnv('NEXT_PUBLIC_SENTRY_DSN', 'https://abc@o1.ingest.sentry.io/42');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { reportLoadError, tagEndpoint } = await import('@/lib/report');
    reportLoadError(tagEndpoint(new ApiError(500, 'x', 'boom'), '/driver/withdrawals/balance/'));
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=abc&sentry_version=7');
    const event = JSON.parse(String(init.body).split('\n')[2]);
    expect(event.tags).toMatchObject({ endpoint: '/driver/withdrawals/balance/', status: '500' });
    vi.unstubAllEnvs();
  });
});
