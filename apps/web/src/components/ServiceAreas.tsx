'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Zone, fetchZones } from '@/lib/markets';

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

  if (failed) {
    return (
      <div className="card">
        <h2 className="text-2xl font-semibold">Where we operate</h2>
        <p className="mt-3 text-white/60">
          We could not load our service areas just now.{' '}
          <Link href="/contact" className="text-brand hover:underline">
            Ask us where we run
          </Link>
          .
        </p>
      </div>
    );
  }

  if (zones === null) {
    return (
      <div className="card">
        <h2 className="text-2xl font-semibold">Where we operate</h2>
        <div className="mt-4 flex flex-wrap gap-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-8 w-28 rounded-lg bg-white/5 animate-pulse"
            />
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
      <div className="card">
        <h2 className="text-2xl font-semibold">Where we operate</h2>
        <p className="mt-3 text-white/70">
          We are not live in any city yet. Create an account and we will tell
          you when we reach yours.
        </p>
        <Link href="/sign-up" className="btn-primary inline-flex mt-4">
          Create an account
        </Link>
      </div>
    );
  }

  const byCountry = zones.reduce<Record<string, Zone[]>>((acc, z) => {
    (acc[z.country] ||= []).push(z);
    return acc;
  }, {});

  return (
    <div className="card">
      <h2 className="text-2xl font-semibold">Where we operate</h2>
      <p className="mt-2 text-sm text-white/60">
        {zones.length === 1
          ? 'One service area is live today.'
          : `${zones.length} service areas are live today.`}
      </p>
      <div className="mt-4 space-y-4">
        {Object.entries(byCountry).map(([country, list]) => (
          <div key={country}>
            <h3 className="text-xs uppercase tracking-widest text-white/45">
              {country}
            </h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {list.map((z) => (
                <li
                  key={z.code}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm"
                >
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
