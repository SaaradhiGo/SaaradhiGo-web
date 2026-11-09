/**
 * MVAG 2025 and the payout ruling (9 Nov): the rider reads the fare's workings with
 * "Higher demand" (never "surge") and a due cancellation fee before booking; the console
 * states a cycle and an instant fee in words, with SaaradhiGo's fee at 0.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { cycleWords, instantWords } from '@/components/console/finance/PayoutScopes';
import { FareWorkings } from './rider/FareWorkings';

describe('FareWorkings', () => {
  it('shows the base fare, the demand line, the tax and the due fee, and never the word surge', () => {
    const { container } = render(
      <LocaleProvider>
        <FareWorkings quote={{
          estimated_fare: '268.00', currency: 'INR',
          fare_breakdown: { base_fare: '60.00', distance_fare: '114.07', time_fare: '32.00', surge_multiplier: '1.30',
            demand_label: 'Higher demand', tax_label: 'GST', tax_amount: '12.76', tax_mode: 'inclusive' },
          cancellation_due: { amount: '43.70', currency: 'INR', trip_ids: [9] },
        }} />
      </LocaleProvider>,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Higher demand');
    expect(text).toContain('×1.30');
    expect(text).toContain('GST (included)');
    expect(text).toMatch(/cancellation fee of .*43\.70/);
    expect(text.toLowerCase()).not.toContain('surge');
  });
});

describe('payout words', () => {
  it('states the cycle and the instant fee rule', () => {
    expect(cycleWords({ payout_schedule: 'every_n_days', payout_interval_days: 5, payout_anchor_date: '2026-11-05', payout_time_local: '10:00' }))
      .toBe('Every 5 days from 2026-11-05 at 10:00');
    expect(cycleWords({ payout_schedule: 'weekly', payout_weekday: 0, payout_time_local: '10:00' })).toBe('Weekly on Monday at 10:00');
    const words = instantWords({ instant_cashout_enabled: true, instant_fee_provider: 'RazorpayX',
      instant_fee_tiers: [[99999, 472], [null, 1062]] }, 'INR');
    expect(words).toContain('charged by RazorpayX');
    expect(words).toContain('SaaradhiGo fee 0');
    expect(instantWords({ instant_cashout_enabled: false }, 'INR')).toBe('Off');
  });
});
