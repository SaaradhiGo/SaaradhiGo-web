'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  CATEGORY_LABEL, OUTCOME_LABEL, SOURCE_LABEL, STATUS_LABEL, ackState, ackText, elapsed,
  emergencyLabel, emergencyLine, minutesBetween, signalSummary, type IncidentDetail, type SosEventRow, type Timer,
} from '@/lib/safety';
import { Revealable } from '@/components/console/Revealable';
import { PageLink } from '@/components/console/PageLink';
import { SeverityPill } from '@/components/console/safety/SeverityPill';
import {
  ACTION_TITLE, IncidentActionDrawer, type IncidentAction,
} from '@/components/console/safety/IncidentActionDrawer';
import { SosActionDrawer, type SosAction } from '@/components/console/safety/SosActionDrawer';
import {
  Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * One incident: the case file.
 *
 * Everything an operator needs to work an emergency is on this page and the
 * actions drawer beside it. The people are masked like everywhere else; the
 * ONLY ways to a real number are the SOS reveal on each alarm below (offered
 * only while that SOS is open or acknowledged, and logged with the
 * operator's name) and the generic reveal on the rider and driver pages.
 *
 * Suspend and block call the same audited services the Drivers and Riders
 * pages use; "refer to police" shows the incident country's numbers and
 * records that you made the call. Nothing here touches money.
 */
const POLL_MS = 15_000;
const TICK_MS = 30_000;

const TELL = (v: unknown) => (typeof v === 'string' && v
  ? <a href={`tel:${v}`} className="ops-sos__phone">{v}</a>
  : <span className="muted">Not on file</span>);

const SOS_TONE = { open: 'bad', acknowledged: 'wait', resolved: 'good', false_alarm: 'neutral' } as const;

const KIND_LABEL: Record<string, string> = {
  opened: 'Opened', note: 'Note', status: 'Status', assigned: 'Assignment', link: 'Linked', unlink: 'Unlinked',
  action: 'Action', sos: 'SOS', signal: 'Signal', escalated: 'Escalated', police_referral: 'Police', closed: 'Closed',
};

const words = (s: string) => s.replace(/_/g, ' ');

export default function IncidentPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [data, setData] = useState<IncidentDetail | null>(null);
  const [timers, setTimers] = useState<Record<string, Timer>>({});
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<IncidentAction | null>(null);
  const [sosAct, setSosAct] = useState<{ id: number; action: SosAction } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const first = useRef(true);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await api.get<IncidentDetail>(`/safety/admin/incidents/${id}/`);
      setData(d);
      setError(null);
      if (d.country && first.current) {
        // The country's timer, for the "unacknowledged" line. Read once; it is config.
        api.get<{ timers: Record<string, Timer> }>('/safety/admin/incidents/?limit=1')
          .then((r) => setTimers(r.timers ?? {})).catch(() => undefined);
      }
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this incident.');
    } finally {
      first.current = false;
    }
  }, [id]);

  useEffect(() => {
    first.current = true;
    setData(null);
    void load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const done = (message: string) => { setDrawer(null); setSosAct(null); setNotice(message); void load(); };

  if (!data && !error) {
    return (
      <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the incident</span>
        <Skeleton kind="block" count={3} />
      </div>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Incident" subtitle={<Link href="/safety-ops">Back to Safety</Link>} />
        <ErrorState title="This incident could not be opened" detail={error ?? ''} onRetry={() => { first.current = true; void load(); }} />
      </>
    );
  }

  const tz = timeZoneFor(data.anchor.node);
  const a = data.actions;
  const closed = data.status === 'closed';
  // A caller who may only look (safety.read): no action, no reveal, no buttons.
  const readOnly = data.read_only === true;
  const ack = ackState(data, timers, now);

  const buttons: Array<[IncidentAction, boolean]> = [
    ['assign', a.assign], ['note', a.note], ['status', a.status], ['link', a.link],
    ['suspend', a.suspend_driver], ['block', a.block_rider], ['police', a.refer_police], ['close', a.close || a.close_blockers.length > 0],
  ];

  return (
    <>
      <PageHeader
        title={`Incident #${data.id}`}
        subtitle={(
          <>
            <Link href="/safety-ops">Safety</Link> · {data.title || CATEGORY_LABEL[data.category] || data.category}
          </>
        )}
        actions={closed ? undefined : (
          <div className="ops-actions" role="group" aria-label="Incident actions">
            {buttons.filter(([, on]) => on).map(([act]) => (
              <button
                key={act} type="button"
                className={`sg-btn sg-btn--${act === 'close' ? 'primary' : 'secondary'} sg-btn--sm`}
                onClick={() => setDrawer(act)}
              >
                {ACTION_TITLE[act]}
              </button>
            ))}
          </div>
        )}
      />

      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}
      {error && <div className="alert-error mb-4" role="alert">{error} Showing the last version that loaded.</div>}

      <div className="ops-grid-2">
        <Panel title="The incident">
          <Facts>
            <Fact label="Severity"><SeverityPill severity={data.severity} /></Fact>
            <Fact label="Status"><Pill tone={closed ? 'good' : data.status === 'open' ? 'bad' : 'wait'}>{STATUS_LABEL[data.status]}</Pill>
              {data.escalated ? <> <Pill tone="bad">Escalated</Pill></> : null}</Fact>
            <Fact label="Category">{CATEGORY_LABEL[data.category] ?? data.category}</Fact>
            <Fact label="Source">{SOURCE_LABEL[data.source] ?? data.source}</Fact>
            <Fact label="City">
              {data.anchor.node_name ?? 'Not placed: every responder sees it'}
              {data.anchor.source ? <span className="muted"> · by {words(data.anchor.source)}</span> : null}
            </Fact>
            <Fact label="Country">{data.country ?? 'Unknown'}</Fact>
            <Fact label="Assignee">{data.assignee ? data.assignee.label : <span className="muted">Unassigned</span>}</Fact>
            <Fact label="Opened">{stamp(data.opened_at, tz)} <span className="muted">· {elapsed(minutesBetween(data.opened_at, now))} ago</span></Fact>
            <Fact label="Trip">{data.trip_id ? <PageLink page="trips" href={`/trips/${data.trip_id}`}>#{data.trip_id}</PageLink> : 'None'}</Fact>
            {closed ? (
              <>
                <Fact label="Closed">{stamp(data.closed_at, tz)}</Fact>
                <Fact label="Outcome">{data.outcome ? OUTCOME_LABEL[data.outcome] ?? data.outcome : '—'}</Fact>
                <Fact label="Summary">{data.closing_summary ?? '—'}</Fact>
              </>
            ) : null}
            {data.police_referred_at ? (
              <Fact label="Police">Referred {stamp(data.police_referred_at, tz)}{data.police_reference ? ` · ref ${data.police_reference}` : ''}</Fact>
            ) : null}
          </Facts>
        </Panel>

        <Panel title="Emergency numbers">
          {data.emergency.configured && data.emergency.numbers.length > 0 ? (
            <ul className="ops-emergency__list" aria-label={`Emergency numbers for ${data.emergency.country}`}>
              {data.emergency.numbers.map((n) => (
                <li key={`${n.label}-${n.number}`}>
                  <span>{emergencyLabel(n.label)}</span> <a href={`tel:${n.number}`} className="ops-sos__phone">{n.number}</a>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="Not configured" detail={`${emergencyLine(data.emergency)}. A Super Admin can add them under Safety settings.`} />
          )}
          {!closed && a.refer_police && !data.police_referred_at ? (
            <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm mt-3" onClick={() => setDrawer('police')}>
              Mark as referred to police
            </button>
          ) : null}
          <p className="help mt-3">Ring the number yourself, then record it. SaaradhiGo does not contact emergency services for you.</p>
        </Panel>
      </div>

      <Panel title={`SOS (${data.sos_events.length})`} flush>
        {data.sos_events.length === 0 ? (
          <Empty title="No SOS on this incident" detail="It was opened from a ticket, a detected signal or by hand." />
        ) : (
          <div className="ops-sos p-4">
            {data.sos_events.map((ev: SosEventRow) => (
              <article key={ev.id} className={`ops-sos__card ops-sos__card--${ev.status}`} aria-labelledby={`sos-${ev.id}`}>
                <div className="ops-sos__head">
                  <h3 id={`sos-${ev.id}`}>SOS #{ev.id}</h3>
                  <Pill tone={SOS_TONE[ev.status]}>{words(ev.status)}</Pill>
                  <span className="ops-sos__type">{words(ev.event_type)}</span>
                  <span className="ops-sos__age">raised {elapsed(minutesBetween(ev.created_at, now))} ago</span>
                </div>
                <div className="ops-sos__body">
                  <div className="ops-sos__who">
                    <span className="ops-sos__label">Raised by {ev.initiated_by}</span>
                    <b>{ev.user_label || '—'}</b>
                    <Revealable
                      value={<span className="ops-sos__phone">{ev.user_phone || '—'}</span>}
                      label={`caller phone for SOS #${ev.id}`}
                      target={{ type: 'sos_event', id: ev.id }}
                      field="phone_number"
                      render={TELL}
                      disabledReason={ev.active ? undefined : 'Contact can be revealed only while the SOS is open or acknowledged.'}
                      noReveal={readOnly}
                    />
                  </div>
                  {ev.status === 'open' ? <span className={ack.kind === 'overdue' ? 'ops-late' : 'muted'}>{ackText(ack, data.country)}</span> : null}
                </div>
                {ev.active && !readOnly && (
                  <div className="ops-sos__actions">
                    {ev.status === 'open' && (
                      <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setSosAct({ id: ev.id, action: 'acknowledge' })}>Acknowledge</button>
                    )}
                    <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setSosAct({ id: ev.id, action: 'resolve' })}>Resolve</button>
                    <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setSosAct({ id: ev.id, action: 'false-alarm' })}>False alarm</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </Panel>

      <div className="ops-grid-2">
        <Panel title="People and records">
          <ul className="ops-linklist">
            {data.people.drivers.map((d) => (
              <li key={`d${d.id}`}>
                <span className="ops-linklist__kind">Driver</span>
                {d.in_scope ? <PageLink page="drivers" href={`/drivers/${d.id}`}>{d.driver_name || `Driver #${d.id}`}</PageLink> : <span>{d.driver_name || `Driver #${d.id}`} <span className="muted">(outside your scope)</span></span>}
                {d.suspended ? <Pill tone="bad">Suspended</Pill> : null}
              </li>
            ))}
            {data.people.riders.map((r) => (
              <li key={`r${r.id}`}>
                <span className="ops-linklist__kind">Rider</span>
                {r.in_scope ? <PageLink page="riders" href={`/riders/${r.id}`}>{r.rider_name || `Rider #${r.id}`}</PageLink> : <span>{r.rider_name || `Rider #${r.id}`} <span className="muted">(outside your scope)</span></span>}
                {r.blocked ? <Pill tone="bad">Blocked</Pill> : null}
              </li>
            ))}
            {data.people.trips.map((t) => (
              <li key={`t${t.id}`}>
                <span className="ops-linklist__kind">Trip</span>
                {t.in_scope ? <PageLink page="trips" href={`/trips/${t.id}`}>Trip #{t.id}</PageLink> : <span>Trip #{t.id} <span className="muted">(outside your scope)</span></span>}
                {t.status ? <span className="muted">{words(t.status)}</span> : null}
                {t.primary ? <Pill>Primary</Pill> : null}
              </li>
            ))}
            {data.people.tickets.map((t) => (
              <li key={`k${t.id}`}>
                <span className="ops-linklist__kind">Ticket</span>
                {t.in_scope ? <PageLink page="support" href={`/support/${t.id}`}>Ticket #{t.id}</PageLink> : <span>Ticket #{t.id} <span className="muted">(outside your scope)</span></span>}
                <span className="muted">{words(t.issue_type)} · {words(t.status.toLowerCase())}</span>
              </li>
            ))}
          </ul>
          {data.people.drivers.length + data.people.riders.length + data.people.trips.length + data.people.tickets.length === 0 ? (
            <Empty title="Nothing linked yet" detail="Link a driver, rider, trip or ticket from Actions." />
          ) : null}
        </Panel>

        <Panel title={`Detected signals (${data.signals.length})`}>
          {data.signals.length === 0 ? (
            <Empty title="No signals" detail="A long stop, an ETA overrun or a route deviation on this trip would appear here." />
          ) : (
            <ul className="ops-linklist">
              {data.signals.map((s) => (
                <li key={s.id}>
                  <Pill tone="wait">{words(s.kind)}</Pill>
                  <span>{signalSummary(s)}</span>
                  {s.dismissed_at ? <span className="muted">dismissed: {s.dismiss_reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Timeline">
        <ol className="ops-timeline">
          {[...data.timeline].reverse().map((e) => (
            <li key={e.id} className="ops-timeline__item">
              <time dateTime={e.created_at}>{stamp(e.created_at, tz)}</time>
              <span>
                <b>{KIND_LABEL[e.kind] ?? e.kind}</b>
                {e.to_status ? <> · {STATUS_LABEL[e.to_status as keyof typeof STATUS_LABEL] ?? words(e.to_status)}</> : null}
                {e.note ? <> — {e.note}</> : null}
              </span>
              <span className="muted">{e.actor_label || 'system'}</span>
            </li>
          ))}
        </ol>
      </Panel>

      {drawer && <IncidentActionDrawer action={drawer} incident={data} onClose={() => setDrawer(null)} onDone={done} />}
      {sosAct && <SosActionDrawer sosId={sosAct.id} action={sosAct.action} onClose={() => setSosAct(null)} onDone={done} />}
    </>
  );
}
