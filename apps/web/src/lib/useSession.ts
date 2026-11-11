'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  SESSION_EVENT,
  SessionUser,
  fetchProfile,
  readRiderToken,
  readSessionUser,
} from '@/lib/publicAuth';

export type Session =
  | { status: 'loading'; user: null; role: null }
  | { status: 'out'; user: null; role: null }
  | { status: 'in'; user: SessionUser | null; role: string };

/**
 * Who is signed in, for any client component that needs to know.
 *
 * `status` starts at 'loading' and is never 'out' until the browser has
 * actually been read. Rendering a signed-out header for one frame to a
 * person who is signed in is the same wrong answer as rendering it forever,
 * and it was visible as a flicker on every navigation.
 *
 * It re-reads on three triggers, which are the three ways the answer
 * changes: a route change, a sign-in or sign-out in this tab, and the same
 * in another tab.
 *
 * `refresh` is optional and off by default. The header does not need a
 * network round trip to know a role it already has; the account page does,
 * because it displays fields that may have changed elsewhere.
 */
export function useSession({ refresh = false } = {}): Session {
  const pathname = usePathname();
  const [session, setSession] = useState<Session>({
    status: 'loading',
    user: null,
    role: null,
  });

  const read = useCallback(() => {
    if (!readRiderToken()) {
      setSession({ status: 'out', user: null, role: null });
      return false;
    }
    const user = readSessionUser();
    setSession({
      status: 'in',
      user,
      // A session with a token but no stored account is one created before
      // the account was kept, or one whose copy was cleared. It is still a
      // session; it is simply a rider until the server says otherwise.
      role: String(user?.role || 'rider'),
    });
    return true;
  }, []);

  useEffect(() => {
    read();
  }, [read, pathname]);

  useEffect(() => {
    window.addEventListener(SESSION_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(SESSION_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, [read]);

  useEffect(() => {
    if (!refresh) return;
    if (!readRiderToken()) return;
    // A failure here is not a sign-out: an offline browser or a 502 must not
    // throw away a session the person still holds.
    fetchProfile()
      .then(() => read())
      .catch(() => {});
  }, [refresh, read]);

  return session;
}
