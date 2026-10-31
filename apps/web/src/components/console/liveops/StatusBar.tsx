'use client';

import { ageText, networkTone, type CityStatus } from '@/lib/liveOps';
import { Pill } from '@/components/console/ui';

/**
 * One card per city: its network status and the counts behind it.
 *
 * The status is a WORD (Normal, High demand, Critical, Offline) with a colour behind it,
 * never a colour alone. A card is a button that picks that city for the map and the lists;
 * pressing it again goes back to every city. Counts are for the cities the operator may see
 * and nothing else: a city outside their scope has no card, and contributes to no number.
 */
export function StatusBar({
  cities, selected, onSelect,
}: {
  cities: CityStatus[];
  selected: string | null;
  onSelect: (code: string | null) => void;
}) {
  if (cities.length === 0) return null;
  return (
    <ul className="lo-cities" aria-label="Network status by city">
      {cities.map((c) => {
        const on = selected === c.code;
        const word = c.network_status === 'HIGH DEMAND' ? 'High demand'
          : c.network_status.charAt(0) + c.network_status.slice(1).toLowerCase();
        const idle = c.online_drivers + c.on_trip_drivers + c.unassigned_trips + c.stale_trips === 0;
        return (
          <li key={c.code}>
            <button
              type="button" className={`lo-city ${idle ? 'lo-city--idle' : ''}`} aria-pressed={on}
              onClick={() => onSelect(on ? null : c.code)}
            >
              <span className="lo-city__head">
                <b>{c.name}</b>
                <Pill tone={networkTone(c.network_status)}>{word}</Pill>
              </span>
              {idle ? <span className="lo-city__sub">Nothing live here right now</span> : null}
              <dl className="lo-city__facts">
                <div><dt>Online</dt><dd>{c.online_drivers}</dd></div>
                <div><dt>On a trip</dt><dd>{c.on_trip_drivers}</dd></div>
                <div>
                  <dt>Waiting for a driver</dt>
                  <dd>
                    {c.unassigned_trips}
                    {c.oldest_unassigned_age_s !== null ? <span className="lo-city__sub"> oldest {ageText(c.oldest_unassigned_age_s)}</span> : null}
                  </dd>
                </div>
                <div><dt>No recent signal</dt><dd>{c.stale_trips}</dd></div>
              </dl>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
