'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AdminAccess } from '@/lib/adminScope';
import { Search } from '@/components/console/icons';
import {
  DEBOUNCE_MS, EMPTY_STATE, SearchState, allForbidden, describeHit,
  flattenOptions, isLoading, isUsableTerm, moveActive, runSearch, summarize,
  visibleGroups,
} from '@/lib/search';

/**
 * One box for "find me this thing".
 *
 * An operator arrives with a trip number from a complaint, a phone number
 * from a call, a plate from a report, or a name. The box takes any of them,
 * waits 250 ms for the typing to pause, asks the four search endpoints in
 * parallel and shows what came back in four groups. Each group is scoped
 * and gated by the server; a group the operator may not search is simply
 * not drawn.
 *
 * It is a combobox in the ARIA sense: the input owns a listbox, arrow keys
 * move an active option (reported through `aria-activedescendant` so focus
 * never leaves the field), Enter opens the active one -- or the first, so
 * "type and press Enter" still works -- and Escape closes it. A live region
 * says what landed, because the list appearing below the field is silent
 * to a screen reader otherwise.
 *
 * Trips and drivers open their own pages. There is no rider page and no
 * vehicle page yet, so a rider opens their latest trip and a vehicle opens
 * its driver; the row says so.
 *
 * `/` focuses it from anywhere that is not already a text field, which is
 * the convention every tool an operator already uses follows.
 */
export function GlobalSearch({ access }: { access: AdminAccess | null }) {
  const router = useRouter();
  const root = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const listId = useId();
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SearchState | null>(null);
  const [active, setActive] = useState(-1);

  const term = value.trim();
  const usable = isUsableTerm(term);

  // The slash shortcut.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
        || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) return;
      e.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Debounced search. A newer term invalidates the answer to an older one;
  // the sequence number is how a slow early reply is kept from overwriting
  // a fast later one.
  useEffect(() => {
    if (!usable) {
      seq.current += 1;
      setState(null);
      setActive(-1);
      return;
    }
    const mine = ++seq.current;
    const timer = window.setTimeout(() => {
      setState((prev) => prev ?? EMPTY_STATE);
      setOpen(true);
      void runSearch(term, access).then((next) => {
        if (seq.current !== mine) return;
        setState(next);
        setActive(-1);
      });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // `access` changes only at sign-in; re-running on it is harmless.
  }, [term, usable, access]);

  // Click outside closes; the field keeps its text.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const options = useMemo(() => (state ? flattenOptions(state) : []), [state]);
  const loading = state ? isLoading(state) : false;
  const showList = open && usable && state !== null;
  const activeOption = active >= 0 && active < options.length ? options[active] : null;
  const optionId = (i: number) => `${listId}-opt-${i}`;

  const go = useCallback((href: string | null) => {
    if (!href) return;
    setOpen(false);
    setValue('');
    setState(null);
    setActive(-1);
    input.current?.blur();
    router.push(href);
  }, [router]);

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open && state) { setOpen(true); return; }
        setActive((a) => moveActive(a, 1, options.length));
        return;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => moveActive(a, -1, options.length));
        return;
      case 'Home':
        if (!showList || options.length === 0) return;
        e.preventDefault();
        setActive(0);
        return;
      case 'End':
        if (!showList || options.length === 0) return;
        e.preventDefault();
        setActive(options.length - 1);
        return;
      case 'Enter': {
        e.preventDefault();
        const target = activeOption ?? options[0] ?? null;
        if (target) go(target.href);
        return;
      }
      case 'Escape':
        e.preventDefault();
        if (open) { setOpen(false); setActive(-1); } else { setValue(''); }
        return;
      case 'Tab':
        setOpen(false);
        return;
      default:
        return;
    }
  }

  const status = state ? summarize(state, term) : '';

  return (
    <form
      ref={root}
      className="ops__search"
      role="search"
      onSubmit={(e) => e.preventDefault()}
    >
      <Search className="ops__search-icon" />
      <input
        ref={input}
        type="text"
        inputMode="search"
        name="q"
        value={value}
        onChange={(e) => { setValue(e.target.value); setOpen(true); }}
        onFocus={() => { if (state) setOpen(true); }}
        onKeyDown={onKeyDown}
        placeholder="Trip ID, phone, plate or name"
        aria-label="Search trips, drivers, riders and vehicles"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && activeOption ? optionId(activeOption.index) : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      <kbd aria-hidden="true">/</kbd>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</div>

      {showList && state && (
        <div className="ops-search-pop" aria-busy={loading || undefined}>
          {allForbidden(state) ? (
            <p className="ops-search-msg">You do not have access to search.</p>
          ) : options.length === 0 && loading ? (
            <p className="ops-search-msg ops-search-msg--quiet">Searching…</p>
          ) : (
            <>
              {options.length > 0 && (
                <div role="listbox" id={listId} aria-label="Search results" className="ops-search-list">
                  {visibleGroups(state).map((g) => {
                    const group = state[g.key];
                    const rows = options.filter((o) => o.group === g.key);
                    if (group.status !== 'ok' || rows.length === 0) return null;
                    const headId = `${listId}-${g.key}`;
                    return (
                      <div role="group" aria-labelledby={headId} className="ops-search-group" key={g.key}>
                        <div role="presentation" id={headId} className="ops-search-group__label">{g.label}</div>
                        {rows.map((o) => {
                          const d = describeHit(o.hit);
                          const selected = active === o.index;
                          return (
                            <div
                              key={`${o.group}-${o.hit.id}`}
                              role="option"
                              id={optionId(o.index)}
                              aria-selected={selected}
                              aria-disabled={o.href ? undefined : true}
                              className={`ops-search-opt ${selected ? 'ops-search-opt--active' : ''} ${o.href ? '' : 'ops-search-opt--inert'}`}
                              onMouseDown={(e) => e.preventDefault()}
                              onMouseMove={() => { if (active !== o.index) setActive(o.index); }}
                              onClick={() => go(o.href)}
                            >
                              <span className="ops-search-opt__title">{d.title}</span>
                              {d.meta ? <span className="ops-search-opt__meta">{d.meta}</span> : null}
                              {d.detail ? <span className="ops-search-opt__detail">{d.detail}</span> : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
              {visibleGroups(state).filter((g) => state[g.key].status === 'error').map((g) => (
                <p className="ops-search-msg ops-search-msg--error" key={g.key}>
                  {g.label} could not be searched. {state[g.key].error}
                </p>
              ))}
              {options.length === 0 && !loading
                && visibleGroups(state).every((g) => state[g.key].status !== 'error') && (
                <p className="ops-search-msg">
                  Nothing matches “{term}”.
                  <span className="ops-search-msg__hint">
                    Try a trip number, a phone number in any form, a plate, or a name.
                  </span>
                </p>
              )}
              <div className="ops-search-foot" aria-hidden="true">
                <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
                <span><kbd>Enter</kbd> open</span>
                <span><kbd>Esc</kbd> close</span>
                {loading ? <span className="ops-search-foot__busy">updating…</span> : null}
              </div>
            </>
          )}
        </div>
      )}
    </form>
  );
}
