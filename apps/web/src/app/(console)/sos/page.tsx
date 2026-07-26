'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';

// SOS triage queue.
//
// SOS is the only Phase-0 SLO with a zero error budget (100% dispatched
// within 5s), and MVA-2020 requires a panic action that reaches the
// operator. The acknowledge/resolve endpoints existed, but there was no
// screen — on-call could only act on an SOS whose id they had read out of
// a push notification. This page is meant to be left open on a second
// monitor: it polls, it sorts unacknowledged-first, and it shows the
// caller's phone number and a map link so the responder can act in one
// click.

type SosUpdate = {
  actor: string;
  new_status: string;
  note: string;
  created_at: string;
};

type SosEvent = {
  id: number;
  status: 'open' | 'acknowledged' | 'resolved' | 'false_alarm';
  event_type: string;
  initiated_by: string;
  user_label: string;
  user_phone?: string | null;
  trip_id?: number | null;
  driver_label?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  note?: string;
  created_at: string;
  updates: SosUpdate[];
};

const POLL_MS = 15_000;

const STATUS_STYLES: Record<string, string> = {
  open: 'border-red-500/60 text-red-300',
  acknowledged: 'border-amber-500/40 text-amber-300',
  resolved: 'border-emerald-500/40 text-emerald-300',
  false_alarm: 'border-white/20 text-white/50',
};

function minutesSince(iso: string) {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

export default function SosPage() {
  const [events, setEvents] = useState<SosEvent[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    if (firstLoad.current) setLoading(true);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const r = await api.get<any>(`/sos/admin/${qs}`);
      setEvents(Array.isArray(r?.results) ? r.results : []);
      setOpenCount(r?.open_count ?? 0);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load SOS events');
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
    // Poll rather than sit on a stale list. A WebSocket feed is the right
    // long-term answer (ops_sos group already exists server-side); polling
    // every 15s is the version that ships today and cannot silently die.
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  async function act(ev: SosEvent, action: 'acknowledge' | 'resolve' | 'false-alarm') {
    const label = action === 'false-alarm' ? 'mark as false alarm' : action;
    const note = window.prompt(`Note for ${label} on SOS #${ev.id} (recorded permanently):`, '');
    if (note === null) return;
    if (action !== 'acknowledge' && !note.trim()) {
      alert('A note is required when resolving or dismissing an SOS.');
      return;
    }
    setBusyId(ev.id);
    try {
      await api.post(`/sos/${ev.id}/${action}/`, { note });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : `${label} failed`);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">SOS</h1>
          {openCount > 0 && (
            <span className="tag border-red-500/60 text-red-300 animate-pulse">
              {openCount} open
            </span>
          )}
        </div>
        <span className="text-white/40 text-xs">auto-refreshing every {POLL_MS / 1000}s</span>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {['', 'open', 'acknowledged', 'resolved', 'false_alarm'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            className={`tag capitalize ${
              s === statusFilter ? 'border-brand text-brand' : 'border-white/20 text-white/60'
            }`}
          >
            {s ? s.replace('_', ' ') : 'all'}
          </button>
        ))}
      </div>

      {loading && <p className="text-white/60">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && (
        <div className="space-y-3">
          {events.map((ev) => {
            const age = minutesSince(ev.created_at);
            const stale = ev.status === 'open' && age >= 5;
            return (
              <div
                key={ev.id}
                className={`card ${
                  ev.status === 'open' ? 'border border-red-500/40' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold">SOS #{ev.id}</span>
                      <span className={`tag capitalize ${STATUS_STYLES[ev.status]}`}>
                        {ev.status.replace('_', ' ')}
                      </span>
                      <span className="tag border-white/20 capitalize">
                        {ev.event_type.replace('_', ' ')}
                      </span>
                      <span className={stale ? 'text-red-300 text-xs' : 'text-white/50 text-xs'}>
                        {age}m ago{stale ? ' — past the 5-minute response target' : ''}
                      </span>
                    </div>
                    <p className="text-sm text-white/80">
                      Raised by <span className="capitalize">{ev.initiated_by}</span>{' '}
                      <span className="font-medium">{ev.user_label || '—'}</span>
                      {ev.user_phone && (
                        <>
                          {' · '}
                          <a href={`tel:${ev.user_phone}`} className="text-brand hover:underline">
                            {ev.user_phone}
                          </a>
                        </>
                      )}
                    </p>
                    <p className="text-sm text-white/60 mt-1">
                      {ev.trip_id ? (
                        <Link href={`/trips/${ev.trip_id}`} className="text-brand hover:underline">
                          Trip #{ev.trip_id}
                        </Link>
                      ) : (
                        'No trip attached'
                      )}
                      {ev.driver_label && ` · Driver: ${ev.driver_label}`}
                      {ev.latitude && ev.longitude && (
                        <>
                          {' · '}
                          <a
                            className="text-brand hover:underline"
                            target="_blank"
                            rel="noreferrer"
                            href={`https://www.google.com/maps/search/?api=1&query=${ev.latitude},${ev.longitude}`}
                          >
                            Open location
                          </a>
                        </>
                      )}
                    </p>
                    {ev.note && <p className="text-sm text-white/70 mt-2 italic">“{ev.note}”</p>}
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {ev.status === 'open' && (
                      <button
                        className="btn-ghost text-amber-300 text-xs"
                        disabled={busyId === ev.id}
                        onClick={() => act(ev, 'acknowledge')}
                      >
                        Acknowledge
                      </button>
                    )}
                    {(ev.status === 'open' || ev.status === 'acknowledged') && (
                      <>
                        <button
                          className="btn-ghost text-emerald-300 text-xs"
                          disabled={busyId === ev.id}
                          onClick={() => act(ev, 'resolve')}
                        >
                          Resolve
                        </button>
                        <button
                          className="btn-ghost text-white/60 text-xs"
                          disabled={busyId === ev.id}
                          onClick={() => act(ev, 'false-alarm')}
                        >
                          False alarm
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {ev.updates.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                    {ev.updates.map((u, i) => (
                      <p key={i} className="text-xs text-white/50">
                        {new Date(u.created_at).toLocaleString()} · {u.actor || 'system'} →{' '}
                        <span className="capitalize">{u.new_status.replace('_', ' ')}</span>
                        {u.note && ` — ${u.note}`}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {events.length === 0 && !error && (
            <p className="text-white/50 text-sm">No SOS events{statusFilter ? ` (${statusFilter})` : ''}.</p>
          )}
        </div>
      )}
    </div>
  );
}
