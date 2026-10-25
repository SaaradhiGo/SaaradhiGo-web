'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, ButtonLink } from '@/components/sg/Button';
import { SESSION_EVENT, clearRiderTokens, readRiderToken } from '@/lib/publicAuth';
import { useT } from '@/i18n/LocaleProvider';

/**
 * The right-hand side of the nav.
 *
 * It existed as two static links, so a signed-in rider was still invited to
 * "Sign in" and "Sign up" — controls that did nothing useful and implied the
 * session had not worked. Now it reflects the session: your trips and a sign
 * out when you have one, the two invitations when you do not.
 *
 * Rendered as a spacer until the session is known, because localStorage is
 * not readable during server rendering and flashing "Sign in" at someone who
 * is already signed in is the same wrong message, just briefly. The spacer is
 * the height of the controls it will become, so the nav does not reflow when
 * it resolves.
 *
 * "Sign up" is the nav's primary action and the only gold fill on the bar.
 * On a page whose own primary is "See fares" or "Confirm Sedan", the nav's
 * primary is suppressed with `quiet` -- one gold button per view means per
 * view, and the nav is part of the view.
 */
export default function AuthNav({ quiet = false }: { quiet?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  // IT READ THE SESSION ONCE AND NEVER AGAIN.
  //
  // This component lives in the layout, which survives client-side
  // navigation, so the mount effect ran on the first page a visitor opened
  // and never after. A rider who signed in and was returned to their booking
  // was still shown "Log in" and "Sign up" in the header -- on the page the
  // sign-in had just succeeded into.
  //
  // Three triggers now, because there are three ways the answer changes:
  // a route change, a sign-in or sign-out in this tab (`SESSION_EVENT`), and
  // the same in another tab (the browser's own `storage` event).
  const refresh = useCallback(() => {
    setSignedIn(Boolean(readRiderToken()));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  useEffect(() => {
    window.addEventListener(SESSION_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SESSION_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);

  if (signedIn === null) {
    return <div className="h-sg-7" aria-hidden="true" />;
  }

  if (!signedIn) {
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

  return (
    <>
      <ButtonLink href="/my-trips" variant="ghost" size="sm">
        My trips
      </ButtonLink>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          clearRiderTokens();
          setSignedIn(false);
          router.replace('/');
        }}
      >
        Sign out
      </Button>
    </>
  );
}
