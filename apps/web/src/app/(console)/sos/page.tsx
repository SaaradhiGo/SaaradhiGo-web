'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { currentScope, getCachedAccess } from '@/lib/adminScope';
import { clock, stamp, timeZoneFor } from '@/lib/consoleTime';
import { Revealable } from '@/components/console/Revealable';
import {
  Drawer,
  Empty,
  ErrorState,
  Fact,
  Facts,
  Filters,
  PageHeader,
  Pill,
  Skeleton,
} from '@/components/console/ui';

/**
 * SOS triage.
 *
 * SOS is the only Phase-0 SLO with a zero error budget (100% dispatched
 * within 5s), and MVA-2020 requires a panic action that reaches the
 * operator. This page is meant to be left open on a second monitor: it
 * polls, it sorts open-first, and an open alarm is the one red thing in
 * the console.
 *
 * NOT A TABLE. A table is for finding one row among many; this is a short
 * list where every row needs reading, so each alarm is a card with the
 * caller, the trip, the location and its age, and the actions happen in a
 * drawer where the note is typed rather than in `window.prompt`. The note
 * is recorded permanently, and resolving or dismissing without one is
 * refused here before the server refuses it.
 */
type SosUpdate = { actor: string; new_status: string; note: string; created_at: string };

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

type Action = 'acknowledge' | 'resolve' | 'false-alarm';

const POLL_MS = 15_000;
const TARGET_MIN = 5;

const TONE: Record<SosEvent['status'], 'bad' | 'wait' | 'good' | 'neutral'> = {
  open: 'bad', acknowledged: 'wait', resolved: 'good', false_alarm: 'neutral',
};
const RANK: Record<SosEvent['status'], number> = { open: 0, acknowledged: 1, resolved: 2, false_alarm: 3 };

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'false_alarm', label: 'False alarm' },
] as const;

const minutesSince = (iso: string) => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
const words = (s: string) => s.replace(/_/g, ' ');

/** The one reason the SOS door refuses: nobody is left to reach. */
const SOS_CLOSED_REASON = 'Contact can be revealed only while the incident is open or acknowledged.';

/** A revealed number is for dialling. */
const telLink = (v: unknown) => (typeof v === 'string' && v
  ? <a href={`tel:${v}`} className="ops-sos__phone">{v}</a>
  : <span className="muted">Not on file</span>);

function SosInner() {
  const router = useRouter();
  const search = useSearchParams();
  const statusFilter = search.get('status') ?? '';

  const [events, setEvents] = useState<SosEvent[] | null>(null);
  const [openCount, setOpenCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<{ ev: SosEvent; action: Action } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const firstLoad = useRef(true);
  const tz = timeZoneFor(currentScope(getCachedAccess())?.code);

  const load = useCallback(async () => {
    if (firstLoad.current) setEvents(null);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const r = await api.get<{ results?: SosEvent[]; open_count?: number }>(`/sos/admin/${qs}`);
      const list = Array.isArray(r?.results) ? r.results : [];
      setEvents([...list].sort((a, b) => RANK[a.status] - RANK[b.status]
        || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
      setOpenCount(typeof r?.open_count === 'number' ? r.open_count : null);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the SOS board.');
      if (firstLoad.current) setEvents([]);
    } finally {
      firstLoad.current = false;
    }
  }, [statusFilter]);

  useEffect(() => {
    firstLoad.current = true;
    void load();
    // Poll rather than sit on a stale list. A WebSocket feed is the right
    // long-term answer (ops_sos group already exists server-side); polling
    // every 15s is the version that ships today and cannot silently die.
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  function begin(ev: SosEvent, action: Action) {
    setActing({ ev, action });
    setNote('');
    setActionError(null);
  }

  async function confirm() {
    if (!acting) return;
    const needsNote = acting.action !== 'acknowledge';
    if (needsNote && note.trim().length < 5) {
      setActionError('A note is required when resolving or dismissing an SOS. It is recorded permanently.');
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/sos/${acting.ev.id}/${acting.action}/`, { note: note.trim() });
      setActing(null);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  const verb: Record<Action, string> = {
    acknowledge: 'Acknowledge', resolve: 'Resolve', 'false-alarm': 'Mark as false alarm',
  };

  return (
    <>
      <PageHeader
        title="SOS"
        subtitle={openCount === null
          ? `Refreshing every ${POLL_MS / 1000}s`
          : openCount > 0
            ? `${openCount} open · target response ${TARGET_MIN} minutes · refreshing every ${POLL_MS / 1000}s`
            : `Nothing open · refreshing every ${POLL_MS / 1000}s`}
        actions={
          <Filters
            value={statusFilter as (typeof FILTERS)[number]['key']}
            options={FILTERS}
            onChange={(k) => router.push(k ? `/sos?status=${k}` : '/sos')}
          />
        }
      />

      {error && events && events.length > 0 && (
        <div className="alert-error mb-4" role="alert">{error} Showing the last list that loaded.</div>
      )}

      {events === null ? (
        <div className="grid gap-3" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading SOS alerts</span>
          <Skeleton kind="block" count={3} />
        </div>
      ) : error && events.length === 0 ? (
        <ErrorState title="The SOS board could not be loaded" detail={error} onRetry={() => { firstLoad.current = true; void load(); }} />
      ) : events.length === 0 ? (
        <div className="ops-panel">
          <Empty
            title={statusFilter ? `No ${words(statusFilter)} alerts` : 'No SOS alerts'}
            detail={statusFilter ? undefined : 'An alarm raised during a trip appears here within a few seconds.'}
          />
        </div>
      ) : (
        <div className="ops-sos">
          {events.map((ev) => {
            const age = minutesSince(ev.created_at);
            const live = ev.status === 'open' || ev.status === 'acknowledged';
            const late = ev.status === 'open' && age >= TARGET_MIN;
            return (
              <article key={ev.id} className={`ops-sos__card ops-sos__card--${ev.status}`} aria-labelledby={`sos-${ev.id}`}>
                <div className="ops-sos__head">
                  <h2 id={`sos-${ev.id}`}>SOS #{ev.id}</h2>
                  <Pill tone={TONE[ev.status]}>{words(ev.status)}</Pill>
                  <span className="ops-sos__type">{words(ev.event_type)}</span>
                  <span className={`ops-sos__age ${late ? 'ops-sos__age--late' : ''}`}>
                    {age < 1 ? 'just now' : `${age} min ago`}
                    {late ? ` — past the ${TARGET_MIN}-minute target` : ''}
                  </span>
                </div>

                <div className="ops-sos__body">
                  <div className="ops-sos__who">
                    <span className="ops-sos__label">Raised by {ev.initiated_by}</span>
                    <b>{ev.user_label || '—'}</b>
                    {/* The number is masked for everyone, Super Admin
                        included. The real one comes through the SOS
                        reveal, logged, and only while the incident is
                        live: a closed incident has nobody left to call. */}
                    <Revealable
                      value={<span className="ops-sos__phone">{ev.user_phone || '—'}</span>}
                      label={`caller phone for SOS #${ev.id}`}
                      target={{ type: 'sos_event', id: ev.id }}
                      field="phone_number"
                      render={telLink}
                      disabledReason={live ? undefined : SOS_CLOSED_REASON}
                    />
                  </div>
                  <div className="ops-sos__facts">
                    <span>{ev.trip_id ? <Link href={`/trips/${ev.trip_id}`}>Trip #{ev.trip_id}</Link> : 'No trip attached'}</span>
                    {ev.driver_label ? <span>Driver: {ev.driver_label}</span> : null}
                    {ev.latitude && ev.longitude ? (
                      <a target="_blank" rel="noreferrer"
                        href={`https://www.google.com/maps/search/?api=1&query=${ev.latitude},${ev.longitude}`}>
                        Open location
                      </a>
                    ) : <span className="muted">No location</span>}
                    <span className="muted" title={stamp(ev.created_at, tz)}>raised {clock(ev.created_at, tz)}</span>
                  </div>
                  {ev.note ? <p className="ops-sos__note">“{ev.note}”</p> : null}
                </div>

                {live && (
                  <div className="ops-sos__actions">
                    {ev.status === 'open' && (
                      <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => begin(ev, 'acknowledge')}>Acknowledge</button>
                    )}
                    <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => begin(ev, 'resolve')}>Resolve</button>
                    <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => begin(ev, 'false-alarm')}>False alarm</button>
                  </div>
                )}

                {ev.updates.length > 0 && (
                  <ol className="ops-sos__log" aria-label="History">
                    {ev.updates.map((u, i) => (
                      <li key={i}>
                        <span>{stamp(u.created_at, tz)}</span> {u.actor || 'system'} → {words(u.new_status)}
                        {u.note ? <> — {u.note}</> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Drawer
        open={acting !== null}
        title={acting ? `${verb[acting.action]} SOS #${acting.ev.id}` : ''}
        onClose={() => setActing(null)}
        footer={acting ? (
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={() => setActing(null)}>Cancel</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void confirm()}>
              {busy ? 'Working…' : verb[acting.action]}
            </button>
          </>
        ) : undefined}
      >
        {acting && (
          <div className="grid gap-4">
            <Facts>
              <Fact label="Raised by">{acting.ev.user_label || '—'}{acting.ev.user_phone ? ` · ${acting.ev.user_phone}` : ''}</Fact>
              <Fact label="Status"><Pill tone={TONE[acting.ev.status]}>{words(acting.ev.status)}</Pill></Fact>
              <Fact label="Trip">{acting.ev.trip_id ? <Link href={`/trips/${acting.ev.trip_id}`}>#{acting.ev.trip_id}</Link> : 'None'}</Fact>
              <Fact label="Raised">{stamp(acting.ev.created_at, tz)}</Fact>
            </Facts>
            <div className="ops-confirm">
              <b>{verb[acting.action]}</b>
              <span>
                {acting.action === 'acknowledge'
                  ? 'Tells the caller and the team that somebody is on it. A note is optional.'
                  : acting.action === 'resolve'
                    ? 'Say what happened and how it ended. This is recorded permanently and read in any review.'
                    : 'Say why this was not an emergency. This is recorded permanently.'}
              </span>
              <label className="sr-only" htmlFor="sos-note">Note</label>
              <textarea
                id="sos-note"
                className="input"
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={acting.action === 'acknowledge' ? 'Optional note' : 'What happened'}
                autoFocus
              />
              {actionError && <div className="alert-error" role="alert">{actionError}</div>}
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

export default function SosPage() {
  return (
    <Suspense fallback={<div className="grid gap-3" aria-busy="true"><Skeleton kind="block" count={3} /></div>}>
      <SosInner />
    </Suspense>
  );
}
