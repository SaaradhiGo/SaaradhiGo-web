'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Field, SubmitButton } from '@/components/form';
import PhoneField, { usePhoneMarkets } from '@/components/PhoneField';
import { ApiError } from '@/lib/api';
import { nationalLooksValid, toE164 } from '@/lib/markets';
import { safeReturnTo } from '@/lib/returnTo';
import {
  PublicRole,
  looksLikeEmail,
  messageFor,
  otpSendingEnabled,
  phoneAllowedForOtp,
  qaTestPhones,
  registerAccount,
  sendPublicOtp,
  signInWithEmail,
  updateProfile,
  verifyPublicOtp,
} from '@/lib/publicAuth';

type Tab = 'email' | 'mobile';

/**
 * Create an account, by email or by mobile.
 *
 * ONE SCREEN. IT USED TO BE TWO, AND THE SPLIT CAUSED A REAL FAILURE.
 *
 * The email route asked for a name, an address and a password, then moved to
 * a second step for the contact number. Two things went wrong with that:
 *
 *   1. The account is only created on the SECOND step, so every refusal the
 *      server makes about the FIRST step's fields arrives while those fields
 *      are off screen. On "Apply to drive" the message "Enter a valid email
 *      address." appeared under the heading "Step 2 of 2 -- how your driver
 *      reaches you", above a country selector and a phone box, with no email
 *      field anywhere on the page. The error was correct and unactionable.
 *
 *   2. It asked twice for what is one set of details. There is no reason a
 *      name, an address, a number and a password cannot be on one card.
 *
 * So: one card, every field at once, and a server error about a field is
 * attached to that field -- `ApiError.field` carries which one.
 *
 * The mobile route still has a second step, because a one-time code is not a
 * form field: it cannot be typed until the first step has been sent. That is
 * a verification, not a split form.
 *
 * WHAT HAPPENS WHEN IT SUCCEEDS
 * Where the deployment can send a verification link, the screen says to open
 * it. Where it cannot, the account is already usable, so this SIGNS THE
 * PERSON IN and returns them to whatever they were doing -- a rider who was
 * halfway through booking used to be dropped on the homepage with their trip
 * gone, having to search for their pickup and destination a second time.
 *
 * ON THE SUCCESS MESSAGE
 * The server answers identically whether it created the account or the
 * address was already registered -- that is what stops this form being used
 * to discover who holds an account -- so this never says "account created".
 */

/** Server field names, mapped onto the inputs on this form. */
const FIELD_MAP: Record<string, string> = {
  email: 'email',
  password: 'password',
  confirm_password: 'confirmPassword',
  phone_number: 'phone',
  full_name: 'fullName',
};

export default function RegisterForm({ role }: { role: PublicRole }) {
  const search = useSearchParams();
  const { markets, failed: marketsFailed } = usePhoneMarkets();
  const smsToAnyone = otpSendingEnabled();
  const testPhones = qaTestPhones();

  const home = role === 'driver' ? '/driver/home' : '/';
  const next = safeReturnTo(search.get('next'), home);

  const [tab, setTab] = useState<Tab>('email');

  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [national, setNational] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');

  const [codeSent, setCodeSent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set only when the account exists and the address still has to be
  // confirmed from an inbox. Everything else either signs in or fails.
  const [awaitingInbox, setAwaitingInbox] = useState(false);

  // Preselect whatever the server says the default market is, once known.
  // Defaulting to a country before the answer arrives is the India-only
  // assumption in miniature.
  useEffect(() => {
    if (markets && !country) setCountry(markets.default_country);
  }, [markets, country]);

  const market = markets?.countries.find((m) => m.code === country);

  function switchTab(nextTab: Tab) {
    setTab(nextTab);
    setCodeSent(false);
    setErrors({});
    setFormError(null);
  }

  /** Put a server refusal on the field it is about, or on the form. */
  function showServerError(err: unknown, fallback: string) {
    const message = messageFor(err, fallback);
    const field = err instanceof ApiError ? err.field : null;
    const local = field ? FIELD_MAP[field] : null;
    if (local) {
      setErrors({ [local]: message });
      setFormError(null);
    } else {
      setFormError(message);
    }
  }

  function validate(): Record<string, string> {
    const found: Record<string, string> = {};
    if (!fullName.trim()) found.fullName = 'Tell us what to call you.';
    if (!nationalLooksValid(market, national)) {
      found.phone = 'Enter your mobile number without the country code.';
    }
    if (tab === 'email') {
      if (!looksLikeEmail(email)) found.email = 'Enter a valid email address.';
      if (password.length < 10) found.password = 'Use at least 10 characters.';
      if (confirmPassword !== password) {
        found.confirmPassword = 'Both passwords must match.';
      }
    } else if (email.trim() && !looksLikeEmail(email)) {
      // Optional on this route, but if it is given it has to be an address.
      found.email = 'Enter a valid email address, or leave this blank.';
    }
    return found;
  }

  // -- the email route, in one submit --------------------------------------

  async function onCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const created = await registerAccount({
        fullName,
        phone: toE164(market, national),
        email,
        password,
        confirmPassword,
        role,
      });

      if (created?.verification_required === false) {
        // The account is usable right now, so finish the job rather than
        // handing back a "go and sign in" link. This is what returns a
        // rider to the booking they abandoned to register.
        await signInWithEmail(email, password, role);
        window.location.assign(next);
        return;
      }
      setAwaitingInbox(true);
    } catch (err) {
      showServerError(
        err,
        'We could not create the account. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  // -- the mobile route ----------------------------------------------------

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      await sendPublicOtp(toE164(market, national), role);
      setCodeSent(true);
    } catch (err) {
      showServerError(err, 'We could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmCode(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      await verifyPublicOtp(toE164(market, national), otp, role);
      // The name and the address were typed on the first step; the code
      // route creates the account from the number alone, so they are
      // attached now. A failure here does not undo a valid sign-in --
      // the person is in, with a blank name they can fill in later.
      try {
        await updateProfile({
          full_name: fullName.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
        });
      } catch {
        /* the session is real either way */
      }
      // Back to whatever they were doing, and only ever to a path on this
      // site -- `safeReturnTo` has already refused anything else.
      window.location.assign(next);
    } catch (err) {
      showServerError(err, 'That code did not work.');
    } finally {
      setBusy(false);
    }
  }

  // -- screens -------------------------------------------------------------

  if (awaitingInbox) {
    return (
      <div className="space-y-4">
        <Alert kind="success">
          Check your inbox at <strong>{email}</strong>. Open the link we sent
          to confirm your address, then you can sign in.
        </Alert>
        <Link
          href={`${role === 'driver' ? '/driver/sign-in' : '/sign-in'}?next=${encodeURIComponent(next)}`}
          className="btn-secondary w-full"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  const tabs = (
    <div
      className="flex rounded-xl border border-line p-1"
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
            tab === t ? 'bg-gold-500 text-on-gold' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {t === 'email' ? 'Email' : 'Mobile'}
        </button>
      ))}
    </div>
  );

  if (codeSent) {
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
            setCodeSent(false);
            setOtp('');
            setFormError(null);
          }}
        >
          Change my details
        </button>
      </form>
    );
  }

  const phoneUsable = phoneAllowedForOtp(toE164(market, national));

  return (
    <form
      onSubmit={tab === 'email' ? onCreateAccount : onSendCode}
      className="space-y-4"
      noValidate
    >
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

      {/* EVERY ROUTE ASKS FOR THE NUMBER, because the driver has to be able
          to call at the pickup and `phone_number` is the account's identity.
          On the email route it was a second screen; it is simply the next
          field now. */}
      <PhoneField
        markets={markets}
        failed={marketsFailed}
        countryCode={country}
        onCountryChange={setCountry}
        national={national}
        onNationalChange={setNational}
        error={errors.phone}
        label="Mobile number"
        help={
          tab === 'email'
            ? 'Your driver calls this at the pickup. You sign in with your email.'
            : smsToAnyone
              ? 'We will text you a 6-digit code to confirm your number.'
              : 'Approved QA test numbers receive a fixed code without an SMS being sent.'
        }
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
          <SubmitButton busy={busy} busyLabel="Creating your account…">
            Create account
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
          <Field
            label="Email address (optional)"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            help="For receipts. You can add it later instead."
          />
          {/* Disabled rather than failing on press: a tester typing a real
              number into an environment that texts nobody used to get an
              error that read like a broken product. */}
          <SubmitButton busy={busy} busyLabel="Sending…" disabled={!phoneUsable}>
            Send code
          </SubmitButton>
          {!phoneUsable && national.trim() !== '' && (
            <p className="help">
              {testPhones.length > 0
                ? 'That number is not an approved QA test number on this environment. Sign up with your email instead.'
                : 'This environment cannot text anyone. Sign up with your email instead.'}
            </p>
          )}
        </>
      )}

      <p className="help">
        By continuing you agree to our{' '}
        <Link href="/terms" className="sg-link">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="sg-link">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
