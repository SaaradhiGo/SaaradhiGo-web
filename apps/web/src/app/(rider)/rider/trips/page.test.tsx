/** Your trips: the charged amount with its symbol, statuses in words (owner, 2026-11-05). */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/publicAuth', () => ({
  readRiderToken: () => 'token',
  messageFor: (_e: unknown, fallback: string) => fallback,
}));
vi.mock('@/lib/booking', () => ({
  rideHistory: async () => [
    {
      id: 1,
      status: 'completed',
      pickup_address: 'Cyber Towers',
      destination_address: 'Inorbit Mall',
      final_fare: '185.00',
      payment_status: 'completed',
      requested_at: '2026-11-05T13:00:00Z',
    },
    {
      id: 2,
      status: 'cancelled',
      pickup_address: 'QA Pickup',
      destination_address: 'QA Drop',
      final_fare: '100.50',
      payment_status: 'pending',
    },
  ],
}));

import MyTripsPage from './page';

describe('Your trips', () => {
  it('shows the amount with its symbol and the status in words', async () => {
    render(<MyTripsPage />);
    await waitFor(() => expect(screen.getAllByTestId('trip-row')).toHaveLength(2));
    expect(screen.getByText('₹185')).toBeTruthy();
    expect(screen.getByText('₹100.50')).toBeTruthy();
    expect(screen.getByText('Completed')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText('Payment pending')).toBeTruthy();
    expect(screen.queryByText(/Payment: completed/)).toBeNull();
  });
});
