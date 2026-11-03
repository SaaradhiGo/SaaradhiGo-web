'use client';

import { useEffect, useState } from 'react';

import type { AdminAccess } from '@/lib/adminScope';

const DISMISSED = 'sg.console.superAdminBanner.dismissed';

/**
 * "N more named Super Admins needed": the floor, as a standing prompt to the
 * only people who can act on it. Shown on the Command Centre only, and an
 * operator who has read it can put it away for the rest of the session
 * (owner, 2026-11-03). One named Super Admin is a deliberate, warned state,
 * so this is a notice, not an alarm.
 */
export function SuperAdminBanner({ access }: { access: AdminAccess | null | undefined }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(window.sessionStorage.getItem(DISMISSED) === '1');
    } catch {
      setHidden(false);
    }
  }, []);
  const shortfall = access?.super_admin_shortfall ?? 0;
  if (hidden || shortfall <= 0) return null;
  const dismiss = () => {
    try { window.sessionStorage.setItem(DISMISSED, '1'); } catch { /* private window */ }
    setHidden(true);
  };
  return (
    <div className="ops-banner ops-banner--row" role="status">
      <b>{shortfall} more named Super Admin{shortfall === 1 ? '' : 's'} needed</b>
      <span>
        The platform should have two accountable people who can administer it.
        The emergency account does not count.
      </span>
      <button type="button" className="ops-banner__dismiss" onClick={dismiss}>
        Dismiss for this session
      </button>
    </div>
  );
}
