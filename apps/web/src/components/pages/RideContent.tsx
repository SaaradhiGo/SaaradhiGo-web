'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert } from '@/components/form';
import { DropMark, PickupMark } from '@/components/art/MiniMaps';
import { LockIcon } from '@/components/sg/SiteIcons';
import { useSite } from '@/i18n/site';
import { ExampleTag } from '@/components/sg/ExampleRequest';
import { exampleFor, moneyOf } from '@/lib/exampleFare';
import { useLegal } from '@/components/sg/LegalProvider';
import { useTr } from '@/i18n/website';
import { fetchZones } from '@/lib/markets';

/**
 * /ride (approved design, 2026-11-07; Ride.html): the five steps of a ride
 * and "Book a ride" on the left; the fare ticket and what "locked" means on
 * the right. The ticket shows an example amount, marked Example (13 Nov). Fits 1366x768 and 1440x900.
 */
export function RideContent() {
  const r = useSite().ride;
  // 14 Nov: the example fare is the market's own (USA: USD, Treasure Valley).
  const ex = exampleFor(useLegal().market);
  const tr = useTr();
  // 17 Nov (PROD round 1): before any city is live, Book says launching soon and points to the fares
  // instead of a booking that cannot happen. The server's city status decides; null while it loads.
  const [live, setLive] = useState<boolean | null>(null);
  useEffect(() => {
    let on = true;
    fetchZones()
      .then((zones) => { if (on) setLive(zones.some((z) => z.city_status === 'live')); })
      .catch(() => { if (on) setLive(true); });
    return () => { on = false; };
  }, []);

  return (
    <section className="s-wrap s-page s-two s-cb">
      <div>
        <h1 className="t-heading">{r.title}</h1>
        <p className="s-lead">{r.lead}</p>
        <ol className="s-steps">
          {r.steps.map((s, i) => (
            <li key={s.title}>
              <span className="s-steps__n" aria-hidden="true">{i + 1}</span>
              <span>
                <b>{s.title}</b>
                <span>{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
        {/* Signed in: the rider area's booking, or for a driver the role gate (13 Nov). A guest keeps
            the fare quote on /book. */}
        {live === false ? (
          <div className="s-cta-top s-stack" data-testid="launching-soon">
            <Alert kind="info">{tr("We're launching soon. Booking opens when we go live.")}</Alert>
            <Link href="/fares" className="s-btn s-btn--primary s-btn--lg">{tr('See the fares')}</Link>
          </div>
        ) : (
          <Link href="/ride/choose" className="s-btn s-btn--primary s-btn--lg s-cta-top">{r.cta}</Link>
        )}
      </div>

      <div className="s-stack">
        <div className="s-ticket">
          <div className="s-ticket__head">
            <span className="t-label">{r.ticketLabel}</span>
            <span className="s-chip">{r.ticketChip}</span>
          </div>
          <div className="s-ticket__main">
            <span className="s-ticket__lock"><LockIcon /></span>
            <span className="t-title">{r.ticketTitle}</span>
          </div>
          <hr />
          <div className="s-ticket__stops">
            <span><PickupMark />{r.ticketPickup}</span>
            <span><DropMark />{r.ticketDest}</span>
          </div>
          <hr />
          <div className="s-ticket__fare" data-testid="example-fare" data-example="">
            <ExampleTag />
            <b>{moneyOf(ex.fareMinor, ex.currency)}</b>
          </div>
        </div>
        <div className="s-note">
          <b>{r.lockedTitle}</b>
          <ul>
            {r.locked.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
      </div>
    </section>
  );
}
