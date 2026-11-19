'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, AuthShell } from '@/components/form';
import { confirmEmailVerification, messageFor } from '@/lib/publicAuth';

/**
 * Confirm an email address from the link in the welcome email.
 *
 * Like /reset-password, this exists because the backend already builds links
 * to it: `{FRONTEND_URL}/verify-email?uid=...&token=...`. Without the page,
 * registration created accounts that could never be verified, and
 * `email_login` refuses an unverified address -- so every self-registered
 * account would have been permanently locked out.
 */
function VerifyEmailInner() {
  const params = useSearchParams();
  const uid = params.get('uid') ?? '';
  const token = params.get('token') ?? '';

  const [state, setState] = useState<'checking' | 'ok' | 'bad'>('checking');
  const [message, setMessage] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    // React 18 StrictMode mounts twice in development; a verification token
    // is single-use, so a second call would report failure for a link that
    // had just succeeded.
    if (ran.current) return;
    ran.current = true;

    if (!uid || !token) {
      setState('bad');
      setMessage('This link is incomplete. Open the most recent one from your email.');
      return;
    }

    confirmEmailVerification(uid, token)
      .then(() => setState('ok'))
      .catch((err) => {
        setState('bad');
        setMessage(
          messageFor(
            err,
            'That link did not work. It may have expired or already been used.',
          ),
        );
      });
  }, [uid, token]);

  return (
    <AuthShell
      title="Confirm your email"
      footer={
        state === 'bad' ? (
          <p>
            <Link href="/contact" className="sg-link">
              Contact us
            </Link>
          </p>
        ) : undefined
      }
    >
      {state === 'checking' && (
        <p className="text-sm text-ink-subtle" role="status">
          Confirming your address…
        </p>
      )}
      {state === 'ok' && (
        <div className="space-y-4">
          <Alert kind="success">
            Your email address is confirmed. You can sign in now.
          </Alert>
          <Link href="/sign-in" className="s-btn s-btn--primary s-submit">
            Log in
          </Link>
        </div>
      )}
      {/* 18 Nov (owner): an error state always offers the next step as a button. */}
      {state === 'bad' && (
        <div className="space-y-4">
          <Alert kind="error">{message}</Alert>
          <Link href="/sign-in" className="s-btn s-btn--primary s-submit" data-testid="next-step">
            Sign in
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Confirm your email">
          <p className="text-sm text-ink-subtle">Loading…</p>
        </AuthShell>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
