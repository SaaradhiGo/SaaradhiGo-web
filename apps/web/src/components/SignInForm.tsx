'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Field, SubmitButton } from '@/components/form';
import PhoneField, { usePhoneMarkets } from '@/components/PhoneField';
import { nationalLooksValid, toE164 } from '@/lib/markets';
import {
  PublicRole,
  isUnverified,
  looksLikeEmail,
  messageFor,
  otpSendingEnabled,
  sendPublicOtp,
  signInWithEmail,
  verifyPublicOtp,
} from '@/lib/publicAuth';

/**
 * Sign in with an email and password, or with a one-time code.
 *
 * Email is the default because it works everywhere; the phone route stays
 * because it is how every existing rider and driver account was created, and
 * removing it would strand them. The code route is only offered where sending
 * is enabled -- on an environment that may not send an SMS, offering a button
 * that cannot work is worse than not offering it.
 *
 * AUTH_EMAIL_UNVERIFIED gets its own answer. "Invalid credentials" for an
 * account whose password is correct but whose address is unconfirmed sends
 * people to reset a password that was never wrong.
 */
export default function SignInForm({ role }: { role: PublicRole }) {
  const router = useRouter();
  const [mode, setMode] = useState<'email' | 'phone'>('email');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { markets, failed: marketsFailed } = usePhoneMarkets();
  const [country, setCountry] = useState('');
  const [national, setNational] = useState('');
  const [otp, setOtp] = useState('');
  const [stage, setStage] = useState<'phone' | 'code'>('phone');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);

  const canUseOtp = otpSendingEnabled();

  // Preselect whatever the server says the default market is, once known.
  // Defaulting to a country before the answer arrives is the India-only
  // assumption in miniature.
  useEffect(() => {
    if (markets && !country) setCountry(markets.default_country);
  }, [markets, country]);

  const market = markets?.countries.find((m) => m.code === country);
  const phone = toE164(market, national);

  function done() {
    router.replace(role === 'driver' ? '/drive' : '/');
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUnverified(false);

    if (!looksLikeEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setBusy(true);
    try {
      await signInWithEmail(email, password);
      done();
    } catch (err) {
      if (isUnverified(err)) {
        setUnverified(true);
      } else {
        setError(messageFor(err, 'We could not sign you in. Please try again.'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nationalLooksValid(market, national)) {
      setError('Enter your mobile number without the country code.');
      return;
    }
    setBusy(true);
    try {
      await sendPublicOtp(phone, role);
      setStage('code');
    } catch (err) {
      setError(messageFor(err, 'We could not send the code.'));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyPublicOtp(phone, otp);
      done();
    } catch (err) {
      setError(messageFor(err, 'That code did not work.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {canUseOtp && (
        <div
          className="flex rounded-xl border border-white/10 p-1"
          role="tablist"
          aria-label="How to sign in"
        >
          {(['email', 'phone'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => {
                setMode(m);
                setError(null);
                setUnverified(false);
              }}
              className={`flex-1 min-h-[40px] rounded-lg text-sm font-medium transition-colors duration-150 ${
                mode === m ? 'bg-brand text-black' : 'text-white/70 hover:text-white'
              }`}
            >
              {m === 'email' ? 'Email & password' : 'One-time code'}
            </button>
          ))}
        </div>
      )}

      {error && <Alert kind="error">{error}</Alert>}

      {unverified && (
        <Alert kind="info">
          Your password is right, but your email address is not confirmed yet.
          Open the link we sent when you registered, then sign in again.
        </Alert>
      )}

      {mode === 'email' ? (
        <form onSubmit={submitEmail} className="space-y-4" noValidate>
          <Field
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <SubmitButton busy={busy} busyLabel="Signing you in…">
            Sign in
          </SubmitButton>
          <p className="text-sm">
            <Link href="/forgot-password" className="text-brand hover:underline">
              Forgot your password?
            </Link>
          </p>
        </form>
      ) : stage === 'phone' ? (
        <form onSubmit={submitPhone} className="space-y-4" noValidate>
          <PhoneField
            markets={markets}
            failed={marketsFailed}
            countryCode={country}
            onCountryChange={setCountry}
            national={national}
            onNationalChange={setNational}
            help="We will text you a 6-digit code."
          />
          <SubmitButton busy={busy} busyLabel="Sending…">
            Send code
          </SubmitButton>
        </form>
      ) : (
        <form onSubmit={submitCode} className="space-y-4" noValidate>
          <Field
            label={`Code sent to ${phone}`}
            name="otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            required
            autoFocus
          />
          <SubmitButton busy={busy} busyLabel="Checking…">
            Confirm
          </SubmitButton>
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
