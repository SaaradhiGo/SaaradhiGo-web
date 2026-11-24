'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  type AdminAccess, type AdminScope, readSelectedScope, writeSelectedScope,
} from '@/lib/adminScope';
import { readShowNotLaunched, writeShowNotLaunched } from '@/lib/notLaunched';

/** The held places directly under `parent` (null: the top of what the operator holds). Pure; tested. */
export function childrenOf(scopes: AdminScope[], parent: AdminScope | null): AdminScope[] {
  if (!parent) {
    const min = Math.min(...scopes.map((s) => s.depth));
    return scopes.filter((s) => s.depth === min);
  }
  const prefix = parent.path ?? `/${parent.code}/`;
  return scopes.filter((s) => s.depth === parent.depth + 1 && (s.path ?? '').startsWith(prefix));
}

/** The held ancestors of `scope`, top first, ending with the scope itself. Pure; tested. */
export function ancestry(scopes: AdminScope[], scope: AdminScope): AdminScope[] {
  const byCode = new Map(scopes.map((s) => [s.code, s]));
  const codes = (scope.path ?? `/${scope.code}/`).split('/').filter(Boolean);
  return codes.map((c) => byCode.get(c)).filter((s): s is AdminScope => !!s && s.kind !== 'global');
}

/** A city that is not live is "not launched" and stays out of working lists by default (owner 24 Nov). */
export const isLaunched = (s: AdminScope) => s.kind !== 'city' || s.status === 'active' || s.status === 'paused';

/**
 * Where the operator is looking (owner 24 Nov): a clickable path at the top of every page
 * ("All countries › India › Telangana › Hyderabad") with the next level as chips under it.
 * It replaces the header dropdown; the choice is stored once and every page reads it.
 * A single-city role sees only its city's name. Choosing reloads, so no page shows stale rows.
 */
export function PlaceBar({ access }: { access: AdminAccess | null }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { setSelected(readSelectedScope()); setShowAll(readShowNotLaunched()); }, []);

  // Archived places (owner 24 Nov: Austin) never appear in the place bar.
  const scopes = useMemo(() => (access?.scopes ?? []).filter((s) => s.status !== 'archived'), [access]);
  if (!access || access.access_model === 'legacy_unscoped' || scopes.length === 0) return null;

  const cities = scopes.filter((s) => s.kind === 'city');
  if (scopes.length === 1 || (cities.length === 1 && scopes.every((s) => s.kind === 'city'))) {
    const only = cities[0] ?? scopes[0];
    return <nav className="ops-placebar" aria-label="Place"><b className="ops-placebar__here">{only.name}</b></nav>;
  }

  const current = selected ? scopes.find((s) => s.code === selected) ?? null : null;
  const holdsTop = scopes.some((s) => s.kind === 'global') || childrenOf(scopes, null).length > 1;
  const trail = current ? ancestry(scopes, current) : [];
  const parentForChips = current ?? (scopes.find((s) => s.kind === 'global') ?? null);
  const next = childrenOf(scopes, parentForChips).filter((s) => s.kind !== 'global');
  const hidden = next.filter((s) => !isLaunched(s));
  const anyHidden = scopes.some((s) => !isLaunched(s));
  const chips = showAll ? next : next.filter(isLaunched);

  const choose = (code: string | null) => { writeSelectedScope(code); window.location.reload(); };
  const toggle = () => { writeShowNotLaunched(!showAll); window.location.reload(); };

  return (
    <nav className="ops-placebar" aria-label="Place">
      <ol className="ops-placebar__path">
        {holdsTop ? (
          <li>{current ? <button type="button" className="ops-placebar__step" onClick={() => choose(null)}>All countries</button>
            : <b className="ops-placebar__here" aria-current="location">All countries</b>}</li>
        ) : null}
        {trail.map((s, i) => (
          <li key={s.code}>
            {i === trail.length - 1
              ? <b className="ops-placebar__here" aria-current="location">{s.name}</b>
              : <button type="button" className="ops-placebar__step" onClick={() => choose(s.code)}>{s.name}</button>}
          </li>
        ))}
      </ol>
      {chips.length || anyHidden ? (
        <div className="ops-placebar__chips">
          {chips.map((s) => (
            <button key={s.code} type="button" className="ops-placechip" onClick={() => choose(s.code)}>
              {s.name}{!isLaunched(s) ? <small> · not launched</small> : null}
            </button>
          ))}
          {anyHidden ? (
            <button type="button" className="ops-placebar__toggle" aria-pressed={showAll} onClick={toggle}>
              {showAll ? 'Hide not launched places' : 'Show not launched'}
            </button>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
