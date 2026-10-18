'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, Field, SubmitButton } from '@/components/form';
import PhoneField, { usePhoneMarkets } from '@/components/PhoneField';
import { nationalLooksValid, toE164 } from '@/lib/markets';
import {
  PublicRole,
  looksLikeEmail,
  messageFor,
  otpSendingEnabled,
  qaTestPhones,
  registerAccount,
  sendPublicOtp,
  verifyPublicOtp,
} from '@/lib/publicAuth';

type Tab = 'email' | 'mobile';

/**
 * Create an account, by email or by mobile.
 *
 * TWO ROUTES, NOT ONE FORM WITH EVERYTHING ON IT
 * Both create the same account; they differ in what proves you own the
 * identifier. Mobile sends a one-time code. Email sets a password now and
 * confirms the address with a link before that password works.
 *
 * The email route used to ask for a mobile number alongside the password,
 * which read as "we need your phone to sign you in by email" and mixed two
 * login methods on one screen. It is now a second step, labelled as the
 * CONTACT NUMBER the driver calls at the pickup, which is what it actually
 * is. The field is still required -- `phone_number` is the account's
 * USERNAME_FIELD, and a rider the driver cannot reach is not a usable
 * ride-hailing account -- but it is asked for as onboarding, not as a
 * credential.
 *
 * Both tabs are always offered. Hiding the mobile tab wherever the
 * deployment cannot text the public made the product look as though it had
 * no mobile sign-up, while every existing account was created with a phone
 * number. Where sending is restricted, the restriction is stated on the step
 * it applies to.
 *
 * ON THE SUCCESS MESSAGE
 * The server answers identically whether it created the account or the
 * address was already registered -- that is what stops this form being used
 * to discover who holds an account -- so this never says "account created".
 */
export default function RegisterForm({ role }: { role: PublicRole }) {
  const { markets, failed: marketsFailed } = usePhoneMarkets();
  const smsToAnyone = otpSendingEnabled();
  const testPhones = qaTestPhones();

  const [tab, setTab] = useState<Tab>('email');

  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [national, setNational] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');

  // 'details'  -> name + credentials (email tab) or name + number (mobile tab)
  // 'contact'  -> email tab only: the number the driver will call
  // 'code'     -> mobile tab only: the one-time code
  const [stage, setStage] = useState<'details' | 'contact' | 'code'>('details');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // Preselect whatever the server says the default market is, once known.
  // Defaulting to a country before the answer arrives is the India-only
  // assumption in miniature.
  useEffect(() => {
    if (markets && !country) setCountry(markets.default_country);
  }, [markets, country]);

  const market = markets?.countries.find((m) => m.code === country);

  function switchTab(next: Tab) {
    setTab(next);
    setStage('details');
    setErrors({});
    setFormError(null);
  }

  // -- step 1 -------------------------------------------------------------

  function validateDetails(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = 'Tell us what to call you.';

    if (tab === 'email') {
      if (!looksLikeEmail(email)) next.email = 'Enter a valid email address.';
      if (password.length < 10) next.password = 'Use at least 10 characters.';
      if (confirmPassword !== password) {
        next.confirmPassword = 'Both passwords must match.';
      }
    } else if (!nationalLooksValid(market, national)) {
      next.phone = 'Enter your mobile number without the country code.';
    }
    return next;
  }

  async function onSubmitDetails(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validateDetails();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    if (tab === 'email') {
      // Credentials are fine; now ask for the contact number on its own step.
      setStage('contact');
      return;
    }

    setBusy(true);
    try {
      await sendPublicOtp(toE164(market, national), role);
      setStage('code');
    } catch (err) {
      setFormError(messageFor(err, 'We could not send the code.'));
    } finally {
      setBusy(false);
    }
  }

  // -- step 2 (email route) ------------------------------------------------

  async function onSubmitContact(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!nationalLooksValid(market, national)) {
      setErrors({ phone: 'Enter your mobile number without the country code.' });
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      await registerAccount({
        fullName,
        phone: toE164(market, national),
        email,
        password,
        confirmPassword,
        role,
      });
      setSent(true);
    } catch (err) {
      setFormError(
        messageFor(err, 'We could not create the account. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  // -- step 2 (mobile route) -----------------------------------------------

  async function onConfirmCode(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await verifyPublicOtp(toE164(market, national), otp, role);
      window.location.assign(role === 'driver' ? '/drive' : '/');
    } catch (err) {
      setFormError(messageFor(err, 'That code did not work.'));
    } finally {
      setBusy(false);
    }
  }

  // -- screens -------------------------------------------------------------

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert kind="success">
          Check your inbox at <strong>{email}</strong>. Open the link we sent to
          confirm your address, then you can sign in.
        </Alert>
        <Link
          href={role === 'driver' ? '/driver/sign-in' : '/sign-in'}
          className="btn-secondary w-full"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  const tabs = (
    <div
      className="flex rounded-xl border border-white/10 p-1"
      role="tablist"
      aria-label="How to sign up"
    >
      {(['email', 'mobile'] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => switchTab(t)}
          className={`flex-1 min-h-[40px] rounded-lg text-sm font-medium transition-colors duration-150 ${
            tab === t ? 'bg-brand text-black' : 'text-white/70 hover:text-white'
          }`}
        >
          {t === 'email' ? 'Email' : 'Mobile'}
        </button>
      ))}
    </div>
  );

  if (stage === 'code') {
    return (
      <form onSubmit={onConfirmCode} className="space-y-4" noValidate>
        {formError && <Alert kind="error">{formError}</Alert>}
        <Field
          label={`Code sent to +${market?.calling_code ?? ''} ${national}`}
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
            setStage('details');
            setOtp('');
            setFormError(null);
          }}
        >
          Use a different number
        </button>
      </form>
    );
  }

  if (stage === 'contact') {
    return (
      <form onSubmit={onSubmitContact} className="space-y-4" noValidate>
        <p className="text-sm text-white/60">
          Step 2 of 2 — how your driver reaches you.
        </p>
        {formError && <Alert kind="error">{formError}</Alert>}

        <PhoneField
          markets={markets}
          failed={marketsFailed}
          countryCode={country}
          onCountryChange={setCountry}
          national={national}
          onNationalChange={setNational}
          error={errors.phone}
          label="Contact number"
          help="Your driver calls this number at the pickup. You will sign in with your email."
        />

        <SubmitButton busy={busy} busyLabel="Creating your account…">
          Create account
        </SubmitButton>
        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => {
            setStage('details');
            setFormError(null);
          }}
        >
          Back
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitDetails} className="space-y-4" noValidate>
      {tabs}

      {formError && <Alert kind="error">{formError}</Alert>}

      <Field
        label="Full name"
        name="fullName"
        autoComplete="name"
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        error={errors.fullName}
        required
      />

      {tab === 'email' ? (
        <>
          <Field
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            help="We send your receipts here, and you sign in with it."
            required
          />
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
            help="At least 10 characters. A few unrelated words make a strong password."
            required
          />
          <Field
            label="Confirm password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={errors.confirmPassword}
            required
          />
          <SubmitButton busy={busy} busyLabel="Working…">
            Continue
          </SubmitButton>
        </>
      ) : (
        <>
          {!smsToAnyone && (
            <Alert kind="info">
              {testPhones.length > 0
                ? 'This environment does not text the public. Mobile sign-up works here for approved QA test numbers only.'
                : 'This environment does not text the public. Sign up with your email instead.'}
            </Alert>
          )}
          <PhoneField
            markets={markets}
            failed={marketsFailed}
            countryCode={country}
            onCountryChange={setCountry}
            national={national}
            onNationalChange={setNational}
            error={errors.phone}
            help={
              smsToAnyone
                ? 'We will text you a 6-digit code to confirm your number.'
                : 'Approved QA test numbers receive a fixed code without an SMS being sent.'
            }
          />
          <SubmitButton busy={busy} busyLabel="Sending…">
            Send code
          </SubmitButton>
          <p className="help">
            You can add an email address later from your profile.
          </p>
        </>
      )}

      <p className="help">
        By continuing you agree to our{' '}
        <Link href="/terms" className="text-brand hover:underline">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="text-brand hover:underline">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
