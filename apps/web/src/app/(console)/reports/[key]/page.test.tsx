import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ key: 'trips' }),
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams('from=2026-01-01&to=2026-01-07'),
}));
vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

const CITY = { code: 'HYD', name: 'Hyderabad', currency: 'INR', timezone: 'Asia/Kolkata' };
const CARD = { key: 'trips', area: 'Operations', title: 'Trips', description: 'Requested and completed', money: false, groups: [], default_group: '' };
const CATALOGUE = { areas: [{ area: 'Operations', reports: [CARD] }], cities: [CITY], vehicle_types: [], granularities: ['day'], max_range_days: 90, as_of: null };
const BODY = {
  report: { ...CARD, definitions: ['A trip is counted once.'] },
  params: { from: '2026-01-01', to: '2026-01-07', granularity: 'day', city: '', vehicle: '', group_by: '' },
  scope: { cities: [CITY] }, currencies: [], as_of: '2026-01-02T00:00:00Z',
  columns: [{ key: 'trips_requested', label: 'Trips requested', type: 'count' }],
  rows: [{ period: '2026-01-01', trips_requested: 5 }], totals: [{ trips_requested: 5 }], extra: {},
};

describe('report view', () => {
  it('shows the head, a metric card, the market-time stamp, and a preset applies', async () => {
    render(<Page />);
    expect(await screen.findByRole('heading', { name: 'Trips' })).toBeTruthy();
    expect(await screen.findByText(/Data as of 02 Jan, 05:30 IST/)).toBeTruthy();
    expect(screen.getAllByText('Trips requested').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'All reports' }).getAttribute('href')).toBe('/reports');
    const group = screen.getByRole('group', { name: 'Date presets' });
    fireEvent.click(group.querySelector('button')!);
    expect(push).toHaveBeenCalled();
  });
});

beforeEach(() => {
  push.mockClear();
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true, status: 200,
    json: async () => ({ status: 'success', data: /catalogue/.test(String(url)) ? CATALOGUE : BODY }),
  })));
});
afterEach(() => cleanup());
