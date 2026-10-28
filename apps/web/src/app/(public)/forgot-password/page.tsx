'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Field, SubmitButton, AuthShell } from '@/components/form';
import { looksLikeEmail, messageFor, requestPasswordReset } from '@/lib/publicAuth';

/**
 * Help for someone who cannot get in, which is not the same as "reset your
 * password".
 *
 * THE PAGE USED TO ASSUME EVERY ACCOUNT HAS A PASSWORD. It asked for an
 * email address, sent a reset link, and said "if there is an account, a
 * link is on its way". For a rider who signed up with a mobile number that
 * is a dead end dressed as progress: there is no email on the account, so
 * no link is ever sent, and -- more to the point -- there is no password to
 * reset. Those accounts are created by a one-time code and have never had
 * one. The visitor waits for a mail that cannot arrive.
 *
 * So the page starts by asking how they signed up, and the mobile answer
 * leads to the code route rather than to an empty inbox.
 *
 * The email route still answers identically whether or not the address has
 * an account. That is what stops this being a membership oracle, and the
 * wording -- "if there is an account" -- is both the honest phrasing and the
 * one that does not leak.
 */
type Route = null | 'email' | 'mobile';

export default function ForgotPasswordPage() {
  const [route, setRoute] = useState<Route>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!looksLikeEmail(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(messageFor(err, 'We could not send the link. Please try again.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Trouble signing in?"
      intro={
        route === null
          ? 'Tell us how you created your account and we will get you back in.'
          : undefined
      }
      footer={
        <p>
          Remembered it?{' '}
          <Link href="/sign-in" className="sg-link">
            Back to sign in
          </Link>
        </p>
      }
    >
      {route === null && (
        <div className="auth-routes">
          <button type="button" className="auth-route" onClick={() => setRoute('email')}>
            <span className="auth-route__title">I used an email and password</span>
            <span className="auth-route__hint">We will email you a link to set a new password.</span>
          </button>

          <button type="button" className="auth-route" onClick={() => setRoute('mobile')}>
            <span className="auth-route__title">I used my mobile number</span>
            <span className="auth-route__hint">
              Then you do not have a password — you sign in with a code instead.
            </span>
          </button>
        </div>
      )}

      {route === 'mobile' && (
        <>
          <Alert kind="info">
            An account created with a mobile number has no password to reset.
            Sign in with a one-time code sent to that number instead.
          </Alert>
          <Link href="/sign-in?method=mobile" className="btn-primary w-full text-center">
            Sign in with a code
          </Link>
          <button type="button" className="btn-ghost w-full" onClick={() => setRoute(null)}>
            Back
          </button>
        </>
      )}

      {route === 'email' && (
        sent ? (
          <Alert kind="success">
            If there is an account for <strong>{email}</strong>, a reset link is
            on its way. The link expires, so use it soon.
          </Alert>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {error && <Alert kind="error">{error}</Alert>}
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
            <SubmitButton busy={busy} busyLabel="Sending…">
              Send reset link
            </SubmitButton>
            <button type="button" className="btn-ghost w-full" onClick={() => setRoute(null)}>
              Back
            </button>
          </form>
        )
      )}
    </AuthShell>
  );
}
