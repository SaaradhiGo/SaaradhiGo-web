'use client';

import Link from 'next/link';
import { DropMark, PickupMark } from '@/components/art/MiniMaps';
import { LockIcon } from '@/components/sg/SiteIcons';
import { useSite } from '@/i18n/site';
import { ExampleTag } from '@/components/sg/ExampleRequest';
import { EXAMPLE_FARE, rupees } from '@/lib/exampleFare';

/**
 * /ride (approved design, 2026-11-07; Ride.html): the five steps of a ride
 * and "Book a ride" on the left; the fare ticket and what "locked" means on
 * the right. The ticket shows an example amount, marked Example (13 Nov). Fits 1366x768 and 1440x900.
 */
export function RideContent() {
  const r = useSite().ride;

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
        <Link href="/ride/choose" className="s-btn s-btn--primary s-btn--lg s-cta-top">{r.cta}</Link>
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
            <b>{rupees(EXAMPLE_FARE.fareMinor)}</b>
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
