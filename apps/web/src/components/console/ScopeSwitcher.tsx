'use client';

import { useEffect, useState } from 'react';
import {
  AdminAccess,
  AdminScope,
  readSelectedScope,
  writeSelectedScope,
} from '@/lib/adminScope';

/**
 * Which region the operator is looking at: country, then city.
 *
 * TWO STEPS, NOT ONE LIST. One console serves India and the USA, and a
 * flat list of every city the operator holds reads as a jumble once it
 * crosses a border. Country first, then the cities inside it, grouped by
 * state. Only scopes the operator actually holds are offered -- the
 * server sends the held nodes plus their descendants and nothing else, and
 * refuses a `?scope=` it did not offer, so this control cannot widen a
 * view, only narrow one.
 *
 * WHY IT IS NOT ALWAYS A CONTROL
 * ------------------------------
 * Most operators hold exactly one city. A select with one option is a
 * control that cannot be operated, and an operator who tries it once stops
 * trusting the rest of the interface. One scope renders as a label: it
 * still answers "where am I", which matters when the same console serves
 * Hyderabad and Austin.
 *
 * AN UNMIGRATED ACCOUNT IS TOLD SO
 * --------------------------------
 * While the access migration is open, an account with no assignments sees
 * every region. Drawing a picker there would imply a restriction that is
 * not being enforced, so it says "All regions — not yet scoped" instead.
 *
 * Changing the scope reloads the page rather than re-fetching in place.
 * Every console page reads the selection when it queries, and a reload is
 * the one way to be sure none of them is still showing the previous
 * region's rows -- which, on a page about money, is worth a flicker.
 *
 * `.ops__scope` and its inner text are read by scripts/verify-scope.mjs;
 * the class and the visible region name stay.
 */
export function ScopeSwitcher({ access }: { access: AdminAccess | null }) {
  const [selected, setSelected] = useState<string | null>(null);

  // After mount only: localStorage does not exist during server rendering,
  // and reading it in useState makes the two renders disagree (React error
  // 418, which this console already shipped once).
  useEffect(() => setSelected(readSelectedScope()), []);

  if (!access) return null;

  if (access.access_model === 'legacy_unscoped') {
    return (
      <div className="ops__scope">
        <span className="ops__scope-label">Region</span>
        <span className="ops__scope-static">
          <b>All regions</b>
          <small>Not yet scoped</small>
        </span>
      </div>
    );
  }

  const { scopes } = access;
  if (scopes.length === 0) return null;

  if (scopes.length === 1) {
    return (
      <div className="ops__scope">
        <span className="ops__scope-label">Region</span>
        <span className="ops__scope-static">
          <b>{scopes[0].name}</b>
          {scopes[0].status !== 'active' && <small>{scopes[0].status}</small>}
        </span>
      </div>
    );
  }

  function change(code: string) {
    writeSelectedScope(code || null);
    window.location.reload();
  }

  const held = (s: AdminScope) => scopes.find((x) => x.code === s.code);
  const countries = scopes.filter((s) => s.kind === 'country');
  const current = selected ? held({ code: selected } as AdminScope) : undefined;

  // The country the selection sits inside, or the only one held.
  const countryOf = (code: string | null) =>
    countries.find((c) => code === c.code || (code ?? '').startsWith(c.code + '-'));
  const country = countryOf(selected) ?? (countries.length === 1 ? countries[0] : undefined);

  // Cities inside that country, grouped by state so Hyderabad reads as being
  // in Telangana without a tree widget.
  const within = (parent: AdminScope | undefined, kind: string) =>
    parent ? scopes.filter((s) => s.kind === kind && s.code.startsWith(parent.code + '-')) : [];
  const states = within(country, 'state');
  const cities = within(country, 'city');
  const cityOptions = states.length
    ? states.map((st) => ({ state: st, cities: within(st, 'city') }))
    : [{ state: null, cities }];
  const cityValue = current?.kind === 'city' ? current.code : '';

  // More than one country held (or the whole platform): the country step is
  // a control. Exactly one: it is a label, and only the city changes.
  const countryControl = countries.length > 1 || scopes.some((s) => s.kind === 'global');

  return (
    <div className="ops__scope">
      <span className="ops__scope-label" id="ops-scope-label">Region</span>
      {countryControl ? (
        <select
          className="ops__scope-select"
          aria-label="Country"
          value={country?.code ?? ''}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">All regions</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}{c.status !== 'active' ? ` (${c.status})` : ''}
            </option>
          ))}
        </select>
      ) : country ? (
        <span className="ops__scope-static"><b>{country.name}</b></span>
      ) : null}

      {country && cities.length > 0 && (
        <>
          <span className="ops__scope-arrow" aria-hidden="true">›</span>
          <select
            className="ops__scope-select"
            aria-label="City"
            value={cityValue}
            onChange={(e) => change(e.target.value || country.code)}
          >
            <option value="">All of {country.name}</option>
            {cityOptions.map(({ state, cities: list }) => state ? (
              <optgroup key={state.code} label={state.name}>
                {list.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}{c.status !== 'active' ? ` (${c.status})` : ''}
                  </option>
                ))}
              </optgroup>
            ) : list.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}{c.status !== 'active' ? ` (${c.status})` : ''}
              </option>
            )))}
          </select>
        </>
      )}
    </div>
  );
}
