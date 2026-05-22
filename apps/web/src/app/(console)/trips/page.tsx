'use client';

import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

type Trip = {
  id: number;
  status?: string;
  status_id?: { status_code?: string };
  user_id?: number | { id?: number; phone_number?: string };
  driver_id?: number | { id?: number };
  pickup_address?: string;
  destination_address?: string;
  estimated_fare?: string;
  final_fare?: string;
  requested_at?: string;
};

const STATUS_FILTERS = ['', 'requested', 'accepted', 'reached', 'in_progress', 'completed', 'cancelled'];

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        const r = await api.get<any>(`/ride/admin/trips/${qs}`);
        const list = (r?.results ?? r?.data ?? r) as Trip[];
        setTrips(Array.isArray(list) ? list : []);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load trips');
      } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Trips</h1>
        <div className="flex gap-2">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s || 'all'}
              onClick={() => setStatus(s)}
              className={`px-3 py-1 rounded-full text-xs uppercase tracking-widest border ${
                status === s ? 'bg-brand text-black border-brand' : 'border-white/10 text-white/70 hover:border-white/30'
              }`}
            >
              {s || 'all'}
            </button>
          ))}
        </div>
      </div>
      {loading && <p className="text-white/60">Loading...</p>}
      {error && <p className="text-red-400">{error}</p>}
      {!loading && !error && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/60">
              <tr>
                <th className="pb-3">#</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Pickup</th>
                <th className="pb-3">Drop</th>
                <th className="pb-3">Fare</th>
                <th className="pb-3">Requested</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className="table-row">
                  <td className="py-2">{t.id}</td>
                  <td className="py-2">{t.status ?? t.status_id?.status_code ?? '—'}</td>
                  <td className="py-2">{t.pickup_address ?? '—'}</td>
                  <td className="py-2">{t.destination_address ?? '—'}</td>
                  <td className="py-2">Rs {t.final_fare ?? t.estimated_fare ?? '—'}</td>
                  <td className="py-2 text-white/60">{t.requested_at?.slice(0, 16) ?? '—'}</td>
                </tr>
              ))}
              {trips.length === 0 && (
                <tr><td colSpan={6} className="py-4 text-white/50">No trips.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
