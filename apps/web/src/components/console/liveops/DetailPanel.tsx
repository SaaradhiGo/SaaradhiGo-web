'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { ApiError, api } from '@/lib/api';
import {
  STATUS_WORDS, TRIP_STATE_WORDS, ackRemaining, ackText, ageText, cellSentence, secondsSince, sosLabel,
  type Dot, type HeatCell, type LiveAlert, type LiveTrip,
} from '@/lib/liveOps';

/**
 * What was clicked, floating over the right of the map (the map never shrinks for it).
 * No name or phone is in this payload, so none is shown: ids, states and ages only.
 */
export type Detail =
  | { kind: 'alert'; alert: LiveAlert }
  | { kind: 'driver'; dot: Dot }
  | { kind: 'trip'; trip: LiveTrip }
  | { kind: 'cell'; cell: HeatCell };

export function DetailPanel({
  detail, now, windowMinutes, canAck, driverHref, tripHref, onClose, onFollow, onAcknowledged,
}: {
  detail: Detail;
  now: number;
  windowMinutes: number;
  canAck: boolean;
  driverHref: (id: number) => string | null;
  tripHref: (id: number) => string | null;
  onClose: () => void;
  onFollow: (lat: number, lng: number) => void;
  onAcknowledged: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { closeRef.current?.focus(); }, []);

  async function acknowledge(sosId: number) {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/sos/admin/${sosId}/acknowledge/`, { note: '' });
      onAcknowledged();
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  const linkOr = (href: string | null, text: string) => (href ? <Link href={href} className="ops-linkbtn">{text}</Link> : <b>{text}</b>);
  let title = '';
  let body: ReactNode = null;
  let pin: [number, number] | null = null;

  if (detail.kind === 'alert') {
    const a = detail.alert;
    const rem = a.sos_status === 'open' ? ackRemaining(a.ack_due_at, now) : null;
    title = a.is_sos ? `${sosLabel(a)} · ${a.title}` : a.title;
    if (a.lat !== null && a.lng !== null) pin = [a.lat, a.lng];
    body = (
      <>
        <p className="lo-detail__row"><span>Severity</span>{a.severity}</p>
        {a.is_sos ? <p className="lo-detail__row"><span>Status</span>{a.sos_status ?? '—'}</p> : null}
        {rem !== null ? <p className={`lo-detail__ack ${rem < 0 ? 'lo-late' : ''}`} role="timer">{ackText(rem)}</p> : null}
        {error ? <p className="lo-note lo-note--warn" role="alert">{error}</p> : null}
        <div className="lo-detail__actions">
          {a.is_sos && a.sos_status === 'open' && a.sos_id && canAck ? (
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void acknowledge(a.sos_id as number)}>
              {busy ? 'Working…' : 'Acknowledge'}
            </button>
          ) : null}
          {a.incident_id ? <Link href={`/ops/safety-ops/incidents/${a.incident_id}`} className="sg-btn sg-btn--secondary sg-btn--sm">Open case</Link> : null}
        </div>
      </>
    );
  } else if (detail.kind === 'driver') {
    const d = detail.dot;
    title = `D-${d.driver_id}`;
    pin = [d.lat, d.lng];
    body = (
      <>
        <p className="lo-detail__row"><span>Driver</span>{linkOr(driverHref(d.driver_id), `D-${d.driver_id}`)}</p>
        <p className="lo-detail__row"><span>Status</span>{STATUS_WORDS[d.status]}</p>
        <p className="lo-detail__row"><span>Vehicle</span><span className="capitalize">{d.vehicle_class ?? '—'}</span></p>
        <p className="lo-detail__row"><span>Updated</span>{ageText(secondsSince(d.updated_at, now))} ago</p>
        {d.trip_id ? <p className="lo-detail__row"><span>Trip</span>{linkOr(tripHref(d.trip_id), `T-${d.trip_id}`)}</p> : null}
      </>
    );
  } else if (detail.kind === 'trip') {
    const t = detail.trip;
    title = `T-${t.id}`;
    pin = [t.pickup_lat, t.pickup_lng];
    body = (
      <>
        <p className="lo-detail__row"><span>Trip</span>{linkOr(tripHref(t.id), `T-${t.id}`)}</p>
        <p className="lo-detail__row"><span>State</span>{TRIP_STATE_WORDS[t.state] ?? t.state}</p>
        <p className="lo-detail__row"><span>Age</span>{ageText(t.age_s)}</p>
        {t.stale ? <p className="lo-detail__row"><span>Flag</span><b className="lo-late">Stuck: no recent signal</b></p> : null}
      </>
    );
  } else {
    const c = detail.cell;
    title = 'Short of drivers';
    pin = [c.cell_south + 0.005, c.cell_west + 0.005];
    body = <p>{cellSentence(c, windowMinutes)}</p>;
  }

  return (
    <section className="lo-detail" role="dialog" aria-label={title} aria-modal="false">
      <header className="lo-detail__head">
        <h2>{title}</h2>
        <button ref={closeRef} type="button" className="lo-queue__toggle" aria-label="Close details" onClick={onClose}>×</button>
      </header>
      {body}
      {pin ? (
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => onFollow(pin[0], pin[1])}>Follow on map</button>
      ) : null}
    </section>
  );
}
