'use client';

import { useEffect, useState } from 'react';
import { Zone, fetchZones } from '@/lib/markets';

/**
 * Where SaaradhiGo is set up to operate.
 *
 * A PRICED ZONE IS NOT PROOF OF A RIDE. `/pricing/zones/` returns the
 * service areas the dispatcher is configured for, and every one of them is
 * serviceable with an active rate card -- but no public endpoint says
 * whether a driver is online in a city right now, and the honest words for
 * that are not "live in four cities".
 *
 * So the cities are named as configured service areas and the caveat is
 * stated once, plainly, instead of being implied by a green dot. A visitor
 * in Warangal finding no car should have been told that availability depends
 * on drivers being online, not that we are live there.
 *
 * The list is the server's. A city cannot be advertised here unless the
 * dispatcher prices it, and a new one appears without a deploy.
 */
export function OperatingCities() {
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

  return (
    <section className="hp hp-section" id="cities" aria-labelledby="cities-h">
      <h2 id="cities-h" className="hp-h2">
        Where we operate
      </h2>

      {failed && (
        <p className="hp-lead">
          We could not load our service areas just now.
        </p>
      )}

      {zones === null && !failed && (
        <>
          <ul className="hp-cities" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="hp-city w-28 animate-pulse" />
            ))}
          </ul>
          <p className="sr-only" role="status">
            Loading service areas
          </p>
        </>
      )}

      {zones !== null && zones.length === 0 && !failed && (
        <p className="hp-lead">
          No service areas are configured yet. Create an account and we will
          tell you when we reach your city.
        </p>
      )}

      {zones !== null && zones.length > 0 && (
        <>
          <p className="hp-lead">
            SaaradhiGo is configured to serve these cities. Whether a ride is
            available at a given moment depends on drivers being online
            nearby.
          </p>
          <ul className="hp-cities">
            {zones.map((z) => (
              <li key={z.code} className="hp-city">
                {z.city || z.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
