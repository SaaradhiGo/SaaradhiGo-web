'use client';

import { useEffect, useState } from 'react';
import { vehicleProductName } from '@/lib/vehicles';
import { vehicleGlyphFor } from '@/components/sg/icons';
import { primaryArea, fetchServiceAreas } from '@/lib/serviceAreas';
import { serviceabilityAt } from '@/lib/booking';

/**
 * The vehicle classes SaaradhiGo actually sells.
 *
 * READ FROM THE PRICING SERVICE. The list is whatever
 * `/pricing/vehicle-types/` returns for a configured city, which is the set
 * of categories holding an active rate card. An earlier homepage advertised
 * "Saaradhi Bike" and "Saaradhi Black"; neither exists in pricing, and a
 * homepage offering a ride nobody can book is the first promise a rider
 * finds broken.
 *
 * NO PRICES, NO ETAs, NO AVAILABILITY. `VehicleType` carries a name and a
 * description and nothing else, and the description is empty for every
 * category today. The copy below says what each class is for, without a
 * capacity, a fare or a waiting time, because the system has none to give.
 *
 * NO PER-CARD BOOKING ACTION. Choosing a class needs a priced trip, which
 * needs a pickup and a destination; the hero collects those and `/book`
 * prices them. A "select" button here would either dead-end or duplicate
 * that flow.
 */
const BLURBS: Record<string, string> = {
  auto: 'A metered three-wheeler for short trips across town.',
  hatchback: 'A compact car for everyday journeys.',
  sedan: 'More room and boot space for longer drives.',
  suv: 'A larger car for groups travelling together.',
};

type Category = { type: string; description: string };

export function RideCategories() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const area = primaryArea(await fetchServiceAreas());
        if (!area?.centre) {
          if (alive) setCategories([]);
          return;
        }
        const service = await serviceabilityAt(area.centre);
        if (alive) setCategories(service.vehicle_types ?? []);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="hp hp-section" id="rides" aria-labelledby="rides-h">
      <h2 id="rides-h" className="hp-h2">
        Choose your ride
      </h2>
      <p className="hp-lead">
        Every class is priced for your trip before you book.
      </p>

      {failed && (
        <p className="hp-lead">
          We could not load our ride classes just now. Set a pickup point on
          the booking page to see what is available near you.
        </p>
      )}

      {/* Loading holds the grid's shape so the page below it does not jump. */}
      {categories === null && !failed && (
        <>
          <ul className="hp-rides" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="hp-ride">
                <span className="hp-ride__art" />
                <span className="h-5 w-28 rounded-sg-sm bg-bg-200 animate-pulse" />
                <span className="h-10 w-full rounded-sg-sm bg-bg-200 animate-pulse" />
              </li>
            ))}
          </ul>
          <p className="sr-only" role="status">
            Loading ride classes
          </p>
        </>
      )}

      {categories !== null && categories.length === 0 && !failed && (
        <p className="hp-lead">
          No ride classes are published yet.
        </p>
      )}

      {categories !== null && categories.length > 0 && (
        <ul className="hp-rides">
          {categories.map((c) => {
            const Glyph = vehicleGlyphFor(c.type);
            // The server's own description wins where it has one.
            const blurb = c.description?.trim() || BLURBS[c.type.toLowerCase()] || null;
            return (
              <li key={c.type} className="hp-ride">
                <span className="hp-ride__art" aria-hidden="true">
                  <Glyph />
                </span>
                <h3>{vehicleProductName(c.type)}</h3>
                {blurb && <p>{blurb}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
