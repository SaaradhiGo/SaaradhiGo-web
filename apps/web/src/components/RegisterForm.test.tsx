/**
 * Email sign-up proves the number by SMS before the account is created
 * (AUDIT 27.78, H4). Before, "Create account" posted straight to
 * /auth/email/register/ with whatever number was typed.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const registerAccount = vi.fn(async (_input: unknown) => ({ verification_required: true }));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: unknown; href: string }) => <a href={href}>{children as never}</a> }));
vi.mock('@/components/PhoneField', () => ({
  default: ({ national, onNationalChange }: { national: string; onNationalChange: (v: string) => void }) => (
    <input aria-label="Mobile number" value={national} onChange={(e) => onNationalChange(e.target.value)} />
  ),
  usePhoneMarkets: () => ({
    markets: { default_country: 'IN', countries: [{ code: 'IN', calling_code: '91', national_number_lengths: [10] }] },
    failed: false,
  }),
}));
vi.mock('@/lib/publicAuth', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/publicAuth')>();
  return {
    ...original,
    phoneAllowedForOtp: () => true,
    otpSendingEnabled: () => true,
    sendPublicOtp: vi.fn(async (phone: string) => { calls.push(`otp:${phone}`); return {}; }),
    verifyPhoneForSignup: vi.fn(async (phone: string, otp: string) => {
      calls.push(`verify:${phone}:${otp}`);
      return { phone_proof: 'proof-for-' + phone };
    }),
    registerAccount: (input: unknown) => { calls.push('register'); return registerAccount(input); },
  };
});

import RegisterForm from './RegisterForm';
import { LocaleProvider } from '@/i18n/LocaleProvider';

function fill(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('RegisterForm, email route', () => {
  beforeEach(() => {
    calls.length = 0;
    registerAccount.mockClear();
  });

  it('texts a code, verifies it, then creates the account with the proof', async () => {
    render(<LocaleProvider><RegisterForm role="rider" /></LocaleProvider>);
    fill('Full name', 'Asha Rao');
    fill('Mobile number', '9876543210');
    fill('Email', 'asha@example.test');
    fill('Password', 'Monsoon-Ferry-2026!');
    fill('Confirm password', 'Monsoon-Ferry-2026!');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(calls).toEqual(['otp:+919876543210']));
    expect(registerAccount).not.toHaveBeenCalled();

    fill(/Code sent to/, '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and create account' }));

    await waitFor(() => expect(registerAccount).toHaveBeenCalledTimes(1));
    expect(calls).toEqual(['otp:+919876543210', 'verify:+919876543210:123456', 'register']);
    expect(registerAccount.mock.calls[0][0]).toMatchObject({
      phone: '+919876543210', phoneProof: 'proof-for-+919876543210',
    });
  });
});
