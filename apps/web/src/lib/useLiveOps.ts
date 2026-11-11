'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, api } from '@/lib/api';
import {
  CLOSE_NO_CAPABILITY, FrameBuffer, applyFrames, dotsFrom, heatmapUrl, snapshotUrl, socketUrl,
  TICKET_PATH, type CityStatus, type DotMap, type Frame, type Heatmap, type Link, type Snapshot, type Ticket,
} from '@/lib/liveOps';

/**
 * The Live Ops data, with the socket as an optimisation.
 *
 *   1. paint from the REST snapshot (first paint, and again whenever the city changes);
 *   2. ask for a single-use ticket, open the socket with it, apply frames on top;
 *   3. while the socket is down, poll the snapshot every ten seconds and say how old
 *      the data is. Reconnect with a growing pause, and with a FRESH ticket each
 *      time: a ticket works once.
 *
 * Frames are buffered and applied once a second (`FrameBuffer`), so a burst never
 * makes the map the slowest thing on the page. A close with 4003 means the
 * operator's access was revoked: the page stops, it does not retry.
 */

export type Status = 'loading' | 'ready' | 'error' | 'forbidden';

const APPLY_EVERY_MS = 1000;
const RECONNECT_MIN_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const FALLBACK_POLL_MS = 10000;
const TRIPS_POLL_MS = 30000;

export type LiveOps = {
  status: Status;
  error: string | null;
  snapshot: Snapshot | null;
  dots: DotMap;
  cities: CityStatus[];
  link: Link;
  /** Seconds since the newest data (a snapshot or a frame) arrived. */
  dataAge: number | null;
  reload: () => void;
};

function messageOf(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.fromServer ? err.message : fallback;
}

export function useLiveOps(city: string | null, enabled: boolean): LiveOps {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [dots, setDots] = useState<DotMap>(() => new Map());
  const [cities, setCities] = useState<CityStatus[]>([]);
  const [link, setLink] = useState<Link>('idle');
  const [lastDataAt, setLastDataAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0);

  const cityRef = useRef(city);
  cityRef.current = city;
  const linkRef = useRef<Link>('idle');
  const setLinkState = useCallback((next: Link) => { linkRef.current = next; setLink(next); }, []);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // --- the REST snapshot ------------------------------------------------------
  const load = useCallback(async (opts: { keepDots?: boolean } = {}) => {
    try {
      const snap = await api.get<Snapshot>(snapshotUrl(cityRef.current));
      if (!alive.current) return;
      setSnapshot(snap);
      // While the socket is live it owns the dots; the snapshot still refreshes
      // the parts the socket does not stream (trips, alerts, zones).
      if (!opts.keepDots) setDots(dotsFrom(snap.drivers));
      setCities(snap.cities);
      setLastDataAt(Date.now());
      setError(null);
      setStatus('ready');
    } catch (err) {
      if (!alive.current) return;
      if (err instanceof ApiError && err.status === 403) {
        setStatus('forbidden');
        return;
      }
      if (err instanceof ApiError && err.status === 404 && cityRef.current) {
        // The city is no longer in scope: fall back to all of it on the next load.
        setError('That city is not in your scope any more.');
      } else {
        setError(messageOf(err, 'We could not load the live map.'));
      }
      // Keep what was on screen if there is something: stale beats blank.
      setStatus((s) => (s === 'ready' ? 'ready' : 'error'));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    void load();
  }, [enabled, city, tick, load]);

  // --- the socket ---------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    const buffer = new FrameBuffer(APPLY_EVERY_MS);

    const drain = setInterval(() => {
      const frames = buffer.take();
      if (!frames || !alive.current) return;
      setDots((prev) => applyFrames(prev, frames));
      setLastDataAt(Date.now());
    }, 250);

    const scheduleRetry = () => {
      if (stopped) return;
      failures += 1;
      setLinkState('polling');
      const wait = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** Math.min(failures - 1, 5));
      retry = setTimeout(() => { void connect(); }, wait);
    };

    const connect = async () => {
      if (stopped) return;
      setLinkState(linkRef.current === 'live' ? 'live' : 'connecting');
      let ticket: Ticket;
      try {
        ticket = await api.post<Ticket>(TICKET_PATH);
      } catch (err) {
        if (stopped) return;
        if (err instanceof ApiError && err.status === 403) { setLinkState('denied'); return; }
        scheduleRetry();
        return;
      }
      if (stopped) return;
      try {
        socket = new WebSocket(socketUrl(ticket.path, ticket.ticket));
      } catch {
        scheduleRetry();
        return;
      }
      socket.onmessage = (event) => {
        let frame: Frame;
        try { frame = JSON.parse(String(event.data)) as Frame; } catch { return; }
        if (frame.type === 'hello') {
          failures = 0;
          setLinkState('live');
          return;
        }
        if (frame.type === 'city_status') {
          setCities((frame as { cities: CityStatus[] }).cities);
          setLastDataAt(Date.now());
          return;
        }
        if (frame.type === 'initial_drivers') {
          // A fresh start: apply now, not a second from now, and drop anything older.
          buffer.clear();
          setDots(applyFrames(new Map(), [frame]));
          setLastDataAt(Date.now());
          return;
        }
        buffer.push(frame);
      };
      socket.onclose = (event) => {
        socket = null;
        if (stopped) return;
        if (event.code === CLOSE_NO_CAPABILITY) { setLinkState('denied'); return; }
        scheduleRetry();
      };
      socket.onerror = () => { /* onclose follows and decides */ };
    };

    void connect();
    return () => {
      stopped = true;
      clearInterval(drain);
      if (retry) clearTimeout(retry);
      if (socket) { socket.onclose = null; socket.close(); }
      buffer.clear();
    };
  }, [enabled, setLinkState]);

  // --- the polling fallback + a clock for "N s ago" ---------------------------------
  useEffect(() => {
    if (!enabled) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || link === 'denied') return;
    // Socket down: the snapshot is the source, every ten seconds. Socket live:
    // refresh trips and alerts (which it does not stream) every thirty.
    const live = link === 'live';
    const poll = setInterval(() => { void load({ keepDots: live }); }, live ? TRIPS_POLL_MS : FALLBACK_POLL_MS);
    return () => clearInterval(poll);
  }, [enabled, link, load]);

  const dataAge = lastDataAt === null ? null : Math.max(0, (now - lastDataAt) / 1000);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { status, error, snapshot, dots, cities, link, dataAge, reload };
}

/**
 * The demand and supply cells. Polled: a cell is a count over a window, so the
 * socket has nothing to add. A reload keeps the last good cells on screen.
 */
export function useHeatmap(city: string | null, windowMinutes: number, enabled: boolean, pollMs = 30000) {
  const [data, setData] = useState<Heatmap | null>(null);
  const [state, setState] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    api.get<Heatmap>(heatmapUrl(city, windowMinutes)).then((result) => {
      if (cancelled) return;
      setData(result);
      setError(null);
      setState('ready');
    }).catch((err: unknown) => {
      if (cancelled) return;
      if (err instanceof ApiError && err.status === 403) { setState('forbidden'); return; }
      setError(messageOf(err, 'We could not load demand and supply.'));
      setState((s) => (s === 'ready' ? 'ready' : 'error'));
    });
    return () => { cancelled = true; };
  }, [enabled, city, windowMinutes, tick]);

  useEffect(() => {
    if (!enabled || !pollMs) return;
    const timer = setInterval(() => setTick((t) => t + 1), pollMs);
    return () => clearInterval(timer);
  }, [enabled, pollMs]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, status: state, error, reload };
}
