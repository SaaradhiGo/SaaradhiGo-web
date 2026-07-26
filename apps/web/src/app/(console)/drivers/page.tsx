'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

type Driver = {
  id: number;
  user_id?: { phone_number?: string; full_name?: string } | number;
  status?: string;
  approved?: boolean;
  ratings?: string | number;
  total_trips?: number;
  fatigue_lockout_until?: string | null;
};

export default function DriversPage() {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get<any>('/driver/admin/list/');
      const list = (r?.results ?? r?.data ?? r) as Driver[];
      setDrivers(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load drivers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function approve(id: number) {
    try {
      await api.patch(`/driver/admin/${id}/update-kyc/`, { approved: true });
      await load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Approve failed';
      alert(msg);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Drivers</h1>
      {loading && <p className="text-white/60">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {!loading && !error && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/60">
              <tr>
                <th className="pb-3">#</th>
                <th className="pb-3">Phone</th>
                <th className="pb-3">Name</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Approved</th>
                <th className="pb-3">Rating</th>
                <th className="pb-3">Trips</th>
                <th className="pb-3">Lockout</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => {
                const u = typeof d.user_id === 'object' ? d.user_id : undefined;
                const lockedUntil = d.fatigue_lockout_until ? new Date(d.fatigue_lockout_until) : null;
                const locked = lockedUntil && lockedUntil > new Date();
                return (
                  <tr key={d.id} className="table-row hover:bg-white/5">
                    <td className="py-2">
                      <Link href={`/drivers/${d.id}`} className="text-brand hover:underline">#{d.id}</Link>
                    </td>
                    <td className="py-2">{u?.phone_number ?? '—'}</td>
                    <td className="py-2">{u?.full_name ?? '—'}</td>
                    <td className="py-2">
                      <span className="tag border-white/20">{d.status ?? '—'}</span>
                    </td>
                    <td className="py-2">{d.approved ? 'Yes' : 'No'}</td>
                    <td className="py-2">{d.ratings ?? '—'}</td>
                    <td className="py-2">{d.total_trips ?? 0}</td>
                    <td className="py-2">{locked ? (
                      <span className="tag border-red-500/40 text-red-300">until {lockedUntil!.toLocaleString()}</span>
                    ) : '—'}</td>
                    <td className="py-2">
                      {!d.approved && (
                        <button className="btn-ghost text-brand text-xs" onClick={() => approve(d.id)}>
                          Approve
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {drivers.length === 0 && (
                <tr><td colSpan={9} className="py-4 text-white/50">No drivers.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
