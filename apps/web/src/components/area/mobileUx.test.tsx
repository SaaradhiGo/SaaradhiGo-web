/**
 * 14 Nov (owner, mobile UX): a guest sees the fares and is asked to sign in only at Book, with the
 * trip and the chosen class kept; with no driver free, the choose screen says so with Try again and
 * "Tell me when one's free", never a dead grey Book; the driver's More is a real button that
 * Escape closes (focus back), and opening the avatar menu closes it.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';

const push = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => '/driver',
  useRouter: () => ({ replace: vi.fn(), push, refresh: vi.fn() }),
  useSearchParams: () => search,
}));
vi.mock('@/components/MapSurface', () => ({ default: () => null }));
vi.mock('./useArea', () => ({
  useArea: () => ({ roles: [], both: false, signOut: vi.fn(), switchTo: vi.fn() }),
  areaPath: (p: string | null) => p ?? '/',
}));
vi.mock('@/lib/area/api', () => ({
  areaToken: async () => null, areaGet: async () => ({}), areaPost: async () => ({}), endAreaSession: async () => {},
}));

let nearby = true;
vi.mock('@/lib/booking', async (orig) => ({
  ...(await orig<typeof import('@/lib/booking')>()),
  serviceabilityAt: async () => ({ serviceable: true, zone: { country: 'IN' }, vehicle_types: [{ type: 'auto' }, { type: 'sedan' }] }),
  routeBetween: async () => ({ distanceMeters: 18800, durationSeconds: 1920, distanceText: '18.8 km', durationText: '32 min', points: null }),
  quoteFare: async ({ vehicleType }: { vehicleType: string }) => ({
    estimated_fare: vehicleType === 'auto' ? '304.00' : '512.00', currency: 'INR', drivers_nearby: nearby, pickup_eta_min: nearby ? 4 : null,
  }),
}));

import { saveDraft, readDraft } from '@/lib/area/rider';
import { RideChoose } from './rider/RideChoose';
import { DriverShell } from './DriverShell';
import { ProfileMenu } from './ProfileMenu';

const wrap = (ui: React.ReactNode) => render(<LocaleProvider>{ui}</LocaleProvider>);

describe('choose screen (14 Nov)', () => {
  beforeEach(() => {
    push.mockReset();
    nearby = true;
    const id = saveDraft({
      from: { lat: 17.44, lng: 78.38, label: 'Cyber Towers, HITEC City, Hyderabad, Telangana, India', short: 'Cyber Towers, HITEC City' },
      to: { lat: 17.36, lng: 78.47, label: 'Charminar, Ghansi Bazaar, Hyderabad, Telangana, India', short: 'Charminar, Ghansi Bazaar' },
    });
    search = new URLSearchParams({ d: id });
  });
  afterEach(() => { cleanup(); sessionStorage.clear(); });

  it('a guest sees the fares and one route line; Book asks for sign-in and keeps the choice', async () => {
    wrap(<RideChoose guest />);
    await screen.findByTestId('class-sedan');
    expect(screen.getByTestId('choose-pickup').textContent).toBe('Cyber Towers, HITEC City');
    expect(screen.getByTestId('trip-line').textContent).toContain('18.8 km · 32 min');
    fireEvent.click(screen.getByTestId('class-sedan'));
    expect(screen.getByTestId('class-sedan').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('book').textContent).toMatch(/Book .*512/);
    expect(screen.getByTestId('pay-cash').textContent).toContain('Pay the driver at the end');
    fireEvent.click(screen.getByTestId('book'));
    const id = search.get('d')!;
    expect(push).toHaveBeenCalledWith(`/sign-in?why=book&next=${encodeURIComponent(`/ride/choose?d=${id}`)}`);
    expect(readDraft(id)?.pick).toBe('sedan');
  });

  it('back from sign-in, the class chosen before is chosen again', async () => {
    const id = search.get('d')!;
    sessionStorage.setItem(`sg-ride-draft:${id}`, JSON.stringify({ ...readDraft(id), pick: 'sedan' }));
    wrap(<RideChoose />);
    await waitFor(() => expect(screen.getByTestId('class-sedan').getAttribute('aria-checked')).toBe('true'));
  });

  it('no driver free: says so with Try again and Tell me, and no grey Book', async () => {
    nearby = false;
    wrap(<RideChoose guest />);
    await screen.findByTestId('no-drivers');
    expect(screen.getByText('No drivers nearby right now')).toBeTruthy();
    expect(screen.getByTestId('retry-drivers')).toBeTruthy();
    expect(screen.getByTestId('watch-drivers').textContent).toBe("Tell me when one's free");
    expect(screen.queryByTestId('book')).toBeNull();
  });
});

describe('driver menus (14 Nov)', () => {
  it('More is a button with aria-expanded; Escape closes it and focus returns; the avatar menu closes it', async () => {
    wrap(<><DriverShell><p>x</p></DriverShell><ProfileMenu links={[{ href: '/driver/profile', label: 'Your profile' }]} onSignOut={() => {}} /></>);
    await act(async () => {});
    const more = screen.getByTestId('driver-more');
    expect(more.tagName).toBe('BUTTON');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const menu = document.getElementById('dr-more-menu')!;
    expect([...menu.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Documents', 'Support']);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(more);
    fireEvent.click(more);
    fireEvent.click(screen.getByTestId('profile-button'));
    expect(more.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('menu')).toBeTruthy();
    // The bar's first tab is Home, not Dashboard.
    expect(screen.getByTestId('driver-tabbar').querySelector('a')!.textContent).toBe('Home');
  });
});
