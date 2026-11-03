'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { type AdminAccess, withScope } from '@/lib/adminScope';
import { canRespond, type IncidentRow } from '@/lib/safety';
import { SosActions } from '@/components/console/safety/SosActions';

/**
 * The Safety board (owner, 2026-11-03; design board F): every live SOS at once,
 * in four lanes -- not acknowledged, responding, emergency services involved,
 * watching until the trip ends -- with who is answering, where nobody is, and
 * the last 24 hours. From `safety/admin/board/`; nothing here is estimated.
 * Polled every 5 seconds: an SOS is the one queue with no error budget.
 */

type Board = {
  generated_at: string;
  lanes: Record<'not_acknowledged' | 'responding' | 'emergency_services' | 'watching', IncidentRow[]>;
  countries: Record<string, number>;
  responders: { id: number; label: string; open: number; places: string[] }[];
  coverage_gaps: { city: string | null; title: string }[];
  last_24h: {
    raised: number; acknowledged_within_target: number; target_minutes: number | null;
    police_referred: number; false_alarms_confirmed: number;
  };
};

const LANES: Array<{ key: keyof Board['lanes']; title: string; hint: string }> = [
  { key: 'not_acknowledged', title: 'Not acknowledged', hint: 'Nobody has said they have it yet' },
  { key: 'responding', title: 'Responding', hint: 'Someone is on it' },
  { key: 'emergency_services', title: 'Emergency services involved', hint: 'Referred to the police' },
  { key: 'watching', title: 'Watching until the trip ends', hint: 'Safe for now, trip still running' },
];

function timer(fromIso: string | null, now: number): string {
  if (!fromIso) return '—';
  const s = Math.max(0, Math.round((now - new Date(fromIso).getTime()) / 1000));
  const m = Math.floor(s / 60);
  if (m >= 120) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function SafetyBoard({ access }: { access: AdminAccess | null }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [country, setCountry] = useState<string | null>(null);
  const mayRespond = canRespond(access);

  const load = useCallback(async () => {
    try {
      setBoard(await api.get<Board>(withScope('/safety/admin/board/')));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'The safety board could not be loaded.');
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(load, 5000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [load]);

  const total = board ? Object.values(board.lanes).reduce((n, l) => n + l.length, 0) : 0;
  const keep = (r: IncidentRow) => !country || r.country === country;

  return (
    <div className="ops-ws">
      <header className="ops-ws__head">
        <div>
          <h1>Safety board</h1>
          <p className="sg-num">
            {board ? `${total} active · ${Object.keys(board.countries).length} ${Object.keys(board.countries).length === 1 ? 'country' : 'countries'}` : 'Loading…'}
          </p>
        </div>
        <div className="ops-list__views" role="group" aria-label="Country">
          <button type="button" className="ops-view" aria-pressed={country === null} onClick={() => setCountry(null)}>All countries</button>
          {Object.entries(board?.countries ?? {}).map(([c, n]) => (
            <button key={c} type="button" className="ops-view" aria-pressed={country === c} onClick={() => setCountry(c)}>
              {c} <span className="sg-num">{n}</span>
            </button>
          ))}
          <Link href="/safety-ops?tab=incidents" className="sg-btn sg-btn--ghost sg-btn--sm">All cases</Link>
        </div>
      </header>
      {error ? <p className="alert-error" role="alert">{error}</p> : null}
      {notice ? <p className="alert-success" role="status">{notice}</p> : null}

      <div className="ops-board">
        <div className="ops-board__lanes">
          {LANES.map((lane) => {
            const rows = (board?.lanes[lane.key] ?? []).filter(keep);
            const hot = lane.key === 'not_acknowledged';
            return (
              <section key={lane.key} className="ops-lane" aria-label={lane.title}>
                <header className="ops-lane__head">
                  <b>{lane.title}</b>
                  <span className={`ops-lane__count sg-num${hot && rows.length ? ' ops-lane__count--hot' : ''}`}>{rows.length}</span>
                </header>
                <p className="ops-lane__hint">{lane.hint}</p>
                {rows.map((r) => (
                  <article key={r.id} className={`ops-sos-card${hot ? ' ops-sos-card--hot' : ''}`}>
                    <div className="ops-sos-card__top">
                      <Link href={`/safety-ops/incidents/${r.id}`} className="ops-sos-card__ref">{r.ref}</Link>
                      <span className={`sg-num ${hot ? 'ops-text--critical' : 'muted'}`}>{timer(r.sos.oldest_active_at ?? r.opened_at, now)}</span>
                    </div>
                    <div className="ops-sos-card__what">{r.title}{r.trip_ref ? ` · ${r.trip_ref}` : ''}</div>
                    <div className="ops-sos-card__where">{r.anchor.node_name ?? 'Not placed'}{r.country ? `, ${r.country}` : ''}</div>
                    {r.rider_reports_false_alarm ? <div className="ops-inbox__detail">Rider reports false alarm</div> : null}
                    <div className="ops-sos-card__foot">
                      <span className={r.assignee ? '' : 'ops-inbox__owner--none'}>{r.assignee ? r.assignee.label : 'Nobody on it'}</span>
                    </div>
                    {mayRespond ? (
                      <SosActions item={r} meId={access?.id} compact onDone={(m) => { setNotice(m); void load(); }} />
                    ) : null}
                  </article>
                ))}
              </section>
            );
          })}
        </div>

        <aside className="ops-board__side" aria-label="Responders and coverage">
          <section className="ops-card">
            <h2 className="ops-card__title">Who is answering</h2>
            {board && board.responders.length === 0 ? <p className="muted">Nobody has an open case.</p> : null}
            <ul className="ops-health">
              {(board?.responders ?? []).map((r) => (
                <li key={r.id}><span>{r.label}{r.places.length ? ` · ${r.places.join(', ')}` : ''}</span>
                  <span className="sg-num">{r.open} open</span></li>
              ))}
            </ul>
          </section>
          {board && board.coverage_gaps.length ? (
            <section className="ops-card ops-card--alert">
              <h2 className="ops-card__title ops-text--critical">Coverage gaps</h2>
              <ul className="ops-health">
                {board.coverage_gaps.slice(0, 8).map((g) => <li key={g.title}><span>{g.title}</span></li>)}
              </ul>
              {board.coverage_gaps.length > 8 ? <p className="muted">and {board.coverage_gaps.length - 8} more</p> : null}
            </section>
          ) : null}
          {board ? (
            <section className="ops-card">
              <h2 className="ops-card__title">Last 24 hours</h2>
              <dl className="ops-kv">
                <div><dt>SOS raised</dt><dd className="sg-num">{board.last_24h.raised}</dd></div>
                {board.last_24h.target_minutes ? (
                  <div><dt>Acknowledged within {board.last_24h.target_minutes} min</dt>
                    <dd className="sg-num">{board.last_24h.acknowledged_within_target} of {board.last_24h.raised}</dd></div>
                ) : null}
                <div><dt>Referred to the police</dt><dd className="sg-num">{board.last_24h.police_referred}</dd></div>
                <div><dt>False alarms, confirmed</dt><dd className="sg-num">{board.last_24h.false_alarms_confirmed}</dd></div>
              </dl>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
