'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, ButtonLink } from '@/components/sg/Button';
import { clearRiderTokens } from '@/lib/publicAuth';
import { useSession } from '@/lib/useSession';
import { useT } from '@/i18n/LocaleProvider';

/**
 * The right-hand side of the nav.
 *
 * IT USED TO KNOW ONLY THAT A TOKEN EXISTED.
 *
 * So there was exactly one signed-in header, and it was the rider's: a
 * driver who signed in correctly was offered "My trips", landed on the rider
 * homepage, and could not see their own name, number, role or anything a
 * driver does. The sign-in worked; nothing downstream ever asked who it was
 * for. `useSession` answers that now, and this is the first thing to use it.
 *
 * Three signed-in shapes, because there are three kinds of account:
 *
 *   rider   -> My trips, and the account menu
 *   driver  -> Driver, and the account menu
 *   admin   -> Operations console (a separate session; see below)
 *
 * An operator signing in here is a wrong turn rather than an error: the
 * console holds its own session under its own keys. The menu says so and
 * points at it instead of pretending this header can serve them.
 *
 * "Sign up" is the nav's primary action and the only gold fill on the bar.
 * On a page whose own primary is "See fares" or "Confirm Sedan", the nav's
 * primary is suppressed with `quiet` -- one gold button per view means per
 * view, and the nav is part of the view.
 */
/**
 * What to call this person in the header.
 *
 * NEVER THEIR ROLE. The chip used to fall back to "Rider" when the account
 * had no name on it, so the header greeted a person with the category they
 * belong to -- which is not a greeting, it is a label, and it told them
 * nothing they did not know. An account with no name still has an address
 * or a number, and either of those is theirs.
 *
 * The order is how a person would introduce themselves: their name, then
 * the address they sign in with, then the number we call. "Account" is the
 * last resort and is at least honest about knowing nothing.
 */
function displayNameFor(user: {
  full_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
} | null) {
  const name = user?.full_name?.trim();
  if (name) return name.split(/\s+/)[0];

  const email = user?.email?.trim();
  if (email && email.includes('@')) return email.split('@')[0];

  const phone = user?.phone_number?.trim();
  if (phone && phone.length >= 4) return `…${phone.slice(-4)}`;

  return 'Account';
}

function initialsFor(user: { full_name?: string | null; email?: string | null } | null) {
  const words = String(user?.full_name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : ''))
      .toUpperCase();
  }
  const email = user?.email?.trim();
  if (email) return email[0].toUpperCase();
  return '·';
}

const ROLE_LABEL: Record<string, string> = {
  rider: 'Rider',
  driver: 'Driver',
  admin: 'Operator',
};

export default function AuthNav({ quiet = false }: { quiet?: boolean }) {
  const router = useRouter();
  const t = useT();
  const session = useSession();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  // A menu that stays open after you click past it is a menu you have to
  // fight. Escape and an outside click both close it.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Rendered as a spacer until the session is known, because localStorage is
  // not readable during server rendering and flashing "Sign in" at someone
  // who is already signed in is the same wrong message, just briefly.
  if (session.status === 'loading') {
    return <div className="h-sg-7" aria-hidden="true" />;
  }

  if (session.status === 'out') {
    return (
      <>
        <ButtonLink href="/sign-in" variant="ghost" size="sm">
          {t.nav.login}
        </ButtonLink>
        <ButtonLink href="/sign-up" variant={quiet ? 'secondary' : 'primary'} size="sm">
          {t.nav.signup}
        </ButtonLink>
      </>
    );
  }

  const { user, role } = session;
  const name = user?.full_name?.trim() || null;
  const contact = user?.email || user?.phone_number || null;
  const shownName = displayNameFor(user);

  function signOut() {
    clearRiderTokens();
    setOpen(false);
    router.replace('/');
  }

  return (
    <>
      {role === 'driver' && (
        <ButtonLink href="/driver/home" variant="ghost" size="sm">
          Driver
        </ButtonLink>
      )}
      {role === 'rider' && (
        <ButtonLink href="/my-trips" variant="ghost" size="sm">
          My trips
        </ButtonLink>
      )}

      <div className="sg-account" ref={wrap}>
        <button
          type="button"
          className="sg-account__chip"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sg-account__avatar" aria-hidden="true">
            {initialsFor(user)}
          </span>
          <span className="sg-account__who">{shownName}</span>
        </button>

        {open && (
          <div className="sg-account__menu" role="menu">
            <div className="sg-account__head">
              <strong>{name || 'Your account'}</strong>
              {contact && <span>{contact}</span>}
              <span className="sg-account__role">{ROLE_LABEL[role] ?? role}</span>
            </div>

            {/* An account with no name on it gets the fix offered, rather
                than being labelled by its category forever. */}
            {!name && role !== 'admin' && (
              <p className="sg-account__note">
                <Link href="/account" onClick={() => setOpen(false)}>
                  Add your name
                </Link>{' '}
                so your driver knows who to look for.
              </p>
            )}

            {role === 'admin' ? (
              <>
                <p className="sg-account__note">
                  Operator accounts sign in to the operations console, which
                  keeps its own session.
                </p>
                <Link href="/login" role="menuitem" onClick={() => setOpen(false)}>
                  Open the console
                </Link>
              </>
            ) : (
              <>
                <Link href="/account" role="menuitem" onClick={() => setOpen(false)}>
                  Profile and details
                </Link>
                {role === 'driver' ? (
                  <Link href="/driver/home" role="menuitem" onClick={() => setOpen(false)}>
                    Driver home
                  </Link>
                ) : (
                  <Link href="/my-trips" role="menuitem" onClick={() => setOpen(false)}>
                    My trips
                  </Link>
                )}
              </>
            )}

            <div className="sg-account__foot">
              <Button variant="secondary" size="sm" block onClick={signOut}>
                Sign out
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
