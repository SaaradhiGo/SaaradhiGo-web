'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { currentScope, getCachedAccess } from '@/lib/adminScope';
import { stamp, timeZoneFor, zoneAbbreviation } from '@/lib/consoleTime';
import { currencySymbol } from '@/lib/money';
import { ButtonLink } from '@/components/sg/Button';
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
};

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good', cancelled: 'bad', requested: 'wait', accepted: 'wait', reached: 'wait', in_progress: 'wait',
};
const TIMELINE_LABEL: Record<string, string> = {
  requested_at: 'Requested', accepted_at: 'Accepted', reached_at: 'Driver arrived',
  started_at: 'Started', completed_at: 'Completed', cancelled_at: 'Cancelled',
};
const words = (s: string | null | undefined) => (s ?? '—').replace(/_/g, ' ');

type RefundMode = 'original' | 'credit';

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refund, setRefund] = useState<RefundMode | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const tz = timeZoneFor(currentScope(getCachedAccess())?.code);
  const tzName = zoneAbbreviation(tz);

  const load = useCallback(async () => {
    setLoading(true);
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
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer ? err.message : 'The receipt could not be re-sent.');
    } finally {
      setBusy(false);
    }
  }

  async function doRefund() {
    if (!refund) return;
    setNotice(null); setActionError(null); setBusy(true);
    try {
      await api.post('/payments/refund/', { trip_id: Number(id), mode: refund });
      setNotice(refund === 'original'
        ? 'Refund started to the original payment method. It settles in 5–7 days.'
        : 'Credits issued to the rider (or, if the balance cap was hit, refunded to the original method).');
      setRefundOpen(false);
      setRefund(null);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer ? err.message : 'The refund did not go through.');
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

  const sym = currencySymbol(data.currency ?? 'INR');
  const money = (v: string | null | undefined) => (v == null || v === '' ? '—' : `${sym}${v}`);
  const charged = data.fare.final_fare != null && data.fare.final_fare !== '';
  const state = data.status ?? 'unknown';
  const riderName = data.rider?.full_name?.trim() || data.rider?.phone_number || 'the rider';
  const hadSos = data.sos_events.length > 0;
  const mapHref = (lat: string | null, lng: string | null) =>
    lat && lng ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}` : null;

  const paymentColumns: Column<TripDetail['payments'][number]>[] = [
    { key: 'id', label: '#', width: '4rem', render: (p) => p.id },
    { key: 'amount', label: 'Amount', num: true, width: '8rem', render: (p) => money(p.amount) },
    { key: 'method', label: 'Method', width: '7rem', render: (p) => <span className="capitalize">{p.method}</span> },
    { key: 'status', label: 'Status', width: '9rem', render: (p) => <Pill tone={/success|captured|paid|completed/i.test(p.status) ? 'good' : /fail|refund/i.test(p.status) ? 'bad' : 'wait'}>{words(p.status)}</Pill> },
    { key: 'gateway', label: 'Gateway', width: '8rem', render: (p) => p.payment_gateway ?? <span className="muted">—</span> },
    { key: 'order', label: 'Order ID', render: (p) => <span title={p.gateway_order_id ?? undefined}>{p.gateway_order_id ?? <span className="muted">—</span>}</span> },
    { key: 'when', label: tzName ? `When (${tzName})` : 'When', num: true, width: '9.5rem', render: (p) => stamp(p.created_at, tz) },
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
        : stamp(r.last_sent_at, tz),
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
            {' · requested '}{stamp(data.timeline.requested_at, tz)}{tzName ? ` ${tzName}` : ''}
          </>
        }
        actions={
          <>
            <Pill tone={TONE[state] ?? 'neutral'}>{words(state)}</Pill>
            <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => void resendReceipt()}>Resend receipt</button>
            <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => { setRefund(null); setRefundOpen(true); }}>Refund…</button>
            <ButtonLink href="/trips" variant="ghost" size="sm">All trips</ButtonLink>
          </>
        }
      />

      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}
      {actionError && <div className="alert-error mb-4" role="alert">{actionError}</div>}

      <TileGrid>
        <MetricTile
          label={charged ? 'Charged' : 'Estimated fare'} tone="money"
          value={money(charged ? data.fare.final_fare : data.fare.estimated_fare)}
          note={charged && data.fare.estimated_fare ? `estimated ${money(data.fare.estimated_fare)}` : charged ? undefined : 'not yet charged'}
        />
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
              <Fact label="Pickup">
                {data.pickup.address ?? '—'}
                {mapHref(data.pickup.lat, data.pickup.lng) ? <> · <a className="sg-link" target="_blank" rel="noreferrer" href={mapHref(data.pickup.lat, data.pickup.lng)!}>map</a></> : null}
              </Fact>
              <Fact label="Drop">
                {data.destination.address ?? '—'}
                {mapHref(data.destination.lat, data.destination.lng) ? <> · <a className="sg-link" target="_blank" rel="noreferrer" href={mapHref(data.destination.lat, data.destination.lng)!}>map</a></> : null}
              </Fact>
            </Facts>
          </Panel>

          <Panel title={tzName ? `Timeline (${tzName})` : 'Timeline'}>
            <Facts>
              {Object.entries(data.timeline).map(([k, v]) => (
                <Fact key={k} label={TIMELINE_LABEL[k] ?? words(k)}>
                  {v ? stamp(v, tz) : <span className="muted">—</span>}
                </Fact>
              ))}
              {data.otp ? <Fact label="Pickup OTP"><code>{data.otp}</code></Fact> : null}
            </Facts>
          </Panel>

          {data.fare.breakdown && (
            <Panel title="Fare breakdown">
              <Facts>
                <Fact label="Base fare">{money(data.fare.breakdown.base_fare)}</Fact>
                <Fact label="Distance">{money(data.fare.breakdown.distance_fare)}</Fact>
                <Fact label="Time">{money(data.fare.breakdown.time_fare)}</Fact>
                <Fact label="Surge">×{data.fare.breakdown.surge_multiplier}</Fact>
                <Fact label="Total"><b>{money(data.fare.breakdown.total_fare)}</b></Fact>
                {data.promo ? <Fact label="Promo">{data.promo.code} · −{money(data.promo.discount_amount)}</Fact> : null}
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
                        <time dateTime={m.created_at ?? undefined}>{stamp(m.created_at, tz)}</time>
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
                      <div className="help">raised {stamp(e.created_at, tz)}{e.acknowledged_at ? ` · acknowledged ${stamp(e.acknowledged_at, tz)}` : ''}{e.resolved_at ? ` · resolved ${stamp(e.resolved_at, tz)}` : ''}</div>
                    </Fact>
                  ))}
                </Facts>
                <div className="mt-3"><ButtonLink href="/sos" variant="secondary" size="sm">Open the SOS board</ButtonLink></div>
              </div>
            </section>
          )}

          <Panel title="Rider">
            {data.rider ? (
              <Facts>
                <Fact label="Name">{data.rider.full_name ?? '—'}{data.rider.flagged_for_review ? <> <Pill tone="bad">Flagged</Pill></> : null}</Fact>
                <Fact label="Phone">{data.rider.phone_number ?? '—'}</Fact>
                <Fact label="Email">{data.rider.email ?? '—'}</Fact>
                <Fact label="Rating">{data.rider.rating ?? '—'}{data.rider.rating_count ? ` (${data.rider.rating_count})` : ''}</Fact>
              </Facts>
            ) : <Empty title="No rider" />}
          </Panel>

          <Panel title="Driver">
            {data.driver ? (
              <Facts>
                <Fact label="Name"><Link href={`/drivers/${data.driver.driver_id}`}>{data.driver.full_name ?? `Driver #${data.driver.driver_id}`}</Link></Fact>
                <Fact label="Phone">{data.driver.phone_number ?? '—'}</Fact>
                <Fact label="State">
                  <Pill tone={data.driver.status === 'online' ? 'good' : 'neutral'}>{data.driver.status ?? '—'}</Pill>{' '}
                  {data.driver.approved ? <Pill tone="good">Approved</Pill> : <Pill tone="wait">Unapproved</Pill>}
                </Fact>
                <Fact label="Rating">{data.driver.ratings} · {data.driver.total_trips} trips</Fact>
                {data.driver.fatigue_lockout_until ? <Fact label="Rest until">{stamp(data.driver.fatigue_lockout_until, tz)}</Fact> : null}
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
                  <Fact key={c.id} label={stamp(c.created_at, tz)}>
                    {words(c.reason)}{c.note ? <div className="help">{c.note}</div> : null}
                  </Fact>
                ))}
              </Facts>
            </Panel>
          )}
        </div>
      </div>

      <Drawer
        open={refundOpen}
        title={`Refund trip #${data.id}`}
        onClose={() => setRefundOpen(false)}
        footer={
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={() => setRefundOpen(false)}>Cancel</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || !refund} onClick={() => void doRefund()}>
              {busy ? 'Working…' : refund === 'original' ? 'Refund to original method' : refund === 'credit' ? 'Issue credits' : 'Choose how'}
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          <Facts>
            <Fact label="Rider">{riderName}</Fact>
            <Fact label="Charged"><b>{money(charged ? data.fare.final_fare : data.fare.estimated_fare)}</b></Fact>
            <Fact label="Paid by">{data.fare.payment_method ? data.fare.payment_method.toUpperCase() : '—'}</Fact>
          </Facts>
          <div className="ops-filterset">
            <fieldset>
              <legend>How</legend>
              <label>
                <input type="radio" name="refund" value="original" checked={refund === 'original'} onChange={() => setRefund('original')} />
                <span>Back to the original payment method <span className="muted">· settles in 5–7 days</span></span>
              </label>
              <label>
                <input type="radio" name="refund" value="credit" checked={refund === 'credit'} onChange={() => setRefund('credit')} />
                <span>As SaaradhiGo credits <span className="muted">· instant, subject to the balance cap</span></span>
              </label>
            </fieldset>
          </div>
          {refund && (
            <div className="ops-confirm">
              <b>{refund === 'original' ? `Refund ${money(charged ? data.fare.final_fare : data.fare.estimated_fare)} to ${riderName}'s original method` : `Issue ${money(charged ? data.fare.final_fare : data.fare.estimated_fare)} in credits to ${riderName}`}</b>
              <span>The server decides the exact amount from what was actually captured, and refuses a second refund. Its answer is shown here.</span>
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
}
