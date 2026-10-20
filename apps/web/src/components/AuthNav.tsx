'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ButtonLink } from '@/components/sg/Button';
import { clearRiderTokens, readRiderToken } from '@/lib/publicAuth';

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
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setSignedIn(Boolean(readRiderToken()));
  }, []);

  if (signedIn === null) {
    return <div className="h-sg-7" aria-hidden="true" />;
  }

  if (!signedIn) {
    return (
      <>
        <ButtonLink href="/sign-in" variant="ghost" size="sm">
          Sign in
        </ButtonLink>
        <ButtonLink href="/sign-up" variant={quiet ? 'secondary' : 'primary'} size="sm">
          Sign up
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
