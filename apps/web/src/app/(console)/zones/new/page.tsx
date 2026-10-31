'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { canDraftZones, type City, type Zone } from '@/lib/zones';
import { ZoneEditor } from '@/components/console/zones/ZoneEditor';
import { Empty, PageHeader, Panel, Skeleton } from '@/components/console/ui';

/**
 * A new zone: pick a city, draw the shape, read what it would do, send it for approval.
 * Creating a zone needs a CITY in the operator's scope and `zone.write`; the zone does not
 * exist until a different admin approves the request.
 */
function asList<T>(r: unknown): T[] {
  const o = r as { results?: T[]; data?: T[] } | T[];
  if (Array.isArray(o)) return o;
  if (Array.isArray(o?.results)) return o.results;
  if (Array.isArray(o?.data)) return o.data;
  return [];
}

export default function NewZonePage() {
  const access = useAdminAccess();
  const may = canDraftZones(access);
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      const [z, c] = await Promise.all([
        api.get<unknown>('/pricing/admin/zones/').catch(() => []),
        api.get<{ results: City[] }>('/pricing/admin/zones/cities/').catch(() => ({ results: [] })),
      ]);
      if (!live) return;
      setZones(asList<Zone>(z));
      setCities(c.results ?? []);
    })();
    return () => { live = false; };
  }, []);

  return (
    <>
      <PageHeader
        title="New zone"
        subtitle="Draw the shape, read what it would change, and send it for approval. Nothing exists until a different admin approves."
        actions={<Link href="/zones" className="sg-btn sg-btn--ghost sg-btn--sm">All zones</Link>}
      />
      {sent ? (
        <div className="ops-confirm mb-4" role="status"><b>{sent}</b> <Link href="/zones" className="ops-linkbtn">Back to zones</Link></div>
      ) : null}
      {!may ? (
        <Empty title="You cannot draft zones" detail="Drawing a zone needs the zone.write capability in a city." />
      ) : zones === null ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading</span>
          <Skeleton kind="row" count={4} />
        </div>
      ) : cities.length === 0 ? (
        <Empty title="No city to draw in" detail="A zone belongs to a city in your scope, and none is available to you." />
      ) : (
        <Panel title="Draft">
          <ZoneEditor zone={null} zones={zones} cities={cities} onSent={(m) => setSent(m)} />
        </Panel>
      )}
    </>
  );
}
