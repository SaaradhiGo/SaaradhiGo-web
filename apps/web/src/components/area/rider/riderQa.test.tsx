/**
 * Rider QA fixes (11 Nov): the pickup is a field that says what is missing, location denied keeps
 * the search usable, the trip stays out of the URL, the mobile step resends after 30 s, cancel
 * reasons follow the state with nothing preselected, and the periods have the right bounds.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { CANCEL_BEFORE_DRIVER, CANCEL_WITH_DRIVER } from '@/lib/booking';
import { readDraft, saveDraft } from '@/lib/area/rider';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  usePathname: () => '/ride',
  useRouter: () => ({ replace: vi.fn(), push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/area/api', () => ({
  areaToken: async () => null,
  areaGet: async () => [],
  areaPost: async () => ({}),
  endAreaSession: async () => {},
}));
const sendPublicOtp = vi.fn(async () => ({}));
vi.mock('@/lib/publicAuth', async (orig) => ({ ...(await orig<object>()), sendPublicOtp: (...a: unknown[]) => sendPublicOtp(...(a as [])) }));

afterEach(() => { cleanup(); vi.useRealTimers(); push.mockReset(); });

describe('ride home pickup', () => {
  it('See fares names the missing field under it, and location denied keeps the search', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() },
    });
    const { RideHome } = await import('./RideHome');
    render(<LocaleProvider><RideHome /></LocaleProvider>);
    await act(async () => {});
    expect(screen.getByTestId('pickup-input')).toBeTruthy();
    fireEvent.click(screen.getByTestId('use-my-location'));
    await act(async () => {});
    expect(screen.getByTestId('location-note').textContent).toMatch(/Location is off/);
    fireEvent.click(screen.getByRole('button', { name: 'See fares' }));
    expect(screen.getByTestId('pickup-error').textContent).toMatch(/Set your pickup/);
    expect(screen.getByTestId('drop-error').textContent).toMatch(/Choose where you are going/);
    expect(screen.getByTestId('pickup-input').getAttribute('aria-invalid')).toBe('true');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('the trip draft', () => {
  it('keeps coordinates out of the URL', () => {
    const id = saveDraft({ from: { lat: 17.44, lng: 78.37, label: 'Road 4, Madhapur' }, to: { lat: 17.36, lng: 78.47, label: 'Charminar' } });
    expect(id).toMatch(/^[a-z0-9]+$/);
    expect(id).not.toContain('17.44');
    expect(readDraft(id)?.to.label).toBe('Charminar');
  });
});

describe('the mobile at first booking', () => {
  it('offers Resend only after 30 seconds', async () => {
    vi.useFakeTimers();
    const { PhoneStep } = await import('./PhoneStep');
    render(<LocaleProvider><PhoneStep country="IN" onDone={vi.fn()} onClose={vi.fn()} /></LocaleProvider>);
    fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '9876543210' } });
    await act(async () => { fireEvent.submit(screen.getByTestId('phone-step')); });
    expect(sendPublicOtp).toHaveBeenCalledWith('+919876543210', 'rider');
    expect(screen.getByText(/Resend in 30 s/)).toBeTruthy();
    for (let i = 0; i < 30; i += 1) await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.getByRole('button', { name: 'Resend code' })).toBeTruthy();
  });
});

describe('cancel reasons', () => {
  it('follow the trip state', () => {
    const before = CANCEL_BEFORE_DRIVER.map((r) => r.value);
    expect(before).toEqual(['changed_plans', 'booked_by_mistake', 'too_long', 'other']);
    expect(CANCEL_WITH_DRIVER.map((r) => r.value)).toEqual([...before, 'no_show', 'wrong_location', 'safety']);
  });
});
