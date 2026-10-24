'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zone, fetchZones } from '@/lib/markets';
import { ButtonLink } from '@/components/sg/Button';

/**
 * Where SaaradhiGo actually operates, read from `GET /pricing/zones/`.
 *
 * This replaces a claim with a fact. The zones are the same rows the server
 * prices rides against, so the page cannot advertise a city the dispatcher
 * does not know about, and it cannot go stale when a new one opens.
 *
 * All four states are real:
 *   loading  - a row of placeholders, not a blank gap
 *   empty    - no zone is live yet, said plainly, with a way to ask
 *   error    - the list could not be loaded; the rest of the page still works
 *   loaded   - the cities, grouped by country
 *
 * The empty state matters most. A pre-launch deployment has no zones, and a
 * marketing page that implies coverage it does not have is the first promise
 * a rider finds broken.
 *
 * A plain `sg-h2` and the cities as `sg-chip`s. The data, the four states
 * and the endpoint are unchanged.
 */
export default function ServiceAreas() {
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchZones()
      .then((z) => alive && setZones(z))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  // A plain section label. This used to be a gold rule over a letterspaced
  // eyebrow and an italic headline -- the same construction as every other
  // section, which is what made the page read as generated rather than as a
  // product telling you where it operates.
  const head = <h2 className="sg-h2">Where we operate</h2>;

  if (failed) {
    return (
      <div>
        {head}
        <p className="sg-lead mt-sg-3">
          We could not load our service areas just now.{' '}
          <Link href="/contact" className="sg-link">
            Ask us where we run
          </Link>
          .
        </p>
      </div>
    );
  }

  if (zones === null) {
    return (
      <div>
        {head}
        <div className="mt-sg-4 flex flex-wrap gap-sg-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-9 w-28 rounded-sg-pill bg-bg-200 animate-pulse" />
          ))}
        </div>
        <p className="sr-only" role="status">
          Loading service areas
        </p>
      </div>
    );
  }

  if (zones.length === 0) {
    return (
      <div>
        {head}
        <p className="sg-lead mt-sg-3">
          We are not live in any city yet. Create an account and we will tell
          you when we reach yours.
        </p>
        <div className="mt-sg-5">
          <ButtonLink href="/sign-up" variant="secondary">
            Create an account
          </ButtonLink>
        </div>
      </div>
    );
  }

  const byCountry = zones.reduce<Record<string, Zone[]>>((acc, z) => {
    (acc[z.country] ||= []).push(z);
    return acc;
  }, {});

  return (
    <div>
      {head}
      <p className="sg-lead mt-sg-3">
        {zones.length === 1
          ? 'One service area is live today.'
          : `${zones.length} service areas are live today.`}
      </p>
      <div className="mt-sg-5 grid gap-sg-4">
        {Object.entries(byCountry).map(([country, list]) => (
          <div key={country}>
            {/* The country heading only earns its place when there is more
                than one. On a single-market deployment it is a bare "IN"
                above the cities, which tells a rider nothing they did not
                already know from the city names. */}
            {Object.keys(byCountry).length > 1 && (
              <h3 className="label uppercase text-ink-subtle">{country}</h3>
            )}
            <ul className="mt-sg-2 flex flex-wrap gap-sg-2">
              {list.map((z) => (
                <li key={z.code} className="sg-chip">
                  {z.city || z.name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
