import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TodayPanel, type TodayPayload } from './TodayPanel';

const base: TodayPayload = {
  generated_at: '2026-11-22T10:00:00Z', refresh: 'Updated every minute', money: true, all_clear: false,
  countries: [
    { code: 'IN', name: 'India', currency: 'INR', requests: 12, completed: 9, completion_rate: 75, sos_open: 1,
      payouts_waiting: 2, payouts_waiting_minor: 100000, revenue_minor: 210000, live_cities: 1 },
    { code: 'US', name: 'United States', currency: 'USD', requests: 0, completed: 0, completion_rate: null, sos_open: 0,
      payouts_waiting: 0, payouts_waiting_minor: 0, revenue_minor: 0, live_cities: 0 },
  ],
  cities: [{
    code: 'IN-TG-HYD', name: 'Hyderabad', country: 'IN', timezone: 'Asia/Kolkata', waiting: 3, drivers_online: 4,
    drivers_link: '/ops/drivers?status=online&scope=IN-TG-HYD',
    actions: [
      { key: 'sos', label: 'Open SOS', count: 1, link: '/ops/safety-ops?scope=IN-TG-HYD', urgent: true },
      { key: 'payouts', label: 'Payouts waiting', count: 2, link: '/ops/finance/payouts?status=pending&scope=IN-TG-HYD' },
      { key: 'kyc', label: 'KYC waiting', count: 0, link: '/ops/kyc?scope=IN-TG-HYD' },
    ],
  }],
};

describe('Today (22 Nov)', () => {
  afterEach(cleanup);
  it('shows one tile per country, each in its own currency, and opens it', () => {
    const open = vi.fn();
    render(<TodayPanel data={base} onOpenCountry={open} />);
    expect(screen.getByRole('button', { name: 'Open India' }).textContent).toContain('₹');
    expect(screen.getByRole('button', { name: 'Open United States' }).textContent).toContain('$');
    fireEvent.click(screen.getByRole('button', { name: 'Open India' }));
    expect(open).toHaveBeenCalledWith('IN');
  });

  it('lists only what waits in a live city, each linking to its list; a zero is not shown', () => {
    render(<TodayPanel data={base} onOpenCountry={() => undefined} />);
    expect(screen.getByRole('link', { name: /1 Open SOS/ }).getAttribute('href')).toBe('/ops/safety-ops?scope=IN-TG-HYD');
    expect(screen.getByRole('link', { name: /2 Payouts waiting/ })).toBeTruthy();
    expect(screen.queryByText(/KYC waiting/)).toBeNull();
  });

  it('is one line when nothing waits anywhere', () => {
    const clear = { ...base, all_clear: true, cities: [{ ...base.cities[0], waiting: 0, actions: [] }] };
    render(<TodayPanel data={clear} onOpenCountry={() => undefined} />);
    expect(screen.getByRole('status').textContent).toMatch(/All clear\. Nothing waits in Hyderabad · 4 drivers online/);
  });

  it('a single-country view has no country tiles', () => {
    render(<TodayPanel data={{ ...base, countries: [base.countries[0]] }} onOpenCountry={() => undefined} />);
    expect(screen.queryByRole('button', { name: /Open India/ })).toBeNull();
  });
});
