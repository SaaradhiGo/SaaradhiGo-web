'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  type AdminAccess, type AdminScope, readSelectedScope, writeSelectedScope,
} from '@/lib/adminScope';

const PINNED_KEY = 'sg.console.places.pinned';
const RECENT_KEY = 'sg.console.places.recent';
const MAX_RECENT = 5;

function readList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try { window.localStorage.setItem(key, JSON.stringify(list)); } catch { /* private window */ }
}

/** "India › Telangana › Hyderabad" from a materialised path, using the held scopes for names. */
export function trail(scope: AdminScope, byCode: Map<string, AdminScope>): string[] {
  const codes = (scope.path ?? `/${scope.code}/`).split('/').filter(Boolean)
    .filter((c) => c !== 'GLOBAL');
  return codes.map((c) => byCode.get(c)?.name ?? c);
}

/** Places matching what was typed: name or code, starts-with first. Pure; tested. */
export function matchPlaces(scopes: AdminScope[], query: string, limit = 12): AdminScope[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts = scopes.filter((s) => s.name.toLowerCase().startsWith(q) || s.code.toLowerCase() === q);
  const contains = scopes.filter((s) => !starts.includes(s)
    && (s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)));
  return [...starts, ...contains].slice(0, limit);
}

/**
 * The place picker (design board A): country › state › city, searchable ("Hyd"
 * finds Hyderabad), with pinned and recent places. It lists only the places
 * the operator holds (`access.scopes`); the server refuses any other.
 *
 * Choosing a place reloads the page, as the old switcher did: every page reads
 * the selection when it queries, and a reload is the one way to be sure none
 * is still showing the previous place's rows.
 */
export function PlacePicker({ access }: { access: AdminAccess | null }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    setSelected(readSelectedScope());
    setPinned(readList(PINNED_KEY));
    setRecent(readList(RECENT_KEY));
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    input.current?.focus();
    const onDoc = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const scopes = useMemo(() => access?.scopes ?? [], [access]);
  const byCode = useMemo(() => new Map(scopes.map((s) => [s.code, s])), [scopes]);
  const matches = useMemo(() => matchPlaces(scopes, query), [scopes, query]);

  if (!access) return null;
  if (access.access_model === 'legacy_unscoped') {
    return <div className="ops__scope"><span className="ops__scope-static"><b>All regions</b><small>Not yet scoped</small></span></div>;
  }
  if (scopes.length === 0) return null;

  const top = scopes.reduce((a, b) => (b.depth < a.depth ? b : a));
  const current = (selected && byCode.get(selected)) || (scopes.length === 1 ? scopes[0] : top);
  const path = trail(current, byCode);
  const choose = (code: string | null) => {
    writeSelectedScope(code);
    if (code) {
      const next = [code, ...recent.filter((c) => c !== code)].slice(0, MAX_RECENT);
      writeList(RECENT_KEY, next);
    }
    window.location.reload();
  };
  const togglePin = (code: string) => {
    const next = pinned.includes(code) ? pinned.filter((c) => c !== code) : [...pinned, code].slice(0, 8);
    writeList(PINNED_KEY, next);
    setPinned(next);
  };
  const row = (s: AdminScope) => (
    <li key={s.code} className="ops-picker__row">
      <button type="button" className="ops-picker__pick" onClick={() => choose(s.code)}>
        <b>{s.name}</b>
        <small>{trail(s, byCode).slice(0, -1).join(' › ') || s.kind}{s.status !== 'active' && s.kind === 'city' ? ` · ${s.status}` : ''}</small>
      </button>
      <button type="button" className="ops-picker__pin" aria-pressed={pinned.includes(s.code)}
        aria-label={pinned.includes(s.code) ? `Unpin ${s.name}` : `Pin ${s.name}`}
        onClick={() => togglePin(s.code)}>
        {pinned.includes(s.code) ? '★' : '☆'}
      </button>
    </li>
  );
  const listed = (codes: string[]) => codes.map((c) => byCode.get(c)).filter((s): s is AdminScope => !!s);

  return (
    <div className="ops__scope ops-picker" ref={root}>
      <button type="button" className="ops-picker__button" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)} title="Change place">
        {path.length > 1 ? <span className="ops-picker__trail">{path.slice(0, -1).join(' › ')} ›</span> : null}
        <b>{path[path.length - 1] ?? current.name}</b>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="ops-picker__pop" role="dialog" aria-label="Choose a place">
          <label className="sr-only" htmlFor={`${listId}-q`}>Find a country, state or city</label>
          <input id={`${listId}-q`} ref={input} className="input" value={query} autoComplete="off"
            placeholder="Find a country, state or city" onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && matches[0]) choose(matches[0].code); }} />
          {query ? (
            <ul className="ops-picker__list" aria-label="Matching places">
              {matches.length ? matches.map(row) : <li className="ops-picker__empty">No place matches “{query}”.</li>}
            </ul>
          ) : (
            <>
              {scopes.length > 1 ? (
                <ul className="ops-picker__list" aria-label="Everything you hold">
                  <li className="ops-picker__row">
                    <button type="button" className="ops-picker__pick" onClick={() => choose(null)}>
                      <b>Everything I hold</b><small>{top.name}</small>
                    </button>
                  </li>
                </ul>
              ) : null}
              {pinned.length ? <h3 className="ops-picker__head">Pinned</h3> : null}
              <ul className="ops-picker__list" aria-label="Pinned places">{listed(pinned).map(row)}</ul>
              {recent.length ? <h3 className="ops-picker__head">Recent</h3> : null}
              <ul className="ops-picker__list" aria-label="Recent places">{listed(recent).map(row)}</ul>
              <h3 className="ops-picker__head">Countries</h3>
              <ul className="ops-picker__list" aria-label="Countries">
                {scopes.filter((s) => s.kind === 'country').slice(0, 12).map(row)}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
