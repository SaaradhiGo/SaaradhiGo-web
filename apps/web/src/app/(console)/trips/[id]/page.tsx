'use client';

import { PageButtonLink, PageLink } from '@/components/console/PageLink';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { currentScope, getCachedAccess, useAdminAccess } from '@/lib/adminScope';
import { timeZoneFor } from '@/lib/consoleTime';
import { currencySymbol } from '@/lib/money';
import {
  type ActionKey, type TripActions, cityTime, cityZoneLabel, formatMinor, visibleActions,
} from '@/lib/trips';
import { ActionDrawer } from '@/components/console/TripActionDrawer';
import { StaleTripPanel } from '@/components/console/StaleTripPanel';
import { type StaleActions, type StaleDetail, panelModel } from '@/lib/staleTrip';
import { ButtonLink } from '@/components/sg/Button';
import { Revealable } from '@/components/console/Revealable';
import {
  Column,
  DataTable,
  Drawer,
  Empty,
  ErrorState,
  Fact,
  Facts,
  MetricTile,
  PageHeader,
  Panel,
  Pill,
  Skeleton,
  TileGrid,
} from '@/components/console/ui';

/**
 * One trip, as the answer to a question.
 *
 * An operator opens this from a complaint: "I was charged twice", "the
 * driver never came", "where is my receipt". So the money is first, as
 * tiles; the route and the timeline next; the people and the vehicle
 * beside them; and the long tail -- payments, receipts, ratings, chat,
 * SOS -- below, each in its own panel and only when there is something in
 * it. A trip that had an SOS is the one place this page goes red.
 *
 * REFUNDS ARE CONFIRMED IN A DRAWER, not in `window.confirm`: the amount,
 * the rider and the mode are read back on one surface with one gold
 * button, and the server's own answer is shown rather than a guess at it.
 */
type TripDetail = {
  id: number;
  status: string | null;
  otp?: string | null;
  pickup: { address: string | null; lat: string | null; lng: string | null };
  destination: { address: string | null; lat: string | null; lng: string | null };
  timeline: Record<string, string | null>;
  rider: {
    user_id: number; phone_number: string | null; full_name: string | null;
    email: string | null; rating: string | null; rating_count: number;
    flagged_for_review: boolean;
  } | null;
  driver: {
    driver_id: number; phone_number: string | null; full_name: string | null;
    status: string | null; approved: boolean; ratings: string;
    total_trips: number; license_expiry: string | null;
    fatigue_lockout_until: string | null;
  } | null;
  vehicle: {
    id: number; type: string | null; brand: string | null; model: string | null;
    color: string | null; vehicle_number: string | null;
    insurance_expiry: string | null; permit_expiry: string | null;
    fitness_expiry: string | null; puc_expiry: string | null;
  } | null;
  fare: {
    estimated_fare: string | null; final_fare: string | null;
    estimated_distance_km: string | null; actual_distance_km: string | null;
    surge_multiplier: string | null;
    payment_method: string | null; payment_status: string | null;
    breakdown: {
      base_fare: string; distance_fare: string; time_fare: string;
      surge_multiplier: string; total_fare: string;
    } | null;
  };
  currency?: string | null;
  payments: Array<{
    id: number; amount: string; method: string; status: string;
    payment_gateway: string | null; gateway_order_id: string | null;
    gateway_payment_id: string | null; created_at: string | null;
  }>;
  ratings: Array<{ id: number; direction: string; score: number; comments: string | null; created_at: string | null }>;
  receipts: Array<{
    id: number; receipt_number: string; version: number;
    total_fare: string; gst_amount: string; sent_to_email: string;
    last_sent_at: string | null; send_failure_reason: string | null;
    pdf_url: string | null;
  }>;
  chat: { total: number; messages: Array<{ id: number; sender_role: string; body: string; is_system: boolean; created_at: string | null }> };
  driver_cancellations: Array<{ id: number; reason: string; note: string; created_at: string | null }>;
  sos_events: Array<{ id: number; status: string | null; created_at: string | null; acknowledged_at: string | null; resolved_at: string | null }>;
  promo: { code: string; discount_type: string; discount_amount: string; created_at: string | null } | null;
  zone: { code: string; name: string; city: string; state_code: string } | null;
  // Trips module (console module 2)
  city?: { code: string; name: string; timezone: string; country: string | null } | null;
  timeline_events?: Array<{ event: string; at: string | null; actor: { type: string; id: number | null } | null; detail?: string | null; created_by?: { label: string; role: string } | null }>;
  fare_minor?: {
    currency: string; estimated_minor: number | null; final_minor: number | null; charged_minor: number;
    cancellation_fee_minor: number; tax_minor: number | null; tax_stub: boolean;
    breakdown: {
      base_minor: number; distance_minor: number; time_minor: number; surge_multiplier: string;
      night_surge_multiplier: string | null; gross_minor: number | null; promo_discount_minor: number | null;
      promo_code: string | null; total_minor: number; rider_payable_minor: number | null; currency: string;
    } | null;
  };
  payment_summary?: {
    currency: string; method: string | null; status: string | null; paid_minor: number;
    refunded_minor: number; refundable_minor: number; adjustments_minor: number;
    payout: { status: string; driver_net_minor: number | null; commission_minor: number | null; settled_at: string | null };
  };
  support_tickets?: Array<{ id: number; status: string; issue_type: string; created_at: string | null }>;
  flags?: Array<{ id: number; reason: string; note: string; active: boolean; created_at: string | null; created_by: { label: string } | null }>;
  notes?: Array<{ id: number; body: string; created_at: string | null; created_by: { label: string; role: string } | null }>;
  money_actions?: Array<{ id: number; kind: string; amount_minor: number; currency: string; method: string; status: string; reason: string; approval_request_id: number | null; created_at: string | null }>;
  approval_requests?: Array<{ id: number; action_key: string; status: string; amount: number | null; currency: string; requested_at: string | null }>;
  audit_trail?: Array<{ id: number; action: string; created_at: string | null; reason: string; created_by: { label: string; role: string } | null }>;
  stale?: { is_stale: boolean; reason: string | null };
  stale_actions?: StaleActions;
  stale_detail?: StaleDetail;
  actions?: TripActions;
};

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good', cancelled: 'bad', requested: 'wait', accepted: 'wait', reached: 'wait', in_progress: 'wait',
};
const TIMELINE_LABEL: Record<string, string> = {
  requested_at: 'Requested', accepted_at: 'Accepted', reached_at: 'Driver arrived',
  started_at: 'Started', completed_at: 'Completed', cancelled_at: 'Cancelled',
};
const words = (s: string | null | undefined) => (s ?? '—').replace(/_/g, ' ');

const ACTION_LABEL: Record<ActionKey, string> = {
  cancel: 'Cancel trip…', refund: 'Refund…', adjust: 'Adjust fare…', flag: 'Flag…', note: 'Add note…',
};
const EVENT_LABEL: Record<string, string> = {
  requested: 'Requested', accepted: 'Driver accepted', arrived: 'Driver arrived', started: 'Trip started',
  completed: 'Completed', cancelled: 'Cancelled', driver_withdrew: 'Driver withdrew', stale_flagged: 'Flagged stale',
  trip_cancelled: 'Operator cancelled', trip_flagged: 'Operator flagged', trip_unflagged: 'Flag cleared',
  trip_note_added: 'Internal note', trip_refunded: 'Refund recorded', trip_fare_adjusted: 'Fare adjusted',
  trip_stale_marked_reviewed: 'Marked reviewed', trip_stale_marked_reviewed_refused: 'Mark reviewed refused',
  trip_stale_driver_released: 'Driver released', trip_stale_driver_released_refused: 'Driver release refused',
};

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [acting, setActing] = useState<ActionKey | null>(null);
  const access = useAdminAccess();

  const tz = timeZoneFor(currentScope(getCachedAccess())?.code);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      setData(await api.get<TripDetail>(`/ride/admin/trips/${id}/`));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this trip.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function resendReceipt() {
    setNotice(null); setActionError(null); setBusy(true);
    try {
      await api.post(`/ride/trip/${id}/receipt/resend/`);
      setNotice('Receipt re-sent.');
      await load(true);
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer ? err.message : 'The receipt could not be re-sent.');
    } finally {
      setBusy(false);
    }
  }

  async function clearFlags() {
    setNotice(null); setActionError(null); setBusy(true);
    try {
      await api.post(`/ride/admin/trips/${id}/unflag/`, {});
      setNotice('Flags cleared.');
      await load(true);
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer ? err.message : 'The flags could not be cleared.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the trip</span>
        <PageHeader title={`Trip #${id}`} />
        <TileGrid><Skeleton kind="tile" count={4} /></TileGrid>
        <div className="ops-review"><Skeleton kind="block" /><Skeleton kind="block" /></div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <>
        <PageHeader title={`Trip #${id}`} actions={<ButtonLink href="/trips" variant="ghost" size="sm">All trips</ButtonLink>} />
        <ErrorState title="This trip could not be loaded" detail={error ?? undefined} onRetry={() => void load()} />
      </>
    );
  }

  // The trip's own city clock, from the server; the selected scope's otherwise.
  const cityTz = data.city?.timezone ?? tz;
  const cur = data.fare_minor?.currency ?? data.currency ?? 'INR';
  const minor = (v: number | null | undefined, opts?: { signed?: boolean }) => formatMinor(v ?? null, cur, opts);
  const rail = visibleActions(data.actions, access);
  const pending = (data.approval_requests ?? []).filter((r) => r.status === 'requested');
  const sym = currencySymbol(data.currency ?? 'INR');
  const money = (v: string | null | undefined) => (v == null || v === '' ? '—' : `${sym}${v}`);
  const charged = data.fare.final_fare != null && data.fare.final_fare !== '';
  const state = data.status ?? 'unknown';
  const riderName = data.rider?.full_name?.trim() || data.rider?.phone_number || 'the rider';
  const hadSos = data.sos_events.length > 0;
  // Every reveal on this page is about this one trip. Masked values are
  // what the server sent; nothing revealed outlives the page.
  const tripTarget = { type: 'trip', id: data.id } as const;
  const mapHref = (lat: string | null, lng: string | null) =>
    lat && lng ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null;

  const paymentColumns: Column<TripDetail['payments'][number]>[] = [
    { key: 'id', label: '#', width: '4rem', render: (p) => p.id },
    { key: 'amount', label: 'Amount', num: true, width: '8rem', render: (p) => money(p.amount) },
    { key: 'method', label: 'Method', width: '7rem', render: (p) => <span className="capitalize">{p.method}</span> },
    { key: 'status', label: 'Status', width: '9rem', render: (p) => <Pill tone={/success|captured|paid|completed/i.test(p.status) ? 'good' : /fail|refund/i.test(p.status) ? 'bad' : 'wait'}>{words(p.status)}</Pill> },
    { key: 'gateway', label: 'Gateway', width: '8rem', render: (p) => p.payment_gateway ?? <span className="muted">—</span> },
    { key: 'order', label: 'Order ID', render: (p) => <span title={p.gateway_order_id ?? undefined}>{p.gateway_order_id ?? <span className="muted">—</span>}</span> },
    { key: 'when', label: 'When', num: true, width: '9.5rem', render: (p) => cityTime(p.created_at, cityTz) },
  ];

  const receiptColumns: Column<TripDetail['receipts'][number]>[] = [
    { key: 'no', label: 'Receipt', render: (r) => <span title={r.receipt_number}>{r.receipt_number} <span className="muted">v{r.version}</span></span> },
    { key: 'total', label: 'Total', num: true, width: '7rem', render: (r) => money(r.total_fare) },
    { key: 'gst', label: 'GST', num: true, width: '7rem', render: (r) => money(r.gst_amount) },
    { key: 'to', label: 'Sent to', render: (r) => r.sent_to_email || <span className="muted">—</span> },
    {
      key: 'sent', label: 'Last sent', num: true, width: '10rem',
      render: (r) => r.send_failure_reason
        ? <Pill tone="bad">Failed</Pill>
        : cityTime(r.last_sent_at, cityTz),
    },
    { key: 'pdf', label: 'PDF', width: '5rem', render: (r) => (r.pdf_url ? <a href={r.pdf_url} target="_blank" rel="noopener noreferrer">Open</a> : <span className="muted">—</span>) },
  ];

  return (
    <>
      <PageHeader
        title={`Trip #${data.id}`}
        subtitle={
          <>
            {data.zone ? `${data.zone.name} (${data.zone.code})` : 'No zone'}
            {' · requested '}{cityTime(data.timeline.requested_at, cityTz, { zone: true })}
          </>
        }
        actions={
          <>
            <Pill tone={TONE[state] ?? 'neutral'}>{words(state)}</Pill>
            <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => void resendReceipt()}>Resend receipt</button>
            <ButtonLink href="/trips" variant="ghost" size="sm">All trips</ButtonLink>
          </>
        }
      />

      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}
      {actionError && <div className="alert-error mb-4" role="alert">{actionError}</div>}
      {pending.length > 0 && (
        <div className="ops-banner" role="status">
          <b>Waiting for a checker</b>
          <span>{pending.map((r) => `${r.action_key} · request #${r.id}${r.amount != null && r.currency ? ` · ${formatMinor(r.amount, r.currency)}` : ''}`).join('; ')}</span>
        </div>
      )}
      {data.stale?.is_stale && (
        <div className="ops-banner" role="status"><b>Stale</b><span>{words(data.stale.reason)}: this trip has stopped progressing.</span></div>
      )}

      {rail.length > 0 && (
        <nav className="ops-form__row mb-4" aria-label="Trip actions">
          {rail.map((key) => (
            <button key={key} type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => { setNotice(null); setActionError(null); setActing(key); }}>
              {ACTION_LABEL[key]}
            </button>
          ))}
          {(data.flags ?? []).some((f) => f.active) && data.actions?.flag ? (
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={() => void clearFlags()}>Clear flags</button>
          ) : null}
        </nav>
      )}

      {data.stale_actions ? (
        <div className="mb-4">
          <StaleTripPanel
            model={panelModel(data.stale, data.stale_actions)}
            tripId={data.id}
            reason={data.stale?.reason ?? null}
            actions={data.stale_actions}
            detail={data.stale_detail}
            timeZone={cityTz}
            onDone={(message) => { setActionError(null); setNotice(message); void load(true); }}
          />
        </div>
      ) : null}

      <TileGrid>
        {data.fare_minor ? (
          <MetricTile
            label={state === 'completed' ? 'Charged' : 'Fare'} tone="money"
            value={minor(data.fare_minor.charged_minor)}
            note={data.fare_minor.final_minor != null ? `quoted ${minor(data.fare_minor.estimated_minor)}` : state === 'completed' ? 'the quoted fare' : 'quoted, not yet charged'}
          />
        ) : (
          <MetricTile
            label={charged ? 'Charged' : 'Estimated fare'} tone="money"
            value={money(charged ? data.fare.final_fare : data.fare.estimated_fare)}
            note={charged && data.fare.estimated_fare ? `estimated ${money(data.fare.estimated_fare)}` : charged ? undefined : 'not yet charged'}
          />
        )}
        <MetricTile
          label="Distance"
          value={data.fare.actual_distance_km ?? data.fare.estimated_distance_km}
          unit="km"
          note={data.fare.actual_distance_km ? 'driven' : data.fare.estimated_distance_km ? 'estimated' : undefined}
        />
        <MetricTile label="Surge" value={`×${data.fare.surge_multiplier ?? '1.00'}`} />
        <MetricTile
          label="Payment"
          value={data.fare.payment_method ? data.fare.payment_method.toUpperCase() : null}
          note={data.fare.payment_status ? words(data.fare.payment_status) : 'status not recorded'}
          tone={/fail/i.test(data.fare.payment_status ?? '') ? 'urgent' : 'neutral'}
        />
      </TileGrid>

      <div className="ops-review">
        <div className="grid gap-4">
          <Panel title="Route">
            <Facts>
              {/* The server cuts both addresses to locality, city and state
                  for everyone; the exact door is one logged reveal away. */}
              <Fact label="Pickup">
                <Revealable value={data.pickup.address ?? '—'} label="exact pickup address" target={tripTarget} field="pickup_address" />
                {mapHref(data.pickup.lat, data.pickup.lng) ? <> · <a className="sg-link" target="_blank" rel="noreferrer" href={mapHref(data.pickup.lat, data.pickup.lng)!}>map</a></> : null}
              </Fact>
              <Fact label="Drop">
                <Revealable value={data.destination.address ?? '—'} label="exact drop address" target={tripTarget} field="destination_address" />
                {mapHref(data.destination.lat, data.destination.lng) ? <> · <a className="sg-link" target="_blank" rel="noreferrer" href={mapHref(data.destination.lat, data.destination.lng)!}>map</a></> : null}
              </Fact>
            </Facts>
          </Panel>

          <Panel title={cityZoneLabel(cityTz) ? `Timeline (${cityZoneLabel(cityTz)})` : 'Timeline'}>
            {data.timeline_events && data.timeline_events.length > 0 ? (
              <ol className="ops-timeline">
                {data.timeline_events.map((e, i) => (
                  <li key={`${e.event}-${i}`} className="ops-timeline__item">
                    <time dateTime={e.at ?? undefined}>{cityTime(e.at, cityTz)}</time>
                    <b>{EVENT_LABEL[e.event] ?? words(e.event)}</b>
                    <span className="muted">
                      {e.created_by?.label ? `${e.created_by.label}${e.created_by.role ? ` (${e.created_by.role})` : ''}` : e.actor ? words(e.actor.type) : 'system'}
                      {e.detail ? ` · ${e.detail}` : ''}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <Facts>
                {Object.entries(data.timeline).map(([k, v]) => (
                  <Fact key={k} label={TIMELINE_LABEL[k] ?? words(k)}>
                    {v ? cityTime(v, cityTz) : <span className="muted">—</span>}
                  </Fact>
                ))}
              </Facts>
            )}
            {data.otp ? <Facts><Fact label="Pickup OTP"><code>{data.otp}</code></Fact></Facts> : null}
          </Panel>

          {data.fare_minor ? (
            <Panel title={`Fare breakdown · ${cur}`}>
              <Facts>
                {data.fare_minor.breakdown ? (
                  <>
                    <Fact label="Base fare">{minor(data.fare_minor.breakdown.base_minor)}</Fact>
                    <Fact label="Distance">{minor(data.fare_minor.breakdown.distance_minor)}</Fact>
                    <Fact label="Time">{minor(data.fare_minor.breakdown.time_minor)}</Fact>
                    <Fact label="Surge">×{data.fare_minor.breakdown.surge_multiplier}{data.fare_minor.breakdown.night_surge_multiplier ? ` · night ×${data.fare_minor.breakdown.night_surge_multiplier}` : ''}</Fact>
                    {data.fare_minor.breakdown.promo_discount_minor ? <Fact label={`Promo${data.fare_minor.breakdown.promo_code ? ` ${data.fare_minor.breakdown.promo_code}` : ''}`}>{minor(-data.fare_minor.breakdown.promo_discount_minor)}</Fact> : null}
                    <Fact label="Fare total">{minor(data.fare_minor.breakdown.total_minor)}</Fact>
                  </>
                ) : <Fact label="Breakdown"><span className="muted">No fare snapshot was recorded</span></Fact>}
                <Fact label="Tax">{data.fare_minor.tax_minor != null ? minor(data.fare_minor.tax_minor) : '—'} <span className="muted">(GST stub, per receipt)</span></Fact>
                {data.fare_minor.cancellation_fee_minor ? <Fact label="Cancellation fee">{minor(data.fare_minor.cancellation_fee_minor)}</Fact> : null}
                <Fact label="Charged"><b>{minor(data.fare_minor.charged_minor)}</b>{data.fare_minor.final_minor == null ? <span className="muted"> (quoted fare)</span> : null}</Fact>
              </Facts>
            </Panel>
          ) : data.fare.breakdown ? (
            <Panel title="Fare breakdown">
              <Facts>
                <Fact label="Base fare">{money(data.fare.breakdown.base_fare)}</Fact>
                <Fact label="Distance">{money(data.fare.breakdown.distance_fare)}</Fact>
                <Fact label="Time">{money(data.fare.breakdown.time_fare)}</Fact>
                <Fact label="Surge">×{data.fare.breakdown.surge_multiplier}</Fact>
                <Fact label="Total"><b>{money(data.fare.breakdown.total_fare)}</b></Fact>
              </Facts>
            </Panel>
          ) : null}

          {data.payment_summary && (
            <Panel title="Payment and payout">
              <Facts>
                <Fact label="Method">{data.payment_summary.method ? data.payment_summary.method.toUpperCase() : '—'} · {words(data.payment_summary.status)}</Fact>
                <Fact label="Paid">{minor(data.payment_summary.paid_minor)}</Fact>
                <Fact label="Refunded">{minor(data.payment_summary.refunded_minor)}</Fact>
                <Fact label="Refundable">{minor(data.payment_summary.refundable_minor)}</Fact>
                {data.payment_summary.adjustments_minor ? <Fact label="Adjustments">{minor(data.payment_summary.adjustments_minor, { signed: true })}</Fact> : null}
                <Fact label="Driver payout">
                  <Pill tone={data.payment_summary.payout.status === 'settled' ? 'good' : 'wait'}>{words(data.payment_summary.payout.status)}</Pill>
                  {data.payment_summary.payout.driver_net_minor != null ? ` ${minor(data.payment_summary.payout.driver_net_minor)} net` : ''}
                </Fact>
              </Facts>
            </Panel>
          )}

          {(data.money_actions ?? []).length > 0 && (
            <Panel title="Refunds and adjustments">
              <Facts>
                {(data.money_actions ?? []).map((m) => (
                  <Fact key={m.id} label={`${words(m.kind)} #${m.id}`}>
                    {formatMinor(m.amount_minor, m.currency, { signed: m.kind === 'adjustment' })} · {words(m.status)}
                    {m.approval_request_id ? <span className="muted"> · request #{m.approval_request_id}</span> : null}
                    <div className="help">{m.reason} · {cityTime(m.created_at, cityTz)}</div>
                  </Fact>
                ))}
              </Facts>
            </Panel>
          )}

          {data.payments.length > 0 && (
            <Panel title="Payments" flush>
              <DataTable caption="Payments on this trip" rows={data.payments} columns={paymentColumns} rowKey={(p) => p.id} density="compact" maxHeight={false} />
            </Panel>
          )}

          {data.receipts.length > 0 && (
            <Panel title="Receipts" flush>
              <DataTable caption="Receipts for this trip" rows={data.receipts} columns={receiptColumns} rowKey={(r) => r.id} density="compact" maxHeight={false} />
            </Panel>
          )}

          <Panel title={`Chat · ${data.chat.total} message${data.chat.total === 1 ? '' : 's'}`}>
            {data.chat.messages.length === 0 ? (
              <Empty title="No messages" detail="Nothing was said in the app on this trip." />
            ) : (
              <div className="ops-thread">
                {data.chat.messages.map((m) => {
                  const kind = m.is_system || m.sender_role === 'system' ? 'system' : m.sender_role === 'driver' ? 'support' : 'user';
                  return (
                    <div key={m.id} className={`ops-msg ops-msg--${kind}`}>
                      <div className="ops-msg__meta">
                        <span>{kind === 'system' ? 'System' : m.sender_role}</span>
                        <time dateTime={m.created_at ?? undefined}>{cityTime(m.created_at, cityTz)}</time>
                      </div>
                      <p className="ops-msg__body">{m.body}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <div className="grid gap-4">
          {hadSos && (
            <section className="ops-panel ops-panel--alarm">
              <div className="ops-panel__head"><h2>SOS on this trip</h2></div>
              <div className="ops-panel__body">
                <Facts>
                  {data.sos_events.map((e) => (
                    <Fact key={e.id} label={`SOS #${e.id}`}>
                      <Pill tone={e.status === 'resolved' ? 'good' : e.status === 'open' ? 'bad' : 'wait'}>{words(e.status)}</Pill>
                      <div className="help">raised {cityTime(e.created_at, cityTz)}{e.acknowledged_at ? ` · acknowledged ${cityTime(e.acknowledged_at, cityTz)}` : ''}{e.resolved_at ? ` · resolved ${cityTime(e.resolved_at, cityTz)}` : ''}</div>
                    </Fact>
                  ))}
                </Facts>
                <div className="mt-3"><PageButtonLink page="safety" href="/safety-ops">Open Safety</PageButtonLink></div>
              </div>
            </section>
          )}

          {(data.support_tickets ?? []).length > 0 && (
            <Panel title="Support tickets">
              <Facts>
                {(data.support_tickets ?? []).map((t) => (
                  <Fact key={t.id} label={`Ticket #${t.id}`}>
                    <PageLink page="support" href={`/support/${t.id}`}>{words(t.issue_type)}</PageLink> · <Pill tone={/resolved|closed/i.test(t.status) ? 'good' : 'wait'}>{words(t.status.toLowerCase())}</Pill>
                  </Fact>
                ))}
              </Facts>
            </Panel>
          )}

          {(data.flags ?? []).length > 0 && (
            <Panel title="Flags">
              <Facts>
                {(data.flags ?? []).map((f) => (
                  <Fact key={f.id} label={words(f.reason)}>
                    <Pill tone={f.active ? 'bad' : 'neutral'}>{f.active ? 'active' : 'cleared'}</Pill>
                    <div className="help">{f.note ? `${f.note} · ` : ''}{f.created_by?.label ?? 'operator'} · {cityTime(f.created_at, cityTz)}</div>
                  </Fact>
                ))}
              </Facts>
            </Panel>
          )}

          <Panel title="Internal notes">
            {(data.notes ?? []).length === 0 ? (
              <Empty title="No notes" detail="Notes are for operators only; riders and drivers never see them." />
            ) : (
              <div className="ops-thread">
                {(data.notes ?? []).map((n) => (
                  <div key={n.id} className="ops-msg ops-msg--support">
                    <div className="ops-msg__meta">
                      <span>{n.created_by?.label ?? 'operator'}</span>
                      <time dateTime={n.created_at ?? undefined}>{cityTime(n.created_at, cityTz)}</time>
                    </div>
                    <p className="ops-msg__body">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Audit trail">
            {(data.audit_trail ?? []).length === 0 ? (
              <Empty title="No operator actions" detail="Every cancel, refund, flag and note on this trip is listed here." />
            ) : (
              <Facts>
                {(data.audit_trail ?? []).map((r) => (
                  <Fact key={r.id} label={cityTime(r.created_at, cityTz)}>
                    {EVENT_LABEL[r.action] ?? words(r.action)}
                    <div className="help">{r.created_by?.label ?? 'system'}{r.created_by?.role ? ` (${r.created_by.role})` : ''}{r.reason ? ` · ${r.reason}` : ''}</div>
                  </Fact>
                ))}
              </Facts>
            )}
          </Panel>

          <Panel title="Rider">
            {data.rider ? (
              <Facts>
                <Fact label="Name">{data.rider.full_name ?? '—'}{data.rider.flagged_for_review ? <> <Pill tone="bad">Flagged</Pill></> : null}</Fact>
                <Fact label="Phone"><Revealable value={data.rider.phone_number ?? '—'} label="rider phone" target={tripTarget} field="rider_phone" /></Fact>
                <Fact label="Email"><Revealable value={data.rider.email ?? '—'} label="rider email" target={tripTarget} field="rider_email" /></Fact>
                <Fact label="Rating">{data.rider.rating ?? '—'}{data.rider.rating_count ? ` (${data.rider.rating_count})` : ''}</Fact>
              </Facts>
            ) : <Empty title="No rider" />}
          </Panel>

          <Panel title="Driver">
            {data.driver ? (
              <Facts>
                <Fact label="Name"><PageLink page="drivers" href={`/drivers/${data.driver.driver_id}`}>{data.driver.full_name ?? `Driver #${data.driver.driver_id}`}</PageLink></Fact>
                <Fact label="Phone"><Revealable value={data.driver.phone_number ?? '—'} label="driver phone" target={tripTarget} field="driver_phone" /></Fact>
                <Fact label="State">
                  <Pill tone={data.driver.status === 'online' ? 'good' : 'neutral'}>{data.driver.status ?? '—'}</Pill>{' '}
                  {data.driver.approved ? <Pill tone="good">Approved</Pill> : <Pill tone="wait">Unapproved</Pill>}
                </Fact>
                <Fact label="Rating">{data.driver.ratings} · {data.driver.total_trips} trips</Fact>
                {data.driver.fatigue_lockout_until ? <Fact label="Rest until">{cityTime(data.driver.fatigue_lockout_until, cityTz)}</Fact> : null}
              </Facts>
            ) : <Empty title="No driver assigned" />}
          </Panel>

          <Panel title="Vehicle">
            {data.vehicle ? (
              <Facts>
                <Fact label="Registration">{data.vehicle.vehicle_number ?? '—'}</Fact>
                <Fact label="Make">{[data.vehicle.brand, data.vehicle.model, data.vehicle.color].filter(Boolean).join(' · ') || '—'}</Fact>
                <Fact label="Category">{data.vehicle.type ?? '—'}</Fact>
                <Fact label="Insurance">{data.vehicle.insurance_expiry ?? '—'}</Fact>
                <Fact label="Permit">{data.vehicle.permit_expiry ?? '—'}</Fact>
                <Fact label="Fitness">{data.vehicle.fitness_expiry ?? '—'}</Fact>
                <Fact label="PUC">{data.vehicle.puc_expiry ?? '—'}</Fact>
              </Facts>
            ) : <Empty title="No vehicle recorded" />}
          </Panel>

          {data.ratings.length > 0 && (
            <Panel title="Ratings">
              <Facts>
                {data.ratings.map((r) => (
                  <Fact key={r.id} label={words(r.direction)}>
                    <span aria-label={`${r.score} out of 5`}>{'★'.repeat(r.score)}{'☆'.repeat(Math.max(0, 5 - r.score))}</span>
                    {r.comments ? <div className="help">{r.comments}</div> : null}
                  </Fact>
                ))}
              </Facts>
            </Panel>
          )}

          {data.driver_cancellations.length > 0 && (
            <Panel title="Driver cancellations">
              <Facts>
                {data.driver_cancellations.map((c) => (
                  <Fact key={c.id} label={cityTime(c.created_at, cityTz)}>
                    {words(c.reason)}{c.note ? <div className="help">{c.note}</div> : null}
                  </Fact>
                ))}
              </Facts>
            </Panel>
          )}
        </div>
      </div>

      {acting && (
        <ActionDrawer
          action={acting}
          tripId={data.id}
          currency={cur}
          refundable={data.payment_summary?.refundable_minor ?? null}
          refundKey={data.actions?.refund_action_key ?? null}
          riderName={riderName}
          cancelReasons={data.actions?.cancel_reasons}
          flagReasons={data.actions?.flag_reasons}
          onClose={() => setActing(null)}
          onDone={(message, kind) => { if (kind === 'done') setNotice(message); void load(true); }}
        />
      )}
    </>
  );
}
