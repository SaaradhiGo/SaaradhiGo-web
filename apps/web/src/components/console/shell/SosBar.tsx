'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { type AdminAccess, can, withScope } from '@/lib/adminScope';
import { type NeedsItem, type NeedsResponse, sosClock } from '@/lib/workspace';

const POLL_MS = 15_000;


/**
 * The red bar (design boards C and D): while any SOS in the operator's area is
 * not acknowledged, every page says so at the top, with the oldest one's
 * clock and a way straight to it. Only for staff who answer SOS
 * (`safety.respond` or `trip.write`); it is never shown to anyone else.
 */
export function SosBar({ access }: { access: AdminAccess | null }) {
  const [items, setItems] = useState<NeedsItem[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const answers = can(access, 'safety.respond') || can(access, 'trip.write');

  useEffect(() => {
    if (!answers) return undefined;
    let alive = true;
    const load = () => {
      void api.get<NeedsResponse>(withScope('/command-centre/admin/needs-action/?limit=20'))
        .then((r) => {
          if (!alive) return;
          setItems(r.items.filter((i) => i.kind === 'sos' && i.severity === 'critical'));
          setFetchedAt(Date.now());
        })
        .catch(() => undefined);
    };
    load();
    const poll = window.setInterval(load, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { alive = false; window.clearInterval(poll); window.clearInterval(tick); };
  }, [answers]);

  if (!answers || items.length === 0) return null;
  const oldest = items.reduce((a, b) => (b.age_seconds > a.age_seconds ? b : a));
  const age = oldest.age_seconds + Math.round((now - fetchedAt) / 1000);
  const places = Array.from(new Set(items.map((i) => i.where?.name).filter(Boolean))).slice(0, 3);
  const href = items.length === 1 ? items[0].link : '/safety-ops';
  return (
    <Link href={href} className="ops-sosbar" role="alert">
      <span className="ops-sosbar__tag">SOS</span>
      <b>
        {items.length === 1 ? `${oldest.ref} not acknowledged` : `${items.length} SOS not acknowledged`}
      </b>
      <span className="sg-num">oldest {sosClock(age)}</span>
      {places.length ? <span>{places.join(', ')}</span> : null}
      {oldest.viewers?.length ? <span>{oldest.viewers.join(', ')} viewing</span> : null}
      <span className="ops-sosbar__go">{items.length === 1 ? 'Open it' : 'Open the safety board'} →</span>
    </Link>
  );
}
