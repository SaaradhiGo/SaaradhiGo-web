/**
 * The daily Withdraw now limit (10 Nov): the console states it in words, and the driver's
 * confirmation shows the reason before they tap, with no confirm button.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { instantWords, limitWords } from '@/components/console/finance/PayoutScopes';
import type { Balance } from '@/lib/area/driver';

const MESSAGE = 'Daily limit reached: 3 instant withdrawals. Your next scheduled payout is 15 Nov.';

vi.mock('@/lib/area/api', () => ({
  areaGet: vi.fn(async () => ({
    amount: '200.00', provider_fee: '4.72', provider_fee_label: 'Provider fee (charged by RazorpayX)',
    saaradhigo_fee: '0.00', you_receive: '195.28', currency: 'INR', destination: 'UPI ••kaxis',
    arrival: 'Usually within 30 minutes', valid: false, limit_reached: true, limit_message: MESSAGE,
  })),
  areaPost: vi.fn(),
}));

describe('limitWords', () => {
  it('states the count and the total, or says there is none', () => {
    expect(limitWords({ instant_max_per_day: 3, instant_max_amount_per_day_minor: 5_000_000 }, 'INR'))
      .toBe('at most 3 a day and ₹50,000.00 a day');
    expect(limitWords({}, 'INR')).toBe('no daily limit');
    expect(instantWords({ instant_cashout_enabled: true, instant_max_per_day: 3 }, 'INR')).toContain('at most 3 a day');
  });
});

describe('WithdrawNow confirmation', () => {
  it('shows the reason and no confirm button when the limit is reached', async () => {
    const { WithdrawNow } = await import('./WithdrawNow');
    const bal = { available_balance: 200, currency: 'INR', instant: { available: true } } as unknown as Balance;
    render(<LocaleProvider><WithdrawNow bal={bal} onDone={() => {}} /></LocaleProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw now' }));
    fireEvent.click(screen.getByRole('button', { name: 'See the fee' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe(MESSAGE));
    expect(screen.queryByRole('button', { name: /Withdraw ₹/ })).toBeNull();
  });
});
