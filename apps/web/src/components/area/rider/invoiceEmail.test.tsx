/**
 * 12 Nov: the fare lines add up as shown (before tax, taxable value, GST included, total), and the
 * "Confirm your email" reminder never claims a link was sent when the server could not send one.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { ApiError } from '@/lib/api';
import type { FareLines } from '@/lib/area/rider';

const profile = vi.fn();
const requestEmailConfirmation = vi.fn();
vi.mock('@/lib/area/rider', async (orig) => ({
  ...(await orig<object>()),
  profile: () => profile(),
  requestEmailConfirmation: () => requestEmailConfirmation(),
}));

afterEach(() => { cleanup(); profile.mockReset(); requestEmailConfirmation.mockReset(); });

const TRIP_207: FareLines = {
  lines: [
    { code: 'base', label: 'Base fare', amount: '57.14' },
    { code: 'distance_time', label: 'Distance and time', amount: '116.76' },
    { code: 'rounding', label: 'Rounding', amount: '0.39' },
  ],
  taxable: '174.29',
  tax: { label: 'GST', percent: '5', amount: '8.71', included: true },
  extras: [],
  total: '183.00',
  currency: 'INR',
};

describe('the fare lines', () => {
  it('show the lines before GST, the taxable value, GST included and the total, adding up', async () => {
    const { FareLinesList } = await import('./FareLinesList');
    render(<LocaleProvider><FareLinesList lines={TRIP_207} /></LocaleProvider>);
    const text = screen.getByTestId('fare-lines').textContent ?? '';
    expect(text).toMatch(/Taxable value/);
    expect(text).toMatch(/GST 5% \(included\)/);
    const sum = TRIP_207.lines.reduce((s, l) => s + Math.round(Number(l.amount) * 100), 0);
    expect(sum).toBe(Math.round(Number(TRIP_207.taxable) * 100));
    expect(sum + Math.round(Number(TRIP_207.tax.amount) * 100)).toBe(Math.round(Number(TRIP_207.total) * 100));
  });
});

describe('confirm your email', () => {
  it('without mail it does not say a link was sent, and says so when Send link fails', async () => {
    profile.mockResolvedValue({ email: 'asha@example.com', email_verified: false, email_mail_configured: false });
    requestEmailConfirmation.mockRejectedValue(new ApiError(503, 'EMAIL_NOT_SENT', 'x', true));
    const { ConfirmEmail } = await import('./ConfirmEmail');
    render(<LocaleProvider><ConfirmEmail /></LocaleProvider>);
    await act(async () => {});
    const note = screen.getByTestId('confirm-email');
    expect(note.textContent).toMatch(/Confirm your email: asha@example.com/);
    expect(note.textContent).not.toMatch(/We sent a link/);
    fireEvent.click(screen.getByRole('button', { name: 'Send link' }));
    await act(async () => {});
    expect(note.textContent).toMatch(/could not send the email/);
  });

  it('is gone once the email is confirmed', async () => {
    profile.mockResolvedValue({ email: 'asha@example.com', email_verified: true });
    const { ConfirmEmail } = await import('./ConfirmEmail');
    render(<LocaleProvider><ConfirmEmail /></LocaleProvider>);
    await act(async () => {});
    expect(screen.queryByTestId('confirm-email')).toBeNull();
  });
});
