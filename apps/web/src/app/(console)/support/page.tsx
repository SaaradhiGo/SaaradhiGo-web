'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

type Ticket = {
  id: number;
  issue_type: string;
  status: string;
  description?: string;
  created_at?: string;
  user_id?: number | { phone_number?: string };
};

const STATUS_FILTERS = ['', 'OPEN', 'IN_PROGRESS', 'WAITING_USER', 'CLOSED'];

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = status ? `?status=${status}` : '';
        const r = await api.get<any>(`/support/admin/tickets/${qs}`);
        const list = (r?.results ?? r?.data ?? r) as Ticket[];
        setTickets(Array.isArray(list) ? list : []);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load tickets');
      } finally {
        setLoading(false);
      }
    })();
  }, [status]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Support tickets</h1>
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
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {!loading && !error && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/60">
              <tr>
                <th className="pb-3">#</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Description</th>
                <th className="pb-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id} className="table-row hover:bg-white/5">
                  <td className="py-2">
                    <Link href={`/support/${t.id}`} className="text-brand hover:underline">#{t.id}</Link>
                  </td>
                  <td className="py-2">{t.issue_type}</td>
                  <td className="py-2">
                    <span className="tag border-white/20">{t.status}</span>
                  </td>
                  <td className="py-2 max-w-md truncate" title={t.description}>
                    {t.description ?? '—'}
                  </td>
                  <td className="py-2 text-white/60">{t.created_at?.slice(0, 16) ?? '—'}</td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-white/50">No tickets.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
