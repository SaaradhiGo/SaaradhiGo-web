'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp } from '@/lib/consoleTime';
import { canReadFraud, evidenceSummary, type Queue } from '@/lib/fraud';
import { NoAccess, PromotionsNav } from '@/components/console/promotions';
import { messageOf } from '@/components/console/notifications';
import { SeverityPill, StatusPill } from '@/components/console/fraud/parts';
import { Empty, ErrorState, PageHeader, Panel, Skeleton } from '@/components/console/ui';

/**
 * Promotions: fraud flags, in short.
 *
 * A blocked referral reward raises a flag. Reviewing them (assigning, dismissing, confirming) now
 * happens in Fraud & Risk; this tab is the summary and the way there, filtered to referral abuse.
 */
const ALL_REFERRAL_FLAGS = '/fraud?kind=referral_abuse&status=';

export default function FraudFlagsPage() {
  const access = useAdminAccess();
  const [data, setData] = useState<Queue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const may = canReadFraud(access);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Queue>(withScope('/fraud/admin/flags/?kind=referral_abuse&limit=5')));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The flags could not be loaded.'));
    }
  }, []);
  useEffect(() => { if (may) void load(); }, [load, may]);

  if (!canOpen(access, 'promotions') || !may) {
    return (<><PageHeader title="Promotions" /><NoAccess what="Fraud flags" /></>);
  }

  const status = data?.facets.status ?? {};
  const waiting = (status.open ?? 0) + (status.in_review ?? 0);
  const total = Object.values(status).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Promotions"
        subtitle="A referral reward that is blocked raises a fraud flag. Reviewing them happens in Fraud & Risk." />
      <PromotionsNav />

      <Panel title="Referral abuse flags">
        {error ? (
          <ErrorState title="The flags could not be loaded" detail={error} onRetry={() => void load()} />
        ) : data === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the flags</span>
            <Skeleton kind="row" count={3} />
          </div>
        ) : total === 0 ? (
          <Empty title="No referral flags" detail="No referral reward has been blocked in your scope." />
        ) : (
          <>
            <p className="fr-sum">
              <b className="sg-num">{waiting}</b> waiting for review · <b className="sg-num">{status.confirmed ?? 0}</b> confirmed
              · <b className="sg-num">{status.dismissed ?? 0}</b> dismissed
            </p>
            <ul className="ops-linklist" aria-label="Latest referral flags">
              {data.results.map((f) => (
                <li key={f.id}>
                  <SeverityPill severity={f.severity} />
                  <Link href={`/fraud/${f.id}`}><b>{f.subject.ref}</b></Link>
                  <span className="pm-wrap">{evidenceSummary(f)}</span>
                  <StatusPill status={f.status} />
                  <span className="muted">{stamp(f.created_at)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3">
          <Link href={ALL_REFERRAL_FLAGS} className="sg-btn sg-btn--secondary sg-btn--sm">Open in Fraud &amp; Risk</Link>
        </p>
      </Panel>
    </>
  );
}
