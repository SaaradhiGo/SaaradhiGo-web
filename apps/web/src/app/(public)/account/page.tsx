'use client';

import { useEffect, useState } from 'react';
import { Alert, Field, SubmitButton } from '@/components/form';
import { Badge } from '@/components/sg/Badge';
import { Button, ButtonLink } from '@/components/sg/Button';
import { ApiError } from '@/lib/api';
import {
  clearRiderTokens,
  looksLikeEmail,
  messageFor,
  updateProfile,
} from '@/lib/publicAuth';
import { useSession } from '@/lib/useSession';
import { useRouter } from 'next/navigation';

/**
 * Your account.
 *
 * THIS PAGE DID NOT EXIST. Signing in gave you a token and a header that
 * said "My trips"; there was no screen anywhere on the public site that
 * showed your name, your number, your address or which kind of account you
 * were on. "The worst part is not showing the profile and details when we
 * sign in" was exactly right, and it was not a styling problem -- the data
 * was never requested.
 *
 * It reads `/auth/profile/`, which is the server's copy, rather than
 * rendering whatever was cached at sign-in. A name changed on the handset
 * should be the name shown here.
 *
 * WHAT CAN BE EDITED, AND WHAT CANNOT
 * Name and email can. The phone number cannot: it is the account's identity
 * and `/auth/update/` refuses it on purpose, because letting a stolen access
 * token swap the number is letting it take the account. Changing it needs a
 * code sent to the new number, and that flow is not built. The field says so
 * instead of offering a box that would be rejected.
 */
const ROLE_LABEL: Record<string, string> = {
  rider: 'Rider',
  driver: 'Driver',
  admin: 'Operator',
};

export default function AccountPage() {
  const router = useRouter();
  const session = useSession({ refresh: true });

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const user = session.status === 'in' ? session.user : null;

  // Seed the form from the session once it arrives, and whenever the server
  // copy changes underneath it -- but never while someone is mid-edit, which
  // would overwrite what they are typing.
  useEffect(() => {
    if (editing || !user) return;
    setFullName(user.full_name ?? '');
    setEmail(user.email ?? '');
  }, [user, editing]);

  if (session.status === 'loading') {
    return <p className="text-ink-subtle">Loading…</p>;
  }

  if (session.status === 'out') {
    return (
      <div className="sg-page max-w-md">
        <h1 className="text-3xl font-bold">Your account</h1>
        <div className="card mt-6 space-y-4">
          <Alert kind="info">Sign in to see your profile and details.</Alert>
          <ButtonLink href="/sign-in?next=%2Faccount" variant="primary" block>
            Sign in
          </ButtonLink>
        </div>
      </div>
    );
  }

  const role = session.role;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    if (!fullName.trim()) {
      setError('Tell us what to call you.');
      return;
    }
    if (email.trim() && !looksLikeEmail(email)) {
      setError('Enter a valid email address, or leave it blank.');
      return;
    }
    setBusy(true);
    try {
      await updateProfile({
        full_name: fullName.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setEditing(false);
      setSaved(true);
    } catch (err) {
      // The server names the field it refused; there is only one editable
      // pair here, so the message itself is enough.
      setError(
        messageFor(
          err,
          err instanceof ApiError && err.status === 409
            ? 'That email address is already on another account.'
            : 'We could not save those changes.',
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sg-page max-w-2xl space-y-sg-5">
      <header className="flex items-start justify-between gap-sg-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold m-0">
            {user?.full_name?.trim() || 'Your account'}
          </h1>
          <p className="text-ink-muted mt-sg-1 m-0">
            {user?.phone_number || 'No number on file'}
          </p>
        </div>
        <Badge tone="neutral">{ROLE_LABEL[role] ?? role}</Badge>
      </header>

      {error && <Alert kind="error">{error}</Alert>}
      {saved && <Alert kind="success">Your details are saved.</Alert>}

      <section className="card space-y-sg-4">
        <h2 className="text-xl font-semibold m-0">Profile</h2>

        {editing ? (
          <form onSubmit={onSave} className="space-y-4" noValidate>
            <Field
              label="Full name"
              name="fullName"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
            <Field
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              help="Receipts go here. An address can belong to one account only."
            />
            <SubmitButton busy={busy} busyLabel="Saving…">
              Save changes
            </SubmitButton>
            <Button
              variant="ghost"
              block
              onClick={() => {
                setEditing(false);
                setError(null);
                setFullName(user?.full_name ?? '');
                setEmail(user?.email ?? '');
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <>
            <dl className="grid gap-sg-3 sm:grid-cols-2">
              <div>
                <dt className="caption text-ink-subtle">Full name</dt>
                <dd className="font-semibold">{user?.full_name || 'Not set'}</dd>
              </div>
              <div>
                <dt className="caption text-ink-subtle">Email address</dt>
                <dd className="font-semibold break-words">
                  {user?.email || 'Not set'}
                </dd>
              </div>
              <div>
                <dt className="caption text-ink-subtle">Mobile number</dt>
                <dd className="font-semibold sg-num">
                  {user?.phone_number || 'Not set'}
                </dd>
              </div>
              <div>
                <dt className="caption text-ink-subtle">Account type</dt>
                <dd className="font-semibold">{ROLE_LABEL[role] ?? role}</dd>
              </div>
            </dl>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit details
            </Button>
            <p className="caption text-ink-subtle m-0">
              Your mobile number is how we identify your account and how your
              driver reaches you, so it cannot be changed here. Contact support
              to change it.
            </p>
          </>
        )}
      </section>

      <section className="card space-y-sg-3">
        <h2 className="text-xl font-semibold m-0">
          {role === 'driver' ? 'Driving' : 'Riding'}
        </h2>
        {role === 'driver' ? (
          <ButtonLink href="/driver/home" variant="secondary">
            Driver home
          </ButtonLink>
        ) : (
          <ButtonLink href="/my-trips" variant="secondary">
            Your trips and receipts
          </ButtonLink>
        )}
      </section>

      <section className="card space-y-sg-3">
        <h2 className="text-xl font-semibold m-0">Session</h2>
        <Button
          variant="ghost"
          onClick={() => {
            clearRiderTokens();
            router.replace('/');
          }}
        >
          Sign out
        </Button>
      </section>
    </div>
  );
}
