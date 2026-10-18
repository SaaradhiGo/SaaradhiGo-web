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
  registerAccount,
  sendPublicOtp,
  verifyPublicOtp,
} from '@/lib/publicAuth';

type Tab = 'mobile' | 'email';

/**
 * Create an account, by mobile or by email.
 *
 * MOBILE vs EMAIL
 * Both create the same account; they differ in what proves you own the
 * identifier. Mobile sends a one-time code. Email sets a password now and
 * confirms the address with a link before the password works.
 *
 * The mobile tab is only offered where the deployment may actually send an
 * SMS. Offering a button that cannot work is worse than not offering it, and
 * explaining our messaging budget to a customer is worse than both.
 *
 * ON THE SUCCESS MESSAGE
 * The server answers identically whether it created the account or the
 * address was already registered -- that is what stops this form being used
 * to find out who holds an account -- so this never says "account created".
 */
export default function RegisterForm({ role }: { role: PublicRole }) {
  const { markets, failed: marketsFailed } = usePhoneMarkets();
  const canUseOtp = otpSendingEnabled();
  const [tab, setTab] = useState<Tab>(canUseOtp ? 'mobile' : 'email');

  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [national, setNational] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  const [stage, setStage] = useState<'form' | 'code'>('form');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  // Preselect whatever the server says the default market is, once known.
  useEffect(() => {
    if (markets && !country) setCountry(markets.default_country);
  }, [markets, country]);

  const market = markets?.countries.find((m) => m.code === country);

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = 'Tell us what to call you.';

    // The number is required on BOTH tabs. `phone_number` is the account's
    // USERNAME_FIELD, and beyond the schema a rider the driver cannot call at
    // the pickup is not a usable ride-hailing account. The tabs differ in how
    // you PROVE the identifier -- a code, or a password plus a link -- not in
    // what an account is made of.
    if (!nationalLooksValid(market, national)) {
      next.phone = 'Enter your mobile number without the country code.';
    }
    if (tab === 'email') {
      if (!looksLikeEmail(email)) next.email = 'Enter a valid email address.';
      if (password.length < 10) {
        next.password = 'Use at least 10 characters.';
      }
    }
    return next;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      if (tab === 'mobile') {
        await sendPublicOtp(toE164(market, national), role);
        setStage('code');
      } else {
        await registerAccount({
          fullName,
          phone: toE164(market, national),
          email,
          password,
          confirmPassword: password,
          role,
        });
        setSent(true);
      }
    } catch (err) {
      setFormError(
        messageFor(err, 'We could not create the account. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmCode(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await verifyPublicOtp(toE164(market, national), otp);
      window.location.assign(role === 'driver' ? '/drive' : '/');
    } catch (err) {
      setFormError(messageFor(err, 'That code did not work.'));
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert kind="success">
          Check your inbox at <strong>{email}</strong>. Open the link we sent to
          confirm your address, then you can sign in.
        </Alert>
        <Link href="/sign-in" className="btn-secondary w-full">
          Go to sign in
        </Link>
      </div>
    );
  }

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
            setStage('form');
            setOtp('');
            setFormError(null);
          }}
        >
          Use a different number
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {canUseOtp && (
        <div className="flex rounded-xl border border-white/10 p-1" role="tablist" aria-label="How to sign up">
          {(['mobile', 'email'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => {
                setTab(t);
                setErrors({});
                setFormError(null);
              }}
              className={`flex-1 min-h-[40px] rounded-lg text-sm font-medium transition-colors duration-150 ${
                tab === t ? 'bg-brand text-black' : 'text-white/70 hover:text-white'
              }`}
            >
              {t === 'mobile' ? 'Mobile' : 'Email'}
            </button>
          ))}
        </div>
      )}

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

      <PhoneField
        markets={markets}
        failed={marketsFailed}
        countryCode={country}
        onCountryChange={setCountry}
        national={national}
        onNationalChange={setNational}
        error={errors.phone}
        help={
          tab === 'mobile'
            ? 'We will text you a 6-digit code to confirm your number.'
            : 'Your driver uses this to reach you at the pickup.'
        }
      />

      {tab === 'email' && (
        <>
          <Field
            label="Email address"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
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
            help="Use at least 10 characters. A few unrelated words make a strong password."
            required
          />
        </>
      )}

      <SubmitButton busy={busy} busyLabel="Working…">
        {tab === 'mobile' ? 'Send code' : 'Create account'}
      </SubmitButton>

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
