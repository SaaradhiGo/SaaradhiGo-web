'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert, Field, SubmitButton, AuthShell } from '@/components/form';
import { looksLikeEmail, messageFor, requestPasswordReset } from '@/lib/publicAuth';

/**
 * Ask for a reset link.
 *
 * The server answers the same whether or not the address has an account --
 * that is what stops this being a membership oracle -- so the confirmation
 * here says "if there is an account", which is the honest wording and
 * happens to be the one that does not leak.
 */
export default function ForgotPasswordPage() {
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
      title="Reset your password"
      intro="We will email you a link to set a new one."
      footer={
        <p>
          Remembered it?{' '}
          <Link href="/sign-in" className="sg-link">
            Back to sign in
          </Link>
        </p>
      }
    >
      {sent ? (
        <Alert kind="success">
          If there is an account for <strong>{email}</strong>, a reset link is on
          its way. The link expires, so use it soon.
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
        </form>
      )}
    </AuthShell>
  );
}
