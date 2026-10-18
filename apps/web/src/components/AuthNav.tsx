'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clearRiderTokens, readRiderToken } from '@/lib/publicAuth';

/**
 * The right-hand side of the header.
 *
 * It existed as two static links, so a signed-in rider was still invited to
 * "Sign in" and "Sign up" — controls that did nothing useful and implied the
 * session had not worked. Now it reflects the session: your trips and a sign
 * out when you have one, the two invitations when you do not.
 *
 * Rendered as null until the session is known, because localStorage is not
 * readable during server rendering and flashing "Sign in" at someone who is
 * already signed in is the same wrong message, just briefly.
 */
export default function AuthNav() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    setSignedIn(Boolean(readRiderToken()));
  }, []);

  if (signedIn === null) {
    return <div className="h-11" aria-hidden="true" />;
  }

  if (!signedIn) {
    return (
      <>
        <Link href="/sign-in" className="btn-ghost px-2">
          Sign in
        </Link>
        <Link href="/sign-up" className="btn-primary text-sm px-4 py-2">
          Sign up
        </Link>
      </>
    );
  }

  return (
    <>
      <Link href="/my-trips" className="btn-ghost px-2">
        My trips
      </Link>
      <button
        type="button"
        className="btn-secondary text-sm px-4 py-2"
        onClick={() => {
          clearRiderTokens();
          setSignedIn(false);
          router.replace('/');
        }}
      >
        Sign out
      </button>
    </>
  );
}
