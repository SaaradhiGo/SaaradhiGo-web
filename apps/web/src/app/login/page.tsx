'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  adminLoginWithPassword,
  loginWithOtp,
  requestOtp,
} from '@/lib/api';

/**
 * Operator sign-in.
 *
 * EMAIL AND PASSWORD IS THE PRIMARY ROUTE, AND IT DID NOT EXIST.
 *
 * This screen was phone + one-time code and nothing else -- the same route
 * the rider and driver apps use. An operator account identified by an email
 * address and a password, which is how `admin@saaradhigo.com` was created,
 * had no door at all: the code route is keyed on a phone number and the
 * password endpoint accepted only a phone number. "Sign in as admin with
 * your email and password" was not something anybody could do.
 *
 * It goes to `/auth/admin/login/`, not to the rider's `/auth/email/login/`.
 * That endpoint enforces `is_operator` BEFORE it mints a token, so a session
 * from it always belongs to an account allowed to operate the platform --
 * and it is the one that demands a second factor where the environment
 * requires one. A rider's correct password is refused here with the same
 * words as a wrong one, which is deliberate: anything that distinguishes
 * them turns this form into an oracle.
 *
 * The code route stays as the alternative, because operators onboarded by
 * phone still exist and removing it would strand them.
 */
export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'otp'>('password');

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  // Only ever asked for AFTER a correct password, and only on an
  // environment that enforces a second factor for operators.
  const [mfaCode, setMfaCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);

  const [phone, setPhone] = useState('+91');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'phone' | 'otp'>('phone');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fail(err: unknown, fallback: string) {
    // Only text the server wrote for a person is shown. "HTTP 502" is for
    // the log, not for an operator at three in the morning.
    if (err instanceof ApiError && err.fromServer && err.message) {
      setError(err.message);
      return;
    }
    setError(fallback);
  }

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLoginWithPassword(identifier, password, mfaCode || undefined);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AUTH_MFA_REQUIRED') {
        // Not a failure: the first factor was accepted and the second is
        // now being asked for. Say exactly that rather than "invalid".
        setNeedsMfa(true);
        setError('Enter the 6-digit code from your authenticator app.');
      } else {
        setNeedsMfa(false);
        fail(err, 'We could not sign you in.');
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitPhone(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestOtp(phone);
      setStage('otp');
    } catch (err) {
      fail(err, 'Could not send the code.');
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
      fail(err, 'That code did not work.');
    } finally {
      setBusy(false);
    }
  }

  const tab = (value: 'password' | 'otp', label: string) => (
    <button
      key={value}
      type="button"
      role="tab"
      aria-selected={mode === value}
      onClick={() => {
        setMode(value);
        setError(null);
      }}
      className={`flex-1 min-h-[40px] rounded-lg text-sm font-medium transition ${
        mode === value
          ? 'bg-brand text-black font-semibold'
          : 'text-white/70 hover:text-white'
      }`}
    >
      {label}
    </button>
  );

  return (
    <main
      data-theme="dark"
      className="min-h-screen grid place-items-center px-4 bg-bg-000"
    >
      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-semibold text-gold-text">SaaradhiGo Ops</h1>
        <p className="text-sm text-white/60 mt-1">
          Sign in with your operator account.
        </p>

        <div
          className="mt-4 flex rounded-xl border border-line p-1"
          role="tablist"
          aria-label="How to sign in"
        >
          {tab('password', 'Email + password')}
          {tab('otp', 'Phone + code')}
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-400 bg-red-900/30 border border-red-900/40 rounded-lg p-2">
            {error}
          </p>
        )}

        {mode === 'password' ? (
          <form onSubmit={onSubmitPassword} className="mt-5 space-y-3">
            <label className="block text-sm text-white/70" htmlFor="ops-id">
              Email address
            </label>
            <input
              id="ops-id"
              name="email"
              type="email"
              autoComplete="username"
              className="input w-full"
              placeholder="you@saaradhigo.com"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoFocus
            />
            <label className="block text-sm text-white/70" htmlFor="ops-pw">
              Password
            </label>
            <input
              id="ops-pw"
              name="password"
              type="password"
              autoComplete="current-password"
              className="input w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {needsMfa && (
              <>
                <label className="block text-sm text-white/70" htmlFor="ops-mfa">
                  Authenticator code
                </label>
                <input
                  id="ops-mfa"
                  name="mfa_code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className="input w-full"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                  autoFocus
                />
              </>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Signing you in…' : 'Sign in'}
            </button>
            <p className="text-xs text-white/40">
              Operator sessions are separate from rider and driver sessions on
              the public site.
            </p>
          </form>
        ) : stage === 'phone' ? (
          <form onSubmit={onSubmitPhone} className="mt-5 space-y-3">
            <label className="block text-sm text-white/70" htmlFor="ops-phone">
              Phone
            </label>
            <input
              id="ops-phone"
              name="phone_number"
              className="input w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmitOtp} className="mt-5 space-y-3">
            <label className="block text-sm text-white/70" htmlFor="ops-otp">
              Code sent to {phone}
            </label>
            <input
              id="ops-otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="input w-full"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              required
              autoFocus
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
    </main>
  );
}
