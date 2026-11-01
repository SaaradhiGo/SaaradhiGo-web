'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { stamp } from '@/lib/consoleTime';
import type { Catalogue } from '@/lib/reports';
import { Empty, ErrorState, PageHeader, Skeleton } from '@/components/console/ui';

/**
 * Reports & Analytics: the catalogue.
 *
 * Cards by area, listing only the reports this role may open (the server decides: a money report
 * needs a finance capability, the promotion-cost report also opens for promo.read). Every report is
 * read from daily rollups, never from a live scan of trips, and says when it was last rebuilt.
 */
export default function ReportsPage() {
  const [data, setData] = useState<Catalogue | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setData(null);
    setError(null);
    try {
      setData(await api.get<Catalogue>('/reports/admin/catalogue/'));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the report catalogue.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHeader title="Reports"
        subtitle="Trips, revenue, supply, riders, safety and fraud, by city and day. Read-only; money is shown per currency and never added across currencies." />
      {data === null && !error ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the report catalogue</span>
          <Skeleton kind="row" count={4} />
        </div>
      ) : error ? (
        <ErrorState title="The catalogue could not be loaded" detail={error} onRetry={() => void load()} />
      ) : data && data.areas.length === 0 ? (
        <Empty title="No reports for your role" detail="Your role does not include any report." />
      ) : data ? (
        <>
          <p className="rp-asof" role="status">
            {data.as_of ? `Data as of ${stamp(data.as_of)} (last rebuild).` : 'No rollup has been built yet.'}{' '}
            {data.cities.length} {data.cities.length === 1 ? 'city' : 'cities'} in your scope.
          </p>
          {data.areas.map((area) => (
            <section key={area.area} aria-labelledby={`area-${area.area}`} className="rp-area">
              <h2 id={`area-${area.area}`} className="rp-area__title">{area.area}</h2>
              <div className="rp-cards">
                {area.reports.map((r) => (
                  <Link key={r.key} href={`/reports/${r.key}`} className="rp-card">
                    <b>{r.title}</b>
                    <span>{r.description}</span>
                    {r.money ? <small>Money, per currency</small> : null}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </>
      ) : null}
    </>
  );
}
