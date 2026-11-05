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

const DEFAULT_CLASSES: { type: string; description?: string; min_fare?: string | null }[] = [
  { type: 'auto' }, { type: 'mini' }, { type: 'sedan' }, { type: 'suv' },
];

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

  // The classes the site launches with, shown at once; the API list replaces them
  // when it arrives, and only the price waits (skeleton) for it.
  const loading = service === null && !failed;
  const categories = service?.vehicle_types ?? DEFAULT_CLASSES;

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

      {service !== null && categories.length === 0 && (
        <p className="hp-lead">No ride classes are published yet.</p>
      )}

      {categories.length > 0 && (
        <ul className="hp-rides" aria-busy={loading || undefined}>
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
                {loading ? (
                  <span className="hp-ride__from-skel animate-pulse" aria-hidden="true" />
                ) : from && (
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
