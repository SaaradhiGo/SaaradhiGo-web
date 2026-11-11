'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Field, SubmitButton } from '@/components/form';
import PhoneField, { usePhoneMarkets } from '@/components/PhoneField';
import { useSite } from '@/i18n/site';
import { useTr } from '@/i18n/website';
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
  verifyPhoneForSignup,
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
 * THE EMAIL ROUTE NOW HAS THAT STEP TOO (AUDIT 27.78, H4). The number is the
 * account's identity, and the server used to take it on trust -- anyone could
 * register a stranger's number. "Create account" now texts a code to the
 * number; confirming it gets a proof from `/auth/otp/verify/` (no account, no
 * session), and only then is the account created, carrying the proof. The
 * proof is kept for the number it was issued for, so a refusal about another
 * field sends the person back to fix it without a second text.
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
  phone_proof: 'phone',
  full_name: 'fullName',
};

export default function RegisterForm({ role }: { role: PublicRole }) {
  const search = useSearchParams();
  const { markets, failed: marketsFailed } = usePhoneMarkets();
  const smsToAnyone = otpSendingEnabled();
  const testPhones = qaTestPhones();

  const home = role === 'driver' ? '/driver' : '/ride';
  const next = safeReturnTo(search.get('next'), home);

  const [tab, setTab] = useState<Tab>('email');
  const tr = useTr();
  const auth = useSite().auth;

  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [national, setNational] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');

  const [codeSent, setCodeSent] = useState(false);
  // The phone proof for the email route, and the number it proves.
  const [proof, setProof] = useState<{ phone: string; value: string } | null>(null);
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
    if (markets && !country) setCountry(regionDefault(markets));
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

    const phone = toE164(market, national);
    if (proof && proof.phone === phone) {
      await createAccount(proof.value);
      return;
    }
    // The number is proved first: text the code, then the code screen.
    setBusy(true);
    try {
      setProof(null);
      await sendPublicOtp(phone, role);
      setOtp('');
      setCodeSent(true);
    } catch (err) {
      showServerError(err, 'We could not send the code.');
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(phoneProof: string) {
    setBusy(true);
    try {
      const created = await registerAccount({
        fullName,
        phone: toE164(market, national),
        email,
        password,
        confirmPassword,
        role,
        phoneProof,
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
      // A refused proof cannot be retried; anything else leaves it usable
      // (the server spends it only once every other field has passed).
      if (err instanceof ApiError && err.code.startsWith('AUTH_PHONE_PROOF')) setProof(null);
      setCodeSent(false);
      showServerError(
        err,
        'We could not create the account. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmEmailRouteCode(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const phone = toE164(market, national);
    setBusy(true);
    let proved: string;
    try {
      proved = (await verifyPhoneForSignup(phone, otp)).phone_proof;
      setProof({ phone, value: proved });
    } catch (err) {
      showServerError(err, 'That code did not work.');
      setBusy(false);
      return;
    }
    setBusy(false);
    await createAccount(proved);
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
      <div className="s-form">
        <Alert kind="success">
          Check your inbox at <strong>{email}</strong>. Open the link we sent
          to confirm your address, then you can sign in.
        </Alert>
        <Link
          href={`${role === 'driver' ? '/driver/sign-in' : '/sign-in'}?next=${encodeURIComponent(next)}`}
          className="s-btn s-btn--outline s-submit"
        >
          Go to log in
        </Link>
      </div>
    );
  }

  const tabs = (
    <div className="s-seg" role="tablist" aria-label={tr('Sign up with')}>
      {(['email', 'mobile'] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => switchTab(t)}
        >
          {tr(t === 'email' ? 'Email' : 'Mobile')}
        </button>
      ))}
    </div>
  );

  if (codeSent) {
    return (
      <form onSubmit={tab === 'email' ? onConfirmEmailRouteCode : onConfirmCode} className="s-form" noValidate>
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
          {tab === 'email' ? 'Confirm and create account' : 'Confirm'}
        </SubmitButton>
        <button
          type="button"
          className="s-btn s-btn--outline s-submit"
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
      className="s-form"
      noValidate
    >
      {tabs}

      {formError && <Alert kind="error">{formError}</Alert>}

      {/* Two columns (approved design, 2026-11-07): Full name | Email,
          Mobile number | (empty), Password | Confirm password. */}
      <div className="s-grid">
        <Field
          label={tr('Full name')}
          name="fullName"
          autoComplete="name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
          required
        />

        {tab === 'email' && (
          <Field
            label={tr('Email')}
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            required
          />
        )}

        {/* EVERY ROUTE ASKS FOR THE NUMBER, because the driver has to be able
            to call at the pickup and the number is the account's identity. */}
        <PhoneField
          markets={markets}
          failed={marketsFailed}
          countryCode={country}
          onCountryChange={setCountry}
          national={national}
          onNationalChange={setNational}
          error={errors.phone}
          label={tr('Mobile number')}
          help={tab === 'email' || smsToAnyone ? tr('We text a code to confirm it.') : 'QA test numbers get a fixed code, no SMS.'}
        />
        <span className="s-only-desk" aria-hidden="true" />

        {tab === 'email' ? (
          <>
            <Field
              label={tr('Password')}
              className="s-half"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              help={tr('At least 10 characters.')}
              required
            />
            <Field
              label={tr('Confirm password')}
              className="s-half"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={errors.confirmPassword}
              required
            />
          </>
        ) : (
          <Field
            label="Email (optional)"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
            help="For receipts."
          />
        )}
      </div>

      {tab === 'email' ? (
        <>
          {/* The number is proved by SMS before the account exists, so a number
              this environment cannot text cannot sign up here either. */}
          <SubmitButton busy={busy} busyLabel="Sending a code…" disabled={!phoneUsable && national.trim() !== ''}>
            {tr('Create account')}
          </SubmitButton>
          {!phoneUsable && national.trim() !== '' && (
            <p className="s-help">
              {testPhones.length > 0
                ? 'This environment texts approved QA test numbers only, and the number must be confirmed by text.'
                : 'This environment cannot text anyone, and the number must be confirmed by text.'}
            </p>
          )}
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
          {/* Disabled rather than failing on press: a tester typing a real
              number into an environment that texts nobody used to get an
              error that read like a broken product. */}
          <SubmitButton busy={busy} busyLabel="Sending…" disabled={!phoneUsable && national.trim() !== ''}>
            Send code
          </SubmitButton>
          {!phoneUsable && national.trim() !== '' && (
            <p className="s-help">
              {testPhones.length > 0
                ? 'That number is not an approved QA test number on this environment. Sign up with your email instead.'
                : 'This environment cannot text anyone. Sign up with your email instead.'}
            </p>
          )}
        </>
      )}

      <p className="s-auth__fine">
        {agreement(auth.agree, <Link key="t" href="/terms">{auth.terms}</Link>, <Link key="p" href="/privacy">{auth.privacy}</Link>)}
      </p>
    </form>
  );
}

/**
 * The visitor's own region when we serve it, else the deployment's default
 * (owner, 2026-11-07: never a hard-coded +91). The browser's locale carries
 * the region ("en-US", "te-IN"); a language with no region says nothing.
 */
function regionDefault(markets: { default_country: string; countries: { code: string }[] }) {
  try {
    const tags = [...(navigator.languages ?? []), navigator.language, Intl.DateTimeFormat().resolvedOptions().locale];
    for (const tag of tags) {
      const region = tag ? new Intl.Locale(tag).region : undefined;
      if (region && markets.countries.some((m) => m.code === region)) return region;
    }
  } catch {
    /* an old browser without Intl.Locale keeps the default */
  }
  return markets.default_country;
}

/** The agreement line with its two links in place of {terms} and {privacy}. */
function agreement(line: string, terms: React.ReactNode, privacy: React.ReactNode) {
  return line.split(/(\{terms\}|\{privacy\})/).map((part, i) =>
    part === '{terms}' ? terms : part === '{privacy}' ? privacy : <span key={i}>{part}</span>,
  );
}
