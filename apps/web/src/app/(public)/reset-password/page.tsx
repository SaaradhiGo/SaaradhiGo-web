'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, AuthShell, Field, SubmitButton } from '@/components/form';
import { messageFor, resetPassword } from '@/lib/publicAuth';

/**
 * Set a new password from an emailed link.
 *
 * THIS PAGE IS NOT OPTIONAL PLUMBING. `base/auth_email.py` builds its links
 * as `{FRONTEND_URL}/reset-password?uid=...&token=...`, so without this route
 * every reset email and every operator invite pointed at a 404 -- which made
 * the invite flow, the one way to hand somebody an account without putting a
 * password in a chat message, impossible to complete.
 */
function ResetPasswordInner() {
  const params = useSearchParams();
  const uid = params.get('uid') ?? '';
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const linkIsUsable = Boolean(uid && token);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }
    setBusy(true);
    try {
      await resetPassword(uid, token, password);
      setDone(true);
    } catch (err) {
      setError(
        messageFor(
          err,
          'That link did not work. It may have expired or already been used.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!linkIsUsable) {
    return (
      <AuthShell
        title="Set a new password"
        footer={
          <p>
            <Link href="/forgot-password" className="text-brand hover:underline">
              Ask for a new link
            </Link>
          </p>
        }
      >
        <Alert kind="error">
          This link is incomplete. Open the most recent link from your email, or
          request a new one.
        </Alert>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      intro="Choose something you do not use anywhere else."
    >
      {done ? (
        <div className="space-y-4">
          <Alert kind="success">
            Your password is set, and you have been signed out everywhere else.
          </Alert>
          <Link href="/sign-in" className="btn-primary w-full">
            Sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && <Alert kind="error">{error}</Alert>}
          <Field
            label="New password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            help="At least 8 characters."
            required
            autoFocus
          />
          <Field
            label="Confirm new password"
            name="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          <SubmitButton busy={busy} busyLabel="Saving…">
            Save password
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  // useSearchParams needs a Suspense boundary for static rendering.
  return (
    <Suspense
      fallback={
        <AuthShell title="Set a new password">
          <p className="text-sm text-white/60">Loading…</p>
        </AuthShell>
      }
    >
      <ResetPasswordInner />
    </Suspense>
  );
}
