'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clearRiderTokens, readRiderToken, sessionRoles, switchRole, type PublicRole } from '@/lib/publicAuth';

/** The roles the account holds, sign-out, and the rider/driver switch. */
export function useArea() {
  const router = useRouter();
  const [roles, setRoles] = useState<PublicRole[]>([]);

  useEffect(() => {
    let live = true;
    sessionRoles().then((s) => { if (live && s) setRoles(s.roles); });
    // The server knows the role but this browser lost its token (cleared
    // storage): nothing on the page could load, so start again at sign-in.
    if (!readRiderToken()) signOut();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function signOut() {
    clearRiderTokens();
    fetch('/api/session', { method: 'DELETE' })
      .catch(() => {})
      .finally(() => { router.replace('/sign-in'); router.refresh(); });
  }

  async function switchTo(role: PublicRole) {
    if (await switchRole(role)) {
      router.replace(role === 'driver' ? '/driver' : '/ride');
      router.refresh();
    }
  }

  return { roles, signOut, switchTo, both: roles.length > 1 };
}

/** The visible path, with the internal /rider prefix of a rewrite removed. */
export function areaPath(pathname: string | null): string {
  const p = pathname ?? '/';
  return p.startsWith('/rider/') ? p.slice('/rider'.length) : p;
}
