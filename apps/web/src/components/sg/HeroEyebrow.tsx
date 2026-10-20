'use client';

import { useEffect, useState } from 'react';
import { fetchZones } from '@/lib/markets';

/**
 * "Now in Hyderabad" — read from the server, not written here.
 *
 * The design's hero carries a city name. Hardcoding one would make this the
 * second place in the app that decides where SaaradhiGo operates, and
 * `lib/markets.ts` already says why that is a mistake: a hardcoded market is
 * exactly how `+91` ended up in a sign-up form on a platform meant to run in
 * more than one country. So the eyebrow names the zones the dispatcher
 * actually prices rides in, and names nothing until it knows them.
 *
 * It renders NOTHING while loading, on failure, or when no zone is live. An
 * eyebrow is an aside; an empty one costs the page nothing, where "Now in
 * your city" on a pre-launch deployment is the first promise a visitor finds
 * broken.
 */
export function HeroEyebrow() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchZones()
      .then((zones) => {
        if (!alive) return;
        const cities = Array.from(
          new Set(zones.map((z) => z.city || z.name).filter(Boolean)),
        );
        if (cities.length === 0) return;
        if (cities.length === 1) {
          setText(`Now in ${cities[0]}`);
          return;
        }
        // Two cities read as a pair; more than that reads as a count, because
        // "Now in Hyderabad, Vijayawada, Visakhapatnam and four others" is
        // not an eyebrow.
        if (cities.length === 2) {
          setText(`Now in ${cities[0]} and ${cities[1]}`);
          return;
        }
        setText(`Now in ${cities.length} cities`);
      })
      .catch(() => {
        // The hero does not need this to work. Silence is the right failure.
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!text) return null;
  return <span className="sg-eyebrow">{text}</span>;
}
