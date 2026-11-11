'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { reportLoadError } from '@/lib/report';

/**
 * One card's data (8 Nov): every signed-in view ends in loading, loaded,
 * empty or error -- never waits forever. A request that has not answered in
 * ten seconds is tried once more (11 Nov), then an error with Try again; each card loads on its own, so
 * one failure leaves the rest of the page showing. Every failure is reported
 * with its endpoint and status (lib/report.ts).
 */
export const LOAD_TIMEOUT_MS = 10_000;

/** `refresh` reloads in place: the data on screen stays until the new data arrives (after a save). */
export type Load<T> = { state: 'loading' | 'ok' | 'error'; data: T | null; retry: () => void; refresh?: () => void };

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): Load<T> {
  const [attempt, setAttempt] = useState(0);
  const [s, setS] = useState<{ state: Load<T>['state']; data: T | null }>({ state: 'loading', data: null });
  const soft = useRef(false);

  useEffect(() => {
    let live = true;
    const inPlace = soft.current;
    soft.current = false;
    if (!inPlace) setS({ state: 'loading', data: null });
    const settle = (next: { state: Load<T>['state']; data: T | null }) => {
      if (!live) return;
      live = false;
      clearTimeout(timer);
      setS(next);
    };
    const fail = (e: unknown) => {
      if (live) reportLoadError(e);
      // A failed refresh leaves what is on screen; a failed load shows the error.
      if (inPlace) { live = false; clearTimeout(timer); return; }
      settle({ state: 'error', data: null });
    };
    // One quiet second try (11 Nov): a request lost while the server restarts (a deploy) must not
    // leave a card empty or wrong; only a second failure shows the error.
    let timer = setTimeout(() => again('timeout'), LOAD_TIMEOUT_MS);
    let tries = 0;
    function again(e: unknown) {
      if (!live) return;
      if (tries > 0 || inPlace) { fail(e); return; }
      tries += 1;
      clearTimeout(timer);
      timer = setTimeout(() => fail('timeout'), LOAD_TIMEOUT_MS);
      fn().then((data) => settle({ state: 'ok', data }), fail);
    }
    fn().then((data) => settle({ state: 'ok', data }), (e) => again(e));
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const refresh = useCallback(() => { soft.current = true; setAttempt((n) => n + 1); }, []);
  return { ...s, retry, refresh };
}
