'use client';

import { useEffect, useState } from 'react';
import type { AdminAccess } from '@/lib/adminScope';
import { canAny } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { EMPTY_COUNTS, QUEUE_PERMISSION, fetchQueueCounts, type QueueCounts } from '@/lib/consoleQueues';
import { MetricTile, TileGrid } from '@/components/console/ui';

/**
 * The few numbers that need a person now, large, each linking to its list.
 * Counts come from the same scoped queries as the sidebar badges; a tile
 * the operator cannot open is not drawn, and an unknown count reads
 * "Unavailable", never 0.
 */
export function ActionTiles({ access }: { access: AdminAccess | null }) {
  const [c, setC] = useState<QueueCounts>(EMPTY_COUNTS);
  useEffect(() => {
    let live = true;
    void fetchQueueCounts(access).then((n) => { if (live) setC(n); });
    return () => { live = false; };
  }, [access]);
  const tone = (n: number | null, urgent = false) => (n ? (urgent ? 'urgent' : 'wait') : 'neutral') as 'urgent' | 'wait' | 'neutral';
  // A tile needs both the page and the count's own permission (Approvals opens for
  // viewers, but "waiting for you" needs approval.check).
  const show = (page: Parameters<typeof canOpen>[1], key: keyof typeof QUEUE_PERMISSION) =>
    canOpen(access, page) && canAny(access, QUEUE_PERMISSION[key]);
  const tiles = [
    show('safety', 'sosOpen') && <MetricTile key="sos" label="Open SOS" value={c.sosOpen} tone={tone(c.sosOpen, true)} href="/ops/safety-ops" />,
    show('approvals', 'approvalsWaiting') && <MetricTile key="appr" label="Approvals waiting for you" value={c.approvalsWaiting} tone={tone(c.approvalsWaiting)} href="/ops/approvals" />,
    show('withdrawals', 'withdrawalsPending') && <MetricTile key="pay" label="Payouts waiting" value={c.withdrawalsPending} tone={tone(c.withdrawalsPending)} href="/ops/finance/payouts?status=pending" />,
    show('drivers', 'driversAwaiting') && <MetricTile key="kyc" label="KYC queue" value={c.driversAwaiting} tone={tone(c.driversAwaiting)} href="/ops/kyc" />,
  ].filter(Boolean);
  if (!tiles.length) return null;
  return <TileGrid variant="lead">{tiles}</TileGrid>;
}
