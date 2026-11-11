'use client';

import { useId } from 'react';
import { WINDOWS, Window } from '@/lib/commandCentre';

/**
 * Which city, over which window.
 *
 * The city list is whatever the overview returned: the server has already
 * intersected it with what the operator holds, so a Hyderabad City Ops
 * Manager sees one option and no "All cities", while a Super Admin sees
 * every live city plus "All cities". One city is a label, not a control
 * (a select with one option cannot be operated, and a person who tries it
 * once stops trusting the rest).
 *
 * The window is a segmented control with `aria-pressed`, so the chosen
 * one is announced, not only coloured.
 */
export function CityWindowBar({
  cities,
  city,
  onCity,
  window: win,
  onWindow,
  disabled = false,
}: {
  cities: Array<{ code: string; name: string; status: string }>;
  city: string | null;
  onCity: (code: string | null) => void;
  window: Window;
  onWindow: (w: Window) => void;
  disabled?: boolean;
}) {
  const cityId = useId();
  const several = cities.length > 1;
  return (
    <div className="ops-cc-bar" role="region" aria-label="City and window">
      <div className="ops-cc-bar__city">
        <label className="ops-cc-bar__label" htmlFor={cityId}>City</label>
        {several ? (
          <select
            id={cityId}
            className="ops-select"
            value={city ?? ''}
            disabled={disabled}
            onChange={(e) => onCity(e.target.value || null)}
          >
            <option value="">All cities</option>
            {cities.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}{c.status !== 'active' ? ` (${c.status})` : ''}
              </option>
            ))}
          </select>
        ) : (
          <span className="ops-cc-bar__static" id={cityId}>
            <b>{cities[0]?.name ?? '—'}</b>
            {cities[0] && cities[0].status !== 'active' ? <small>{cities[0].status}</small> : null}
          </span>
        )}
      </div>
      <div className="ops-seg" role="group" aria-label="Window">
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            type="button"
            className="ops-seg__btn"
            aria-pressed={w.key === win}
            disabled={disabled}
            onClick={() => onWindow(w.key)}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );
}
