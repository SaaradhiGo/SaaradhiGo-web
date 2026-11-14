'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTr } from '@/i18n/website';
import { type LatLng, type Place, type SearchField, searchPlaces } from '@/lib/booking';

/**
 * Place suggestions with an honest state (owner, 14 Nov: "never leave an empty silence").
 *
 * Before, each search box fired the lookup and showed whatever came back; a failure, a hang or an
 * expired login all looked the same: an empty list. Now there is one lookup for every box:
 *   * 300 ms after the last keystroke (maps cost, 9 Nov), from 3 characters;
 *   * "Searching…" while it waits, at most 8 s, then "Can't search right now. Try again";
 *   * a later answer always wins: an earlier, slower one is dropped when it arrives;
 *   * 429 says "too many searches", not "nothing found".
 */
export type SearchState = 'idle' | 'searching' | 'done' | 'failed' | 'throttled';

const TIMEOUT_MS = 8_000;
const DEBOUNCE_MS = 300;

export function usePlaceSearch(
  query: string,
  { near, field = 'pickup', market, skip = false }: { near?: LatLng | null; field?: SearchField; market?: string | null; skip?: boolean },
) {
  const [found, setFound] = useState<Place[]>([]);
  const [state, setState] = useState<SearchState>('idle');
  const [attempt, setAttempt] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const mine = ++seq.current;
    if (skip || q.length < 3) {
      setFound([]);
      setState('idle');
      return;
    }
    const timer = setTimeout(() => {
      setState('searching');
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error('timeout'), { status: 0 })), TIMEOUT_MS);
      });
      Promise.race([searchPlaces(q, near ?? null, field, null, market ?? null), late])
        .then((places) => {
          if (mine !== seq.current) return;
          setFound(places);
          setState('done');
        })
        .catch((err) => {
          if (mine !== seq.current) return;
          setFound([]);
          setState((err as { status?: number } | null)?.status === 429 ? 'throttled' : 'failed');
        })
        .finally(() => clearTimeout(timeout));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, near?.lat, near?.lng, field, market, skip, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const clear = useCallback(() => { seq.current += 1; setFound([]); setState('idle'); }, []);
  return { found, state, retry, clear };
}

/** The line under a search box while it searches, or when it could not. Nothing when all is well. */
export function SearchStatus({ state, onRetry, className, throttledText }: {
  state: SearchState; onRetry: () => void; className?: string; throttledText?: string;
}) {
  const tr = useTr();
  if (state === 'searching') {
    return <p className={className} role="status" aria-live="polite" data-testid="search-status">{tr('Searching…')}</p>;
  }
  if (state === 'failed' || state === 'throttled') {
    return (
      <p className={className} role="alert" data-testid="search-status">
        {state === 'throttled' && throttledText ? throttledText : tr("Can't search right now.")}{' '}
        <button type="button" className="sg-search-retry" onClick={onRetry} data-testid="search-retry">{tr('Try again')}</button>
      </p>
    );
  }
  return null;
}
