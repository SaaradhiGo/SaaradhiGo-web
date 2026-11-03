'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { PageLink } from '@/components/console/PageLink';

/** The one sentence a maker sees before deciding their own request (owner, 2026-11-03). */
export const SELF_APPROVAL_LINE = 'You raised this request. You are approving it yourself because no one else can check it yet. This is recorded as self-approved.';

/** Shortest reason the server accepts on a self-approval. */
export const SELF_APPROVAL_MIN_REASON = 10;

/**
 * "Self-approval is on: N decisions self-approved", on the Command Centre for
 * as long as APPROVALS_SOLO_SUPER_ADMIN is switched on (owner, 2026-11-03).
 * Not dismissable: it is the standing record that one person is both maker
 * and checker. Links to those requests in Approvals. Shows nothing to an
 * operator who cannot read approvals, or while the exception is off.
 */
export function SelfApprovalNotice() {
  const [state, setState] = useState<{ on: boolean; count: number } | null>(null);
  useEffect(() => {
    let live = true;
    api.get<{ count: number; self_approval_on?: boolean }>('/approvals/admin/requests/?self_approved=1&page_size=1')
      .then((d) => { if (live) setState({ on: !!d.self_approval_on, count: d.count ?? 0 }); })
      .catch(() => { if (live) setState(null); });
    return () => { live = false; };
  }, []);
  if (!state?.on) return null;
  return (
    <div className="ops-banner ops-banner--row" role="status">
      <b>
        Self-approval is on:{' '}
        <PageLink page="approvals" href="/approvals?view=self">
          {state.count} decision{state.count === 1 ? '' : 's'} self-approved
        </PageLink>
      </b>
      <span>Until a second person can check requests, the one Super Admin decides their own, with a reason.</span>
    </div>
  );
}
