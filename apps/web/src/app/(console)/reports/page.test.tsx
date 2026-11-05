import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from '@/lib/api';
import Page from './page';

vi.mock('next/link', () => ({
  default: function LinkStub({ href, children, ...rest }: React.ComponentProps<'a'> & { href: string }) {
    return <a href={href} {...rest}>{children}</a>;
  },
}));

describe('reports catalogue', () => {
  it('has the page head, links each report and stamps in the market zone', async () => {
    render(<Page />);
    expect(screen.getByRole('heading', { name: 'Reports' })).toBeTruthy();
    const link = await screen.findByRole('link', { name: /Trips/ });
    expect(link.getAttribute('href')).toBe('/reports/trips');
    expect(screen.getByText(/Data as of 02 Jan, 05:30 IST/)).toBeTruthy();
  });
});

beforeEach(() => {
  window.localStorage.setItem(TOKEN_KEY, 'access-1');
  const data = {
    areas: [{ area: 'Operations', reports: [{ key: 'trips', area: 'Operations', title: 'Trips', description: 'Requested and completed', money: false, groups: [], default_group: '' }] }],
    cities: [{ code: 'HYD', name: 'Hyderabad', currency: 'INR', timezone: 'Asia/Kolkata' }],
    vehicle_types: [], granularities: ['day'], max_range_days: 90, as_of: '2026-01-02T00:00:00Z',
  };
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data }) })));
});
afterEach(() => cleanup());
