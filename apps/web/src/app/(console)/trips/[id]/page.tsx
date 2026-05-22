'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

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
    total_trips: number;
    license_expiry: string | null;
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
  payments: Array<{
    id: number; amount: string; method: string; status: string;
    payment_gateway: string | null; gateway_order_id: string | null;
    gateway_payment_id: string | null; created_at: string | null;
  }>;
  ratings: Array<{
    id: number; direction: string; score: number; comments: string | null;
    created_at: string | null;
  }>;
  receipts: Array<{
    id: number; receipt_number: string; version: number;
    total_fare: string; gst_amount: string; sent_to_email: string;
    last_sent_at: string | null; send_failure_reason: string | null;
    pdf_url: string | null;
  }>;
  chat: {
    total: number; offset: number; limit: number;
    messages: Array<{
      id: number; sender_role: string; body: string;
      is_system: boolean; created_at: string | null;
    }>;
  };
  driver_cancellations: Array<{
    id: number; reason: string; note: string; created_at: string | null;
  }>;
  sos_events: Array<{
    id: number; status: string | null; created_at: string | null;
    acknowledged_at: string | null; resolved_at: string | null;
  }>;
  promo: {
    code: string; discount_type: string; discount_amount: string;
    created_at: string | null;
  } | null;
  zone: {
    code: string; name: string; city: string; state_code: string;
  } | null;
};

const fmt = (s: string | null | undefined) => (s ? s.replace('T', ' ').slice(0, 19) : '—');

export default function TripDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<TripDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<TripDetail>(`/ride/admin/trips/${id}/`);
      setData(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load trip');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function resendReceipt() {
    setActionMsg(null); setActionErr(null);
    try {
      await api.post(`/ride/trip/${id}/receipt/resend/`);
      setActionMsg('Receipt re-sent.');
      load();
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : 'Resend failed');
    }
  }

  async function refundOriginal() {
    if (!confirm('Refund to original payment method? Settles in 5-7 days.')) return;
    setActionMsg(null); setActionErr(null);
    try {
      await api.post('/payments/refund/', { trip_id: Number(id), mode: 'original' });
      setActionMsg('Refund initiated to original payment method.');
      load();
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : 'Refund failed');
    }
  }

  async function refundCredit() {
    if (!confirm('Refund to rider as VahanGo Credits? Instant; subject to balance cap.')) return;
    setActionMsg(null); setActionErr(null);
    try {
      await api.post('/payments/refund/', { trip_id: Number(id), mode: 'credit' });
      setActionMsg('Credit issued (or auto-fell back to original-method).');
      load();
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : 'Refund failed');
    }
  }

  if (loading) return <p className="text-white/60">Loading...</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/trips" className="btn-ghost text-xs">&larr; Back to trips</Link>
          <h1 className="text-2xl font-semibold mt-1">
            Trip #{data.id}{' '}
            <span className="ml-3 tag border-white/20 text-sm">{data.status ?? '—'}</span>
            {data.zone && (
              <span className="ml-2 tag border-brand/40 text-brand text-xs">{data.zone.code}</span>
            )}
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={resendReceipt} className="btn-ghost text-brand text-sm">Resend receipt</button>
          <button onClick={refundCredit} className="btn-ghost text-brand text-sm">Refund to credits</button>
          <button onClick={refundOriginal} className="btn-ghost text-brand text-sm">Refund to original</button>
        </div>
      </div>
      {actionMsg && <p className="text-emerald-400 text-sm">{actionMsg}</p>}
      {actionErr && <p className="text-red-400 text-sm">{actionErr}</p>}

      {/* Locations */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <div className="text-xs uppercase tracking-widest text-white/50 mb-1">Pickup</div>
          <div>{data.pickup.address ?? '—'}</div>
          <div className="text-xs text-white/40 mt-1">
            {data.pickup.lat}, {data.pickup.lng}
          </div>
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-widest text-white/50 mb-1">Drop</div>
          <div>{data.destination.address ?? '—'}</div>
          <div className="text-xs text-white/40 mt-1">
            {data.destination.lat}, {data.destination.lng}
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Timeline</h2>
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(data.timeline).map(([k, v]) => (
              <tr key={k} className="table-row">
                <td className="py-2 text-white/60 w-48">{k}</td>
                <td className="py-2">{fmt(v)}</td>
              </tr>
            ))}
            {data.otp && (
              <tr className="table-row">
                <td className="py-2 text-white/60">otp</td>
                <td className="py-2 font-mono">{data.otp}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Rider / Driver / Vehicle */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Rider</h2>
          {data.rider ? (
            <dl className="text-sm space-y-1">
              <dt className="text-white/50">Phone</dt><dd>{data.rider.phone_number ?? '—'}</dd>
              <dt className="text-white/50 mt-2">Name</dt><dd>{data.rider.full_name ?? '—'}</dd>
              <dt className="text-white/50 mt-2">Email</dt><dd>{data.rider.email ?? '—'}</dd>
              <dt className="text-white/50 mt-2">Rating</dt>
              <dd>
                {data.rider.rating ?? '—'} ({data.rider.rating_count} ratings)
                {data.rider.flagged_for_review && (
                  <span className="ml-2 tag border-red-500/40 text-red-300">flagged</span>
                )}
              </dd>
            </dl>
          ) : <p className="text-white/50 text-sm">No rider</p>}
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Driver</h2>
          {data.driver ? (
            <dl className="text-sm space-y-1">
              <dt className="text-white/50">Phone</dt><dd>{data.driver.phone_number ?? '—'}</dd>
              <dt className="text-white/50 mt-2">Name</dt><dd>{data.driver.full_name ?? '—'}</dd>
              <dt className="text-white/50 mt-2">Status</dt>
              <dd>
                <span className="tag border-white/20">{data.driver.status ?? '—'}</span>
                {data.driver.approved
                  ? <span className="ml-2 tag border-emerald-500/40 text-emerald-300">approved</span>
                  : <span className="ml-2 tag border-yellow-500/40 text-yellow-300">unapproved</span>}
              </dd>
              <dt className="text-white/50 mt-2">Rating</dt><dd>{data.driver.ratings}</dd>
              <dt className="text-white/50 mt-2">Total trips</dt><dd>{data.driver.total_trips}</dd>
              {data.driver.fatigue_lockout_until && (
                <>
                  <dt className="text-white/50 mt-2">Lockout until</dt>
                  <dd className="text-red-300">{fmt(data.driver.fatigue_lockout_until)}</dd>
                </>
              )}
            </dl>
          ) : <p className="text-white/50 text-sm">No driver assigned</p>}
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Vehicle</h2>
          {data.vehicle ? (
            <dl className="text-sm space-y-1">
              <dt className="text-white/50">Type</dt><dd>{data.vehicle.type}</dd>
              <dt className="text-white/50 mt-2">Brand / Model</dt>
              <dd>{data.vehicle.brand} {data.vehicle.model} ({data.vehicle.color})</dd>
              <dt className="text-white/50 mt-2">Number</dt><dd>{data.vehicle.vehicle_number}</dd>
              <dt className="text-white/50 mt-2">Insurance</dt><dd>{data.vehicle.insurance_expiry ?? '—'}</dd>
              <dt className="text-white/50 mt-2">Permit</dt><dd>{data.vehicle.permit_expiry ?? '—'}</dd>
              <dt className="text-white/50 mt-2">Fitness</dt><dd>{data.vehicle.fitness_expiry ?? '—'}</dd>
              <dt className="text-white/50 mt-2">PUC</dt><dd>{data.vehicle.puc_expiry ?? '—'}</dd>
            </dl>
          ) : <p className="text-white/50 text-sm">No vehicle</p>}
        </div>
      </div>

      {/* Fare */}
      <div className="card">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Fare</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-white/50">Final</div>
            <div className="text-xl font-semibold">Rs {data.fare.final_fare ?? data.fare.estimated_fare ?? '—'}</div>
          </div>
          <div>
            <div className="text-white/50">Distance</div>
            <div>{data.fare.actual_distance_km ?? data.fare.estimated_distance_km ?? '—'} km</div>
          </div>
          <div>
            <div className="text-white/50">Surge</div>
            <div>x {data.fare.surge_multiplier ?? '1.00'}</div>
          </div>
          <div>
            <div className="text-white/50">Payment</div>
            <div>{data.fare.payment_method ?? '—'} ({data.fare.payment_status ?? '—'})</div>
          </div>
        </div>
        {data.fare.breakdown && (
          <table className="w-full text-xs mt-4">
            <tbody>
              <tr className="table-row"><td className="py-1 text-white/60">Base fare</td><td className="py-1 text-right">Rs {data.fare.breakdown.base_fare}</td></tr>
              <tr className="table-row"><td className="py-1 text-white/60">Distance fare</td><td className="py-1 text-right">Rs {data.fare.breakdown.distance_fare}</td></tr>
              <tr className="table-row"><td className="py-1 text-white/60">Time fare</td><td className="py-1 text-right">Rs {data.fare.breakdown.time_fare}</td></tr>
              <tr className="table-row"><td className="py-1 text-white/60">Surge multiplier</td><td className="py-1 text-right">x {data.fare.breakdown.surge_multiplier}</td></tr>
              <tr className="table-row"><td className="py-1 font-semibold">Total</td><td className="py-1 text-right font-semibold">Rs {data.fare.breakdown.total_fare}</td></tr>
            </tbody>
          </table>
        )}
        {data.promo && (
          <div className="mt-3 text-sm">
            <span className="tag border-brand/40 text-brand">{data.promo.code}</span>
            <span className="text-white/60 ml-2">discount: Rs {data.promo.discount_amount}</span>
          </div>
        )}
      </div>

      {/* Payments */}
      {data.payments.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Payments</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-white/60">
              <tr><th className="pb-2">#</th><th className="pb-2">Amount</th><th className="pb-2">Method</th><th className="pb-2">Status</th><th className="pb-2">Gateway</th><th className="pb-2">Order ID</th></tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id} className="table-row">
                  <td className="py-2">{p.id}</td>
                  <td className="py-2">Rs {p.amount}</td>
                  <td className="py-2">{p.method}</td>
                  <td className="py-2"><span className="tag border-white/20">{p.status}</span></td>
                  <td className="py-2">{p.payment_gateway ?? '—'}</td>
                  <td className="py-2 font-mono text-xs">{p.gateway_order_id ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ratings */}
      {data.ratings.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Ratings</h2>
          {data.ratings.map((r) => (
            <div key={r.id} className="text-sm border-b border-white/5 py-2 last:border-0">
              <div className="flex justify-between">
                <span className="text-white/60">{r.direction}</span>
                <span>{'★'.repeat(r.score)}{'☆'.repeat(5 - r.score)}</span>
              </div>
              {r.comments && <div className="text-white/80 mt-1">{r.comments}</div>}
              <div className="text-xs text-white/40 mt-1">{fmt(r.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Receipts */}
      {data.receipts.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Receipts</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-white/60">
              <tr><th className="pb-2">#</th><th className="pb-2">Version</th><th className="pb-2">Total</th><th className="pb-2">GST</th><th className="pb-2">Sent to</th><th className="pb-2">Last sent</th><th className="pb-2">PDF</th></tr>
            </thead>
            <tbody>
              {data.receipts.map((r) => (
                <tr key={r.id} className="table-row">
                  <td className="py-2 font-mono text-xs">{r.receipt_number}</td>
                  <td className="py-2">v{r.version}</td>
                  <td className="py-2">Rs {r.total_fare}</td>
                  <td className="py-2">Rs {r.gst_amount}</td>
                  <td className="py-2">{r.sent_to_email || '—'}</td>
                  <td className="py-2">{fmt(r.last_sent_at)}</td>
                  <td className="py-2">{r.pdf_url ? <a className="text-brand" href={r.pdf_url} target="_blank">Open</a> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Driver cancellations */}
      {data.driver_cancellations.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Driver cancellations</h2>
          {data.driver_cancellations.map((c) => (
            <div key={c.id} className="text-sm border-b border-white/5 py-2 last:border-0">
              <div className="text-white/60">{c.reason}</div>
              {c.note && <div className="text-white/80 mt-1">{c.note}</div>}
              <div className="text-xs text-white/40 mt-1">{fmt(c.created_at)}</div>
            </div>
          ))}
        </div>
      )}

      {/* SOS */}
      {data.sos_events.length > 0 && (
        <div className="card border border-red-500/40 bg-red-900/10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-red-300 mb-3">SOS events</h2>
          {data.sos_events.map((e) => (
            <div key={e.id} className="text-sm border-b border-red-500/20 py-2 last:border-0">
              <div className="flex justify-between">
                <span>SOS #{e.id}</span>
                <span className="tag border-red-500/40 text-red-300">{e.status ?? '—'}</span>
              </div>
              <div className="text-xs text-white/60 mt-1">
                created {fmt(e.created_at)} ·
                ack {fmt(e.acknowledged_at)} ·
                resolved {fmt(e.resolved_at)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chat */}
      <div className="card">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">
          Chat ({data.chat.total} messages)
        </h2>
        {data.chat.messages.length === 0 ? (
          <p className="text-white/50 text-sm">No messages.</p>
        ) : (
          <div className="space-y-2">
            {data.chat.messages.map((m) => (
              <div key={m.id} className="text-sm">
                {m.is_system || m.sender_role === 'system' ? (
                  <div className="text-center italic text-white/40 text-xs">{m.body}</div>
                ) : (
                  <div className={m.sender_role === 'driver' ? 'text-emerald-300' : 'text-amber-200'}>
                    <span className="text-xs text-white/40 mr-2 uppercase tracking-widest">{m.sender_role}</span>
                    {m.body}
                    <span className="text-xs text-white/30 ml-2">{fmt(m.created_at)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
