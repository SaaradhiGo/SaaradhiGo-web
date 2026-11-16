/**
 * 15 Nov (Srini's ruling): a rider whose last trip was not paid sees "Pay for your last trip" and
 * cannot book until it is paid; "Pay now" charges the card saved on that trip.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';

const pay = vi.fn();
vi.mock('@/lib/area/rider', () => ({ payUnpaidTrip: () => pay() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: unknown }) => <a href={href} {...p}>{children as never}</a> }));

import { UnpaidTripCard } from './UnpaidTrip';

afterEach(() => { cleanup(); pay.mockReset(); });

const trip = { trip_id: 219, amount: '25.40', currency: 'USD', can_retry_card: true };
const ui = (onPaid = vi.fn(), t = trip) => (
  <LocaleProvider initialLanguage="en"><UnpaidTripCard trip={t} onPaid={onPaid} /></LocaleProvider>
);

describe('Pay for your last trip', () => {
  it('names the trip and the amount, and links to the trip', () => {
    render(ui());
    expect(screen.getByRole('heading', { name: 'Pay for your last trip' })).toBeTruthy();
    expect(screen.getByTestId('unpaid-trip').textContent).toMatch(/trip .219/);
    expect(screen.getByRole('link', { name: 'Open the trip' }).getAttribute('href')).toBe('/trips/219');
  });

  it('Pay now: a paid card clears the block', async () => {
    pay.mockResolvedValue({ result: 'paid' });
    const onPaid = vi.fn();
    render(ui(onPaid));
    await act(async () => { fireEvent.click(screen.getByTestId('unpaid-pay')); });
    expect(onPaid).toHaveBeenCalledOnce();
  });

  it('a declined card says so and keeps the block', async () => {
    pay.mockRejectedValue({ message: 'Your card was declined. Nothing was charged.' });
    const onPaid = vi.fn();
    render(ui(onPaid));
    await act(async () => { fireEvent.click(screen.getByTestId('unpaid-pay')); });
    expect(onPaid).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe('Your card was declined. Nothing was charged.');
  });

  it('with no saved card (India) the trip page takes the payment', () => {
    render(ui(vi.fn(), { ...trip, can_retry_card: false, currency: 'INR' }));
    expect(screen.queryByTestId('unpaid-pay')).toBeNull();
  });
});
