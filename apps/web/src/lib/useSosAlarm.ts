'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { alarmTitle, alarmingSos, type LiveAlert } from '@/lib/liveOps';

/**
 * Ticks once a second while an open SOS has a deadline, and flashes the tab title between
 * the normal one and the SOS warning. The title is restored when none is left and on unmount.
 */
export function useSosAlarm(alerts: LiveAlert[]): { now: number; alarming: LiveAlert[] } {
  const alarming = useMemo(() => alarmingSos(alerts), [alerts]);
  const active = alarming.length > 0;
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const original = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { setTick((n) => n + 1); setNow(Date.now()); }, 1000);
    return () => clearInterval(t);
  }, [active]);

  const top = alarming[0];
  useEffect(() => {
    if (!top) {
      if (original.current !== null) { document.title = original.current; original.current = null; }
      return;
    }
    if (original.current === null) original.current = document.title;
    document.title = tick % 2 === 0 ? alarmTitle(top, now) : original.current;
  }, [top, tick, now]);

  useEffect(() => () => {
    if (original.current !== null) document.title = original.current;
  }, []);

  return { now, alarming };
}
