'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api';
import {
  OTP_DISABLED_MESSAGE,
  PublicRole,
  looksLikePhone,
  otpSendingEnabled,
  sendPublicOtp,
  verifyPublicOtp,
} from '@/lib/publicAuth';

/**
 * The phone -> code -> session form, shared by all four public auth pages.
 *
 * Rider sign-in, rider sign-up, driver sign-in and driver sign-up are the
 * same two steps against the same endpoints; the backend creates the account
 * on first successful code, so "sign up" and "sign in" differ in wording and
 * in the role the code is bound to, not in mechanism. Four near-identical
 * copies of this form would drift apart, and the SMS gate would end up
 * enforced in three of them.
 */
export default function OtpAuthForm({
  role,
  mode,
  onDone,
}: {
  role: PublicRole;
  mode: 'sign-in' | 'sign-up';
  onDone?: () => void;
}) {
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'phone' | 'otp'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const sendingEnabled = otpSendingEnabled();

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!looksLikePhone(phone)) {
      setError('Enter the number in international format, like +919876543210.');
      return;
    }

    setBusy(true);
    try {
      await sendPublicOtp(phone, role);
      setStage('otp');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not send the code.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyPublicOtp(phone, otp);
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That code did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card" role="status">
        <h2 className="text-lg font-semibold text-brand">You are signed in</h2>
        <p className="mt-2 text-sm text-white/70">
          Your SaaradhiGo account is ready. Rides are booked in the Android
          app — this site signs you in so support can find your account.
        </p>
        <Link href="/" className="btn-primary inline-block mt-4">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      {!sendingEnabled && (
        <p
          className="text-sm text-amber-200 bg-amber-900/30 border border-amber-800/40 rounded-lg p-3"
          role="note"
        >
          {OTP_DISABLED_MESSAGE}
        </p>
      )}

      {error && (
        <p
          className="mt-3 text-sm text-red-300 bg-red-900/30 border border-red-900/40 rounded-lg p-3"
          role="alert"
        >
          {error}
        </p>
      )}

      {stage === 'phone' ? (
        <form onSubmit={submitPhone} className="mt-4 space-y-3" noValidate>
          <label htmlFor="phone" className="block text-sm text-white/70">
            Mobile number
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            className="input w-full"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+919876543210"
            required
          />
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={busy || !sendingEnabled}
          >
            {busy ? 'Sending…' : 'Send code'}
          </button>
          <p className="text-xs text-white/50">
            {mode === 'sign-up'
              ? 'We create your account the first time you confirm a code. No password to remember.'
              : 'We send a one-time code to this number. No password to remember.'}
          </p>
        </form>
      ) : (
        <form onSubmit={submitOtp} className="mt-4 space-y-3" noValidate>
          <label htmlFor="otp" className="block text-sm text-white/70">
            Code sent to {phone}
          </label>
          <input
            id="otp"
            name="otp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="input w-full tracking-widest"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="123456"
            required
          />
          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Checking…' : 'Confirm'}
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => {
              setStage('phone');
              setOtp('');
              setError(null);
            }}
          >
            Use a different number
          </button>
        </form>
      )}
    </div>
  );
}
