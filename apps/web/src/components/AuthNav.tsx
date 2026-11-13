'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/sg/Button';
import { clearRiderTokens, establishServerSession, readRiderToken, sessionRoles, switchRole, type PublicRole } from '@/lib/publicAuth';
import { useSession } from '@/lib/useSession';
import { useT } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';

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
 *   rider   -> the account menu: Profile (/account), My trips
 *   driver  -> the account menu: Profile (/driver/profile), Driver home
 *   admin   -> Operations console (a separate session; see below)
 *
 * 13 Nov (owner): one account, two roles. The role shown is the ACTIVE one from the server's
 * session (GET /api/session), not the account's original `role`, so an account that rides and
 * drives gets "Switch to riding" / "Switch to driving". The grey "Driver" and "My trips" buttons
 * beside the chip are gone: they looked disabled, and the menu holds the same link.
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
  const pathname = usePathname() ?? '/';
  const t = useT();
  const tr = useTr();
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

  // A browser signed in before the server knew roles (2026-11-08) has a
  // token but no role cookie: hand it over once, so the areas open.
  const [area, setArea] = useState<{ role: PublicRole; roles: PublicRole[] } | null>(null);
  useEffect(() => {
    if (session.status !== 'in') return;
    const token = readRiderToken();
    if (!token) return;
    // 13 Nov: never on a sign-in or sign-up page. There the form is signing the session with the
    // role chosen (driver sign-in -> driver); handing the token over here as well raced it, and
    // whichever answered last won, so an account that rides and drives could land on /driver
    // signed in as a rider.
    if (/^\/(driver\/)?sign-(in|up)$/.test(pathname)) return;
    sessionRoles().then((s) => {
      if (s) setArea(s);
      else establishServerSession(token, pathname.startsWith('/driver') ? 'driver' : undefined).then((e) => e && setArea(e));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status]);

  // Rendered as a spacer until the session is known, because localStorage is
  // not readable during server rendering and flashing "Sign in" at someone
  // who is already signed in is the same wrong message, just briefly.
  if (session.status === 'loading') {
    return <div className="h-sg-7" aria-hidden="true" />;
  }

  if (session.status === 'out') {
    return (
      <>
        <Link href="/sign-in" className="s-header__login">
          {tr('Log in')}
        </Link>
        <Link href="/sign-up" className={quiet ? 's-header__login' : 's-header__signup'}>
          {tr('Sign up')}
        </Link>
      </>
    );
  }

  const { user } = session;
  const role: string = session.role === 'admin' ? 'admin' : (area?.role ?? session.role);
  const other: PublicRole | null = area && area.roles.length > 1 ? (role === 'driver' ? 'rider' : 'driver') : null;
  const profileHref = role === 'driver' ? '/driver/profile' : '/account';
  const name = user?.full_name?.trim() || null;
  const contact = user?.email || user?.phone_number || null;
  const shownName = displayNameFor(user);

  function signOut() {
    clearRiderTokens();
    setOpen(false);
    // The server's role cookie goes too, or the areas would still open for this browser.
    fetch('/api/session', { method: 'DELETE' }).catch(() => {}).finally(() => { router.replace('/'); router.refresh(); });
  }

  async function switchTo(r: PublicRole) {
    setOpen(false);
    if (await switchRole(r)) {
      router.push(r === 'driver' ? '/driver' : '/ride');
      router.refresh();
    }
  }

  return (
    <>
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
                <Link href={profileHref} onClick={() => setOpen(false)}>
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
                <Link href="/ops/login" role="menuitem" onClick={() => setOpen(false)}>
                  Open the console
                </Link>
              </>
            ) : (
              <>
                <Link href={profileHref} role="menuitem" onClick={() => setOpen(false)}>
                  Profile and details
                </Link>
                {role === 'driver' ? (
                  <Link href="/driver" role="menuitem" onClick={() => setOpen(false)}>
                    Driver home
                  </Link>
                ) : (
                  <Link href="/ops/trips" role="menuitem" onClick={() => setOpen(false)}>
                    My trips
                  </Link>
                )}
                {other && (
                  <button type="button" role="menuitem" className="sg-account__switch" onClick={() => switchTo(other)}>
                    {other === 'rider' ? 'Switch to riding' : 'Switch to driving'}
                  </button>
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
