'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * One card's data (8 Nov): every signed-in view ends in loading, loaded,
 * empty or error -- never waits forever. A request that has not answered in
 * ten seconds is an error with Try again, and each card loads on its own, so
 * one failure leaves the rest of the page showing.
 */
export const LOAD_TIMEOUT_MS = 10_000;

export type Load<T> = { state: 'loading' | 'ok' | 'error'; data: T | null; retry: () => void };

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): Load<T> {
  const [attempt, setAttempt] = useState(0);
  const [s, setS] = useState<{ state: Load<T>['state']; data: T | null }>({ state: 'loading', data: null });

  useEffect(() => {
    let live = true;
    setS({ state: 'loading', data: null });
    const settle = (next: { state: Load<T>['state']; data: T | null }) => {
      if (!live) return;
      live = false;
      clearTimeout(timer);
      setS(next);
    };
    const timer = setTimeout(() => settle({ state: 'error', data: null }), LOAD_TIMEOUT_MS);
    fn().then((data) => settle({ state: 'ok', data }), () => settle({ state: 'error', data: null }));
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...s, retry };
}
