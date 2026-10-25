'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Alert, Field, SubmitButton } from '@/components/form';
import PhoneField, { usePhoneMarkets } from '@/components/PhoneField';
import { nationalLooksValid, toE164 } from '@/lib/markets';
import { safeReturnTo } from '@/lib/returnTo';
import {
  PublicRole,
  isUnverified,
  looksLikeEmail,
  messageFor,
  otpSendingEnabled,
  phoneAllowedForOtp,
  qaTestPhones,
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
  const search = useSearchParams();
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

  // Both routes are always OFFERED. Hiding the mobile tab whenever this
  // deployment cannot text the public meant the product appeared to have no
  // mobile sign-in at all -- while every existing account was created with a
  // phone number. The tab is shown, and the limitation is stated where it
  // applies instead of being hidden by removing the feature.
  const smsToAnyone = otpSendingEnabled();
  const testPhones = qaTestPhones();

  // Preselect whatever the server says the default market is, once known.
  // Defaulting to a country before the answer arrives is the India-only
  // assumption in miniature.
  useEffect(() => {
    if (markets && !country) setCountry(markets.default_country);
  }, [markets, country]);

  const market = markets?.countries.find((m) => m.code === country);
  const phone = toE164(market, national);
  // Whether THIS number can be sent a code here, not merely whether the
  // feature exists.
  const canSendCode = phoneAllowedForOtp(phone);

  function done() {
    // BACK TO WHATEVER THEY WERE DOING. A rider who pressed "See ride
    // options", was asked to sign in and then landed on the homepage with an
    // empty form has been made to do the work twice. `next` carries the
    // booking URL, and `safeReturnTo` refuses anything that is not a path on
    // this site.
    router.replace(
      safeReturnTo(search.get('next'), role === 'driver' ? '/drive' : '/'),
    );
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
      await signInWithEmail(email, password, role);
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
      await verifyPublicOtp(phone, otp, role);
      done();
    } catch (err) {
      setError(messageFor(err, 'That code did not work.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        className="flex rounded-xl border border-line p-1"
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
                mode === m ? 'bg-gold-500 text-on-gold' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {m === 'email' ? 'Email' : 'Mobile'}
            </button>
          ))}
      </div>

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
            <Link href="/forgot-password" className="sg-link">
              Forgot your password?
            </Link>
          </p>
        </form>
      ) : stage === 'phone' ? (
        <form onSubmit={submitPhone} className="space-y-4" noValidate>
          {!smsToAnyone && (
            <Alert kind="info">
              {testPhones.length > 0 ? (
                <>
                  This environment does not text the public. Mobile sign-in
                  works here for approved QA test numbers only.
                </>
              ) : (
                <>
                  This environment does not text the public. Use your email and
                  password to sign in.
                </>
              )}
            </Alert>
          )}
          <PhoneField
            markets={markets}
            failed={marketsFailed}
            countryCode={country}
            onCountryChange={setCountry}
            national={national}
            onNationalChange={setNational}
            help={
              smsToAnyone
                ? 'We will text you a 6-digit code.'
                : 'Approved QA test numbers receive a fixed code without an SMS being sent.'
            }
          />
          {/* The button is disabled rather than merely failing on press.
              It used to be live for every number on an environment that
              texts nobody, so a tester typed a real number, pressed Send
              code and got an error that looked like a product fault. Now
              the control states the rule before it is used. */}
          <SubmitButton busy={busy} busyLabel="Sending…" disabled={!canSendCode}>
            Send code
          </SubmitButton>
          {!canSendCode && national.trim() !== '' && (
            <p className="caption text-ink-subtle">
              {testPhones.length > 0
                ? 'That number is not an approved QA test number on this environment. Sign in with your email and password instead.'
                : 'This environment cannot text anyone. Sign in with your email and password instead.'}
            </p>
          )}
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
