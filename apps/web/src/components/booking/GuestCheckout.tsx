'use client';

import { useEffect, useState } from 'react';
import { Alert, Field, SubmitButton } from '@/components/form';
import PhoneField, { usePhoneMarkets } from '@/components/PhoneField';
import { Button } from '@/components/sg/Button';
import { nationalLooksValid, toE164 } from '@/lib/markets';
import {
  messageFor,
  otpSendingEnabled,
  phoneAllowedForOtp,
  qaTestPhones,
  sendPublicOtp,
  updateProfile,
  verifyPublicOtp,
} from '@/lib/publicAuth';

/**
 * Book without stopping to create an account.
 *
 * WHAT "GUEST" MEANS HERE, AND WHY IT IS NOT LESS THAN IT SOUNDS
 *
 * There is no anonymous trip. A trip is dispatched to a driver who has to
 * call someone at the kerb, a four-digit PIN is checked against a person,
 * the ride appears in a history and a receipt goes somewhere. The server
 * models all of that against an account, and a web page cannot wish that
 * away.
 *
 * So this is guest checkout in the sense the phrase is used everywhere else:
 * NO PASSWORD TO CHOOSE, NO FORM TO FILL TWICE, NO EMAIL TO GO AND CONFIRM.
 * Name, number, optional email, a code to prove the number is yours, and the
 * ride is booked. An account exists afterwards -- that is what lets them see
 * the trip and the receipt -- but they were never asked to make one.
 *
 * WHY THE NUMBER IS VERIFIED AND THE EMAIL IS OPTIONAL
 *
 * Booking against an unverified phone number means anyone can summon a car
 * to a stranger's door in that stranger's name, and the stranger gets the
 * call. The code is the one step that cannot be dropped. The email cannot
 * carry that weight -- this deployment has no mail backend, so an emailed
 * code could not be delivered at all -- so it is collected for the receipt
 * and nothing hangs on it.
 *
 * ON AN ENVIRONMENT THAT DOES NOT TEXT THE PUBLIC the control states the
 * limit and stays disabled, rather than failing after the press.
 */
export function GuestCheckout({
  onSignedIn,
  onSignIn,
  onCancel,
  fareLabel,
}: {
  /** The session is live; the caller can request the ride now. */
  onSignedIn: () => void;
  /** They have an account after all. */
  onSignIn: () => void;
  onCancel: () => void;
  /** What they are about to confirm, so the choice is not made blind. */
  fareLabel?: string | null;
}) {
  const { markets, failed: marketsFailed } = usePhoneMarkets();
  const smsToAnyone = otpSendingEnabled();
  const testPhones = qaTestPhones();

  const [fullName, setFullName] = useState('');
  const [country, setCountry] = useState('');
  const [national, setNational] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');

  const [stage, setStage] = useState<'details' | 'code'>('details');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (markets && !country) setCountry(markets.default_country);
  }, [markets, country]);

  const market = markets?.countries.find((m) => m.code === country);
  const phone = toE164(market, national);
  const canSendCode = phoneAllowedForOtp(phone);

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const found: Record<string, string> = {};
    if (!fullName.trim()) found.fullName = 'Your driver needs a name to call for.';
    if (!nationalLooksValid(market, national)) {
      found.phone = 'Enter your mobile number without the country code.';
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      found.email = 'Enter a valid email address, or leave this blank.';
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      await sendPublicOtp(phone, 'rider');
      setStage('code');
    } catch (err) {
      setError(messageFor(err, 'We could not send the code.'));
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      // `rider` is asserted, so a number that already belongs to a DRIVER
      // account is refused here instead of quietly booking a ride on a
      // driver's identity.
      await verifyPublicOtp(phone, otp, 'rider');
      try {
        await updateProfile({
          full_name: fullName.trim(),
          ...(email.trim() ? { email: email.trim() } : {}),
        });
      } catch {
        // The session is real either way, and the ride matters more than
        // the name on it. They can fix it afterwards on /account.
      }
      onSignedIn();
    } catch (err) {
      setError(messageFor(err, 'That code did not work.'));
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'code') {
    return (
      <form onSubmit={onConfirm} className="space-y-4" noValidate>
        <p className="caption text-ink-muted m-0">
          We sent a 6-digit code to {phone}. Confirm it and your ride is
          booked{fareLabel ? ` at ${fareLabel}` : ''}.
        </p>
        {error && <Alert kind="error">{error}</Alert>}
        <Field
          label="Code"
          name="otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          required
          autoFocus
        />
        <SubmitButton busy={busy} busyLabel="Checking…">
          Confirm and book
        </SubmitButton>
        <Button
          variant="ghost"
          block
          onClick={() => {
            setStage('details');
            setOtp('');
            setError(null);
          }}
        >
          Change my details
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onSendCode} className="space-y-4" noValidate>
      <p className="caption text-ink-muted m-0">
        No password, no email to confirm. Your driver needs a name and a number
        to reach you at the pickup.
      </p>

      {error && <Alert kind="error">{error}</Alert>}

      {!smsToAnyone && (
        <Alert kind="info">
          {testPhones.length > 0
            ? 'This environment does not text the public, so guest booking works here for approved QA test numbers only.'
            : 'This environment does not text the public. Sign in with your email and password instead.'}
        </Alert>
      )}

      <Field
        label="Your name"
        name="guestName"
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
        label="Mobile number"
        help="Your driver calls this at the pickup. We send a code to confirm it."
      />

      <Field
        label="Email address (optional)"
        name="guestEmail"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        help="For your receipt. Leave it blank if you would rather not."
      />

      <SubmitButton busy={busy} busyLabel="Sending…" disabled={!canSendCode}>
        Send code
      </SubmitButton>

      {!canSendCode && national.trim() !== '' && (
        <p className="help">
          {testPhones.length > 0
            ? 'That number is not an approved QA test number on this environment.'
            : 'This environment cannot text anyone.'}
        </p>
      )}

      <div className="border-t border-line pt-sg-4 grid gap-sg-2">
        <Button variant="secondary" block onClick={onSignIn}>
          I already have an account
        </Button>
        <Button variant="ghost" block onClick={onCancel}>
          Back to the fares
        </Button>
      </div>
    </form>
  );
}
