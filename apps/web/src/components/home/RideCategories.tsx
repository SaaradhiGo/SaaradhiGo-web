'use client';

import { useEffect, useState } from 'react';
import { publicRideName, rideBlurbKey } from '@/lib/vehicles';
import { useLocale } from '@/i18n/LocaleProvider';
import { HOME_COPY } from '@/i18n/home';
import { vehicleGlyphFor } from '@/components/sg/icons';
import { rideGlyph } from '@/components/home/RideGlyphs';
import { primaryArea, fetchServiceAreas } from '@/lib/serviceAreas';
import { serviceabilityAt, type Serviceability } from '@/lib/booking';

/**
 * The classes the pricing service says are priced at the city centre.
 *
 * "from" shows only when the endpoint returns a `min_fare` for the class;
 * nothing is hard-coded, so no price line is better than a wrong one. There
 * is no per-card action: choosing a class needs a priced trip, which /book owns.
 */

/** Whole units in the zone's currency, or null when there is no usable fare. */
export function formatFrom(value: unknown, currency?: string | null): string | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  const cur = currency || 'INR';
  try {
    return new Intl.NumberFormat(cur === 'INR' ? 'en-IN' : 'en', {
      style: 'currency', currency: cur, maximumFractionDigits: 0, minimumFractionDigits: 0,
    }).format(Math.round(n));
  } catch {
    return null;
  }
}

export function RideCategories() {
  const { t, language } = useLocale();
  const h = HOME_COPY[language];
  const [service, setService] = useState<Serviceability | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const area = primaryArea(await fetchServiceAreas());
        if (!area?.centre) {
          if (alive) setService({ serviceable: false, zone: null, vehicle_types: [] });
          return;
        }
        const s = await serviceabilityAt(area.centre);
        if (alive) setService(s);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const categories = service?.vehicle_types ?? null;

  return (
    <section className="hp hp-section" id="rides" aria-labelledby="rides-h">
      <div className="hp-split">
        <div>
          <span className="sg-eyebrow">{h.ridesEyebrow}</span>
          <h2 id="rides-h" className="hp-h2">
            {h.ridesHeading} <em>{h.ridesHeadingEm}</em>
          </h2>
        </div>
        <p className="hp-lead">{h.ridesLead}</p>
      </div>

      {failed && <p className="hp-lead">{t.rides.failed}</p>}

      {categories === null && !failed && (
        <>
          <ul className="hp-rides" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="hp-ride">
                <span className="h-9 w-14 rounded-sg-sm bg-bg-200 animate-pulse" />
                <span className="h-5 w-24 rounded-sg-sm bg-bg-200 animate-pulse" />
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
        <p className="hp-lead">No ride classes are published yet.</p>
      )}

      {categories !== null && categories.length > 0 && (
        <ul className="hp-rides">
          {categories.map((c) => {
            const key = rideBlurbKey(c.type);
            const Fallback = vehicleGlyphFor(c.type);
            const blurb = c.description?.trim() || (key ? t.rideBlurbs[key] : null);
            const from = formatFrom(c.min_fare, service?.zone?.currency);
            return (
              <li key={c.type} className="hp-ride">
                <span className="hp-ride__art" aria-hidden="true">
                  {rideGlyph(key) ?? <Fallback />}
                </span>
                <h3>{publicRideName(c.type, t.rideNames)}</h3>
                {blurb && <p>{blurb}</p>}
                {from && (
                  <span className="hp-ride__from">
                    {h.from} {from}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
