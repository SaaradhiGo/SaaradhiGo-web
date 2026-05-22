'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

type DriverDetail = {
  id: number;
  status: string;
  approved: boolean;
  ratings: string;
  total_trips: number;
  license_expiry: string | null;
  license_doc_url: string | null;
  upi_id: string | null;
  fatigue_lockout_until: string | null;
  user: {
    id: number; phone_number: string | null; full_name: string | null;
    email: string | null; is_active: boolean | null;
  };
  active_vehicle_id: number | null;
  vehicles: Array<{
    id: number; type: string | null; brand: string | null; model: string | null;
    color: string | null; vehicle_number: string | null; status: string;
    insurance_expiry: string | null; permit_expiry: string | null;
    fitness_expiry: string | null; puc_expiry: string | null;
    is_active_vehicle: boolean;
  }>;
  fatigue: {
    locked: boolean; reason: string;
    locked_until: string | null;
    active_seconds_24h: number; minutes_until_cap: number;
  } | null;
  sessions: Array<{
    id: number; started_at: string | null; ended_at: string | null;
    duration_seconds: number; end_reason: string;
  }>;
  cancellations: { last_24h: number; last_7d: number; last_30d: number };
  withdrawals: Array<{
    id: number; amount: string; status: string; payout_method: string;
    requested_at: string | null; processed_at: string | null;
    payout_status: string | null; failure_count: number;
  }>;
  recent_trips: Array<{
    id: number; status: string | null;
    pickup_address: string | null; destination_address: string | null;
    estimated_fare: string | null; final_fare: string | null;
    requested_at: string | null; completed_at: string | null;
  }>;
  earnings: {
    lifetime: string; today: string; this_month: string;
    last_withdrawal_at: string | null; wallet_balance: string;
  };
};

const fmt = (s: string | null | undefined) => (s ? s.replace('T', ' ').slice(0, 19) : '—');
const hoursMins = (sec: number) => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
};

function isExpiringSoon(iso: string | null): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t - Date.now() < 1000 * 60 * 60 * 24 * 30;
}
function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export default function DriverDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<DriverDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.get<DriverDetail>(`/driver/admin/${id}/full/`);
      setData(d);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load driver');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function approve() {
    setActionMsg(null); setActionErr(null);
    try {
      await api.patch(`/driver/admin/${id}/update-kyc/`, { approved: true });
      setActionMsg('Driver approved.');
      load();
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : 'Approve failed');
    }
  }
  async function reject(reason: string) {
    setActionMsg(null); setActionErr(null);
    try {
      await api.patch(`/driver/admin/${id}/update-kyc/`, { approved: false, reason });
      setActionMsg('Driver rejected.');
      load();
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : 'Reject failed');
    }
  }

  if (loading) return <p className="text-white/60">Loading...</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <Link href="/drivers" className="btn-ghost text-xs">&larr; Back to drivers</Link>
          <h1 className="text-2xl font-semibold mt-1">
            Driver #{data.id} — {data.user.full_name || data.user.phone_number || '—'}
            <span className="ml-3 tag border-white/20 text-sm">{data.status}</span>
            {data.approved
              ? <span className="ml-2 tag border-emerald-500/40 text-emerald-300">approved</span>
              : <span className="ml-2 tag border-yellow-500/40 text-yellow-300">unapproved</span>}
            {data.fatigue?.locked && (
              <span className="ml-2 tag border-red-500/40 text-red-300">
                locked until {fmt(data.fatigue.locked_until)}
              </span>
            )}
          </h1>
        </div>
        <div className="flex gap-2">
          {!data.approved && (
            <button onClick={approve} className="btn-ghost text-brand text-sm">Approve KYC</button>
          )}
          {data.approved && (
            <button
              onClick={() => {
                const reason = prompt('Reason for rejection (optional):') ?? '';
                if (confirm('Revoke approval for this driver?')) reject(reason);
              }}
              className="btn-ghost text-red-400 text-sm"
            >
              Revoke approval
            </button>
          )}
        </div>
      </div>
      {actionMsg && <p className="text-emerald-400 text-sm">{actionMsg}</p>}
      {actionErr && <p className="text-red-400 text-sm">{actionErr}</p>}

      {/* User + KYC + Earnings tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">User</h2>
          <dl className="text-sm space-y-1">
            <dt className="text-white/50">Phone</dt><dd>{data.user.phone_number ?? '—'}</dd>
            <dt className="text-white/50 mt-2">Name</dt><dd>{data.user.full_name ?? '—'}</dd>
            <dt className="text-white/50 mt-2">Email</dt><dd>{data.user.email ?? '—'}</dd>
            <dt className="text-white/50 mt-2">Active</dt><dd>{data.user.is_active ? 'Yes' : 'No'}</dd>
            <dt className="text-white/50 mt-2">UPI</dt><dd>{data.upi_id ?? '—'}</dd>
            <dt className="text-white/50 mt-2">Rating</dt><dd>{data.ratings}</dd>
            <dt className="text-white/50 mt-2">Total trips</dt><dd>{data.total_trips}</dd>
          </dl>
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">KYC + Fatigue</h2>
          <dl className="text-sm space-y-1">
            <dt className="text-white/50">License expiry</dt>
            <dd className={
              isExpired(data.license_expiry) ? 'text-red-300'
              : isExpiringSoon(data.license_expiry) ? 'text-yellow-300'
              : ''
            }>{data.license_expiry ?? '—'}</dd>
            <dt className="text-white/50 mt-2">License doc</dt>
            <dd>{data.license_doc_url ? <a className="text-brand" href={data.license_doc_url} target="_blank">Open</a> : '—'}</dd>
            {data.fatigue && (
              <>
                <dt className="text-white/50 mt-2">Active 24h</dt>
                <dd>{hoursMins(data.fatigue.active_seconds_24h)} of 12h</dd>
                <dt className="text-white/50 mt-2">Minutes until cap</dt>
                <dd>{data.fatigue.minutes_until_cap}</dd>
              </>
            )}
            <dt className="text-white/50 mt-2">Cancellations 24h / 7d / 30d</dt>
            <dd>{data.cancellations.last_24h} / {data.cancellations.last_7d} / {data.cancellations.last_30d}</dd>
          </dl>
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Earnings</h2>
          <dl className="text-sm space-y-1">
            <dt className="text-white/50">Wallet balance</dt><dd>Rs {data.earnings.wallet_balance}</dd>
            <dt className="text-white/50 mt-2">Today</dt><dd>Rs {data.earnings.today}</dd>
            <dt className="text-white/50 mt-2">This month</dt><dd>Rs {data.earnings.this_month}</dd>
            <dt className="text-white/50 mt-2">Lifetime</dt><dd>Rs {data.earnings.lifetime}</dd>
            <dt className="text-white/50 mt-2">Last withdrawal</dt><dd>{fmt(data.earnings.last_withdrawal_at)}</dd>
          </dl>
        </div>
      </div>

      {/* Vehicles */}
      <div className="card">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Vehicles</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-white/60">
            <tr>
              <th className="pb-2">#</th><th className="pb-2">Type</th><th className="pb-2">Vehicle</th>
              <th className="pb-2">Plate</th><th className="pb-2">Insurance</th>
              <th className="pb-2">Permit</th><th className="pb-2">Fitness</th><th className="pb-2">PUC</th>
              <th className="pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.vehicles.map((v) => (
              <tr key={v.id} className="table-row">
                <td className="py-2">
                  {v.id}{v.is_active_vehicle && <span className="ml-2 tag border-brand/40 text-brand text-xs">active</span>}
                </td>
                <td className="py-2">{v.type}</td>
                <td className="py-2">{v.brand} {v.model} {v.color && `(${v.color})`}</td>
                <td className="py-2 font-mono text-xs">{v.vehicle_number}</td>
                {[v.insurance_expiry, v.permit_expiry, v.fitness_expiry, v.puc_expiry].map((d, i) => (
                  <td key={i} className={`py-2 ${isExpired(d) ? 'text-red-300' : isExpiringSoon(d) ? 'text-yellow-300' : ''}`}>
                    {d ?? '—'}
                  </td>
                ))}
                <td className="py-2"><span className="tag border-white/20">{v.status}</span></td>
              </tr>
            ))}
            {data.vehicles.length === 0 && (
              <tr><td colSpan={9} className="py-4 text-white/50">No vehicles.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sessions */}
      {data.sessions.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">
            Online sessions (last 20)
          </h2>
          <table className="w-full text-sm">
            <thead className="text-left text-white/60">
              <tr><th className="pb-2">Started</th><th className="pb-2">Ended</th><th className="pb-2">Duration</th><th className="pb-2">Reason</th></tr>
            </thead>
            <tbody>
              {data.sessions.map((s) => (
                <tr key={s.id} className="table-row">
                  <td className="py-2">{fmt(s.started_at)}</td>
                  <td className="py-2">{fmt(s.ended_at)}</td>
                  <td className="py-2">{hoursMins(s.duration_seconds)}</td>
                  <td className="py-2">{s.end_reason || (s.ended_at ? '—' : 'still open')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Withdrawals */}
      {data.withdrawals.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">
            Withdrawals (last 10)
          </h2>
          <table className="w-full text-sm">
            <thead className="text-left text-white/60">
              <tr>
                <th className="pb-2">#</th><th className="pb-2">Amount</th><th className="pb-2">Method</th>
                <th className="pb-2">Status</th><th className="pb-2">Payout</th>
                <th className="pb-2">Requested</th><th className="pb-2">Processed</th>
              </tr>
            </thead>
            <tbody>
              {data.withdrawals.map((w) => (
                <tr key={w.id} className="table-row">
                  <td className="py-2">{w.id}</td>
                  <td className="py-2">Rs {w.amount}</td>
                  <td className="py-2">{w.payout_method}</td>
                  <td className="py-2"><span className="tag border-white/20">{w.status}</span></td>
                  <td className="py-2">{w.payout_status ?? '—'}{w.failure_count > 0 && <span className="text-red-300"> ({w.failure_count} fails)</span>}</td>
                  <td className="py-2 text-white/60">{fmt(w.requested_at)}</td>
                  <td className="py-2 text-white/60">{fmt(w.processed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recent trips */}
      <div className="card">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">
          Recent trips (last 20)
        </h2>
        <table className="w-full text-sm">
          <thead className="text-left text-white/60">
            <tr>
              <th className="pb-2">#</th><th className="pb-2">Status</th>
              <th className="pb-2">Pickup</th><th className="pb-2">Drop</th>
              <th className="pb-2">Fare</th><th className="pb-2">Requested</th>
            </tr>
          </thead>
          <tbody>
            {data.recent_trips.map((t) => (
              <tr key={t.id} className="table-row">
                <td className="py-2">
                  <Link href={`/trips/${t.id}`} className="text-brand hover:underline">#{t.id}</Link>
                </td>
                <td className="py-2">{t.status ?? '—'}</td>
                <td className="py-2">{t.pickup_address ?? '—'}</td>
                <td className="py-2">{t.destination_address ?? '—'}</td>
                <td className="py-2">Rs {t.final_fare ?? t.estimated_fare ?? '—'}</td>
                <td className="py-2 text-white/60">{fmt(t.requested_at)}</td>
              </tr>
            ))}
            {data.recent_trips.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-white/50">No trips.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
