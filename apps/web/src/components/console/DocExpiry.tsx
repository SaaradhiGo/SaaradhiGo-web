'use client';

import { marketDate } from '@/lib/consoleTime';
import { expiryCheck, localToday } from '@/lib/kycReview';
import { StatusChip } from '@/components/console/kit/StatusChip';

/** Within this many days an expiry is shown in amber ("expires in N days"). */
export const EXPIRY_WARN_DAYS = 30;

/**
 * A document's expiry in the console (13 Nov): "Expires 31/10/2028", amber "expires in N days"
 * within 30 days, red "expired N days ago" after. Nothing when the document has no expiry.
 */
export function DocExpiry({ iso, country = 'IN', today = localToday() }: {
  iso: string | null | undefined; country?: string; today?: string;
}) {
  if (!iso) return null;
  const check = expiryCheck(iso, today);
  if (check.state === 'none') return null;
  const date = marketDate(iso, country);
  if (check.state === 'expired') {
    return (
      <span className="ops-doc__expiry" data-testid="doc-expiry">
        Expired {date} <StatusChip tone="critical">expired {check.days} day{check.days === 1 ? '' : 's'} ago</StatusChip>
      </span>
    );
  }
  return (
    <span className="ops-doc__expiry" data-testid="doc-expiry">
      Expires {date}
      {check.days <= EXPIRY_WARN_DAYS ? <> <StatusChip tone="caution">expires in {check.days} day{check.days === 1 ? '' : 's'}</StatusChip></> : null}
    </span>
  );
}
