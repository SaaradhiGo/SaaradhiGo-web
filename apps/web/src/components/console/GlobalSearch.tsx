'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AdminAccess } from '@/lib/adminScope';
import { Search } from '@/components/console/icons';
import { commandsFor } from '@/lib/commands';
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
 * Trips, drivers and riders open their own pages. There is no vehicle page
 * yet, so a vehicle opens its driver; the row says so.
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
      // Ctrl K (Cmd K) from anywhere; `/` from anywhere that is not a text field.
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
        return;
      }
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

  const commands = useMemo(() => commandsFor(term, access), [term, access]);
  const found = useMemo(() => (state ? flattenOptions(state) : []), [state]);
  // Commands come first; search hits follow, their indexes shifted past them.
  const options = useMemo(
    () => found.map((o) => ({ ...o, index: o.index + commands.length })), [found, commands.length]);
  const total = commands.length + options.length;
  const loading = state ? isLoading(state) : false;
  const showList = open && ((usable && state !== null) || commands.length > 0);
  const activeOption = active >= commands.length && active < total ? options[active - commands.length] : null;
  const activeCommand = active >= 0 && active < commands.length ? commands[active] : null;
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
        setActive((a) => moveActive(a, 1, total));
        return;
      case 'ArrowUp':
        e.preventDefault();
        setActive((a) => moveActive(a, -1, total));
        return;
      case 'Home':
        if (!showList || total === 0) return;
        e.preventDefault();
        setActive(0);
        return;
      case 'End':
        if (!showList || total === 0) return;
        e.preventDefault();
        setActive(total - 1);
        return;
      case 'Enter': {
        e.preventDefault();
        if (activeCommand) { go(activeCommand.href); return; }
        const target = activeOption ?? commands[0] ?? options[0] ?? null;
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
        placeholder="Find T-, D-, R-, SOS-, a phone, plate or name, or a page"
        aria-label="Search records and pages (Ctrl K)"
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && active >= 0 && active < total ? optionId(active) : undefined}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      <kbd aria-hidden="true">Ctrl K</kbd>

      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{status}</div>

      {showList && (
        <div className="ops-search-pop" aria-busy={loading || undefined}>
          {commands.length > 0 && (
            <div role="listbox" id={`${listId}-cmd`} aria-label="Commands" className="ops-search-list">
              <div role="group" aria-label="Go to" className="ops-search-group">
                <div role="presentation" className="ops-search-group__label">Go to</div>
                {commands.map((c, i) => (
                  <div
                    key={c.key}
                    role="option"
                    id={optionId(i)}
                    aria-selected={active === i}
                    className={`ops-search-opt ${active === i ? 'ops-search-opt--active' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseMove={() => { if (active !== i) setActive(i); }}
                    onClick={() => go(c.href)}
                  >
                    <span className="ops-search-opt__title">{c.label}</span>
                    <span className="ops-search-opt__meta">{c.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {!state || !usable ? null : allForbidden(state) ? (
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
              {options.length === 0 && commands.length === 0 && !loading
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
