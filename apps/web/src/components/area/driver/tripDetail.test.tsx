/**
 * 15 Nov (US round 4): the driver's trip detail says when the trip's earnings were paid out.
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';

const get = vi.fn();
vi.mock('@/lib/area/api', async (orig) => ({ ...(await orig<object>()), areaGet: (p: string) => get(p) }));

import { TripDetail } from './TripDetail';

afterEach(() => { cleanup(); get.mockReset(); });

const trip = {
  id: 217, status: 'completed', currency: 'USD', pickup_address: '1200 W Main St, Boise', destination_address: 'Boise Airport',
  requested_at: null, started_at: '2026-11-14T19:10:00-07:00', completed_at: '2026-11-14T19:30:00-07:00',
  distance_km: '11.1', duration_min: '20', ride_class: 'sedan', payment_method: 'card', fare: '29.90',
  platform_fee: '0.00', platform_fee_refunded: null, tips: '5.00', earned: '34.90', cash_in_hand: null,
  rider: { first_name: 'Avery', rating: null }, payment: 'settled', settled_at: '2026-11-14T19:30:05-07:00',
};
const ui = () => <LocaleProvider initialLanguage="en"><TripDetail id={217} onClose={() => {}} /></LocaleProvider>;

describe('Trip detail: paid out', () => {
  it('shows the payout date once the trip was paid out', async () => {
    get.mockResolvedValue({ ...trip, paid_out_at: '2026-11-16T09:00:00-07:00' });
    render(ui());
    await waitFor(() => expect(screen.getByTestId('paid-out').textContent).toMatch(/^Paid out .*16/));
  });

  it('says not yet before the payout, and nothing for a cash trip', async () => {
    get.mockResolvedValue({ ...trip, paid_out_at: null });
    render(ui());
    await waitFor(() => expect(screen.getByTestId('paid-out').textContent).toBe('Not paid out yet'));
    cleanup();
    get.mockResolvedValue({ ...trip, payment_method: 'cash', cash_in_hand: '29.90', paid_out_at: null });
    render(ui());
    await waitFor(() => expect(screen.getByTestId('trip-fare-lines')).toBeTruthy());
    expect(screen.queryByTestId('paid-out')).toBeNull();
  });
});
