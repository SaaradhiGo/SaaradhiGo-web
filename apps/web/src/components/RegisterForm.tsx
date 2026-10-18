'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Field, SubmitButton } from '@/components/form';
import {
  PublicRole,
  looksLikeEmail,
  looksLikePhone,
  messageFor,
  registerAccount,
} from '@/lib/publicAuth';

type Errors = Partial<Record<
  'fullName' | 'phone' | 'email' | 'password' | 'confirmPassword',
  string
>>;

/**
 * Create a rider or driver account.
 *
 * ON THE SUCCESS MESSAGE
 * The server answers identically whether it created the account or the
 * address was already registered -- that is what stops this form being used
 * to find out who holds an account. So this does not say "account created".
 * It says to check the inbox, which is true in both cases and is the next
 * thing to do in both cases.
 */
export default function RegisterForm({ role }: { role: PublicRole }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  function validate(): Errors {
    const next: Errors = {};
    if (!fullName.trim()) next.fullName = 'Tell us what to call you.';
    if (!looksLikePhone(phone)) {
      next.phone = 'Use the international format, like +919876543210.';
    }
    if (!looksLikeEmail(email)) next.email = 'Enter a valid email address.';
    if (password.length < 8) {
      next.password = 'Use at least 8 characters.';
    }
    if (password !== confirmPassword) {
      next.confirmPassword = 'Both passwords must match.';
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
      await registerAccount({
        fullName,
        phone,
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

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert kind="success">
          Check your inbox at <strong>{email}</strong>. Open the link we sent to
          confirm your address, then you can sign in.
        </Alert>
        <p className="text-sm text-white/60">
          The link can take a minute to arrive. If it does not, you can{' '}
          <Link href="/forgot-password" className="text-brand hover:underline">
            ask for another one
          </Link>
          .
        </p>
        <Link href="/sign-in" className="btn-secondary w-full">
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
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

      <Field
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        help={
          role === 'driver'
            ? 'Riders call this number when you are on your way to them.'
            : 'Your driver uses this to reach you at the pickup.'
        }
        required
      />

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
        help="At least 8 characters. Avoid anything you use elsewhere."
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
