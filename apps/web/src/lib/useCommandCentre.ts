'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertsPage, Overview, Window, fetchAlerts, fetchOverview, isForbidden, messageFor,
} from '@/lib/commandCentre';

/**
 * The two data hooks behind the Command Centre.
 *
 * FOUR STATES, NOT TWO. `loading`, `ready`, `error` and `forbidden` are
 * kept apart because the page draws each differently: a skeleton, the
 * figures, a retry, and -- for a 403 -- nothing at all but a one-line
 * note, since asking again will not change the answer and an operator
 * who may not see a panel should not be invited to keep trying.
 *
 * A reload keeps the last good data on screen while the next answer is in
 * flight (`refreshing`), so the board does not blink to skeletons every
 * minute.
 */
export type Status = 'loading' | 'ready' | 'error' | 'forbidden';

export type Remote<T> = {
  status: Status;
  data: T | null;
  error: string | null;
  refreshing: boolean;
  reload: () => void;
};

function useRemote<T>(load: () => Promise<T>, deps: unknown[], fallback: string, pollMs = 0): Remote<T> {
  const [status, setStatus] = useState<Status>('loading');
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    load().then((result) => {
      if (cancelled || !alive.current) return;
      setData(result);
      setError(null);
      setStatus('ready');
    }).catch((err: unknown) => {
      if (cancelled || !alive.current) return;
      if (isForbidden(err)) {
        setStatus('forbidden');
        setData(null);
        setError(null);
        return;
      }
      setError(messageFor(err, fallback));
      setStatus('error');
    }).finally(() => {
      if (!cancelled && alive.current) setRefreshing(false);
    });
    return () => { cancelled = true; };
    // `deps` are the inputs the caller's `load` closes over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  useEffect(() => {
    if (!pollMs) return;
    const timer = setInterval(() => setTick((t) => t + 1), pollMs);
    return () => clearInterval(timer);
  }, [pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { status, data, error, refreshing, reload };
}

export function useOverview(window: Window, city: string | null, pollMs = 60000): Remote<Overview> {
  return useRemote(
    () => fetchOverview(window, city),
    [window, city],
    'We could not load the figures.',
    pollMs,
  );
}

export function useAlerts(city: string | null, pollMs = 60000): Remote<AlertsPage> {
  return useRemote(
    () => fetchAlerts(city),
    [city],
    'We could not load the alerts.',
    pollMs,
  );
}
