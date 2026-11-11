'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { RECOVERY_LOW_EVENT, readRecoveryLow, writeRecoveryLow } from '@/lib/api';

/**
 * "Only N recovery codes left", after a sign-in that spent one.
 *
 * The sign-in response says how many remain and whether that is low; the
 * sign-in page cannot show it, because the next thing it does is leave.
 * So it notes the count for this browser session and the shell shows this
 * on the first console page -- a standing notice, gold not red, with the
 * one action that fixes it. Dismissing it, or regenerating, clears the
 * note; the next sign-in that spends a code sets it again.
 */
export function RecoveryLowBanner() {
  const [remaining, setRemaining] = useState<number | null>(null);

  // Read after mount: storage is not available during server rendering,
  // and a notice the server did not render must not appear mid-hydration.
  // Re-read when the note changes: regenerating on the Security page
  // clears it, and the banner above that page should go with it.
  useEffect(() => {
    const read = () => setRemaining(readRecoveryLow());
    read();
    window.addEventListener(RECOVERY_LOW_EVENT, read);
    return () => window.removeEventListener(RECOVERY_LOW_EVENT, read);
  }, []);

  if (remaining === null) return null;

  function dismiss() {
    writeRecoveryLow(null);
    setRemaining(null);
  }

  const n = remaining;
  return (
    <div className="ops-banner ops-banner--row" role="status">
      <b>
        {n === 0 ? 'No recovery codes left' : `Only ${n} recovery code${n === 1 ? '' : 's'} left`}
      </b>
      <span>
        {n === 0
          ? 'If you lose your authenticator now there is no way back in without an administrator. '
          : 'Regenerate them before the last one is spent. '}
        <Link href="/settings/security" className="ops-banner__link" onClick={dismiss}>
          Regenerate them in Security
        </Link>
      </span>
      <button type="button" className="ops-banner__dismiss" onClick={dismiss} aria-label="Dismiss this notice">
        Dismiss
      </button>
    </div>
  );
}
