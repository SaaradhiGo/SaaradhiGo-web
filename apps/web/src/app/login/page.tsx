'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, loginWithOtp, requestOtp } from '@/lib/api';

// Phase-0 admin login uses the same OTP flow as the mobile clients --
// admin role is bound at the user model. Once the OTP succeeds and the
// access token is stored, we drop the user on /dashboard.
export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'phone' | 'otp'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmitPhone(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestOtp(phone);
      setStage('otp');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send OTP');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitOtp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await loginWithOtp(phone, otp);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Invalid OTP');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-semibold text-brand">SaaradhiGo Ops</h1>
        <p className="text-sm text-white/60 mt-1">
          Sign in with your admin phone number.
        </p>
        {error && (
          <p className="mt-3 text-sm text-red-400 bg-red-900/30 border border-red-900/40 rounded-lg p-2">
            {error}
          </p>
        )}
        {stage === 'phone' ? (
          <form onSubmit={onSubmitPhone} className="mt-5 space-y-3">
            <label className="block text-sm text-white/70">Phone</label>
            <input
              className="input w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+919876543210"
              autoComplete="tel"
              required
            />
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitOtp} className="mt-5 space-y-3">
            <label className="block text-sm text-white/70">OTP for {phone}</label>
            <input
              className="input w-full"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="6-digit OTP"
              inputMode="numeric"
              required
            />
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? 'Verifying...' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => setStage('phone')}
              className="btn-ghost block w-full text-center"
            >
              Use a different phone
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
