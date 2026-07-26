'use client';

import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

type DashData = {
  date: string;
  trips: { requested: number; accepted: number; completed: number; cancelled: number; total: number };
  gmv: string;
  drivers: { online_now: number; online_24h: number };
  riders: { active_24h: number };
  cancellations: { driver_24h: number };
  withdrawals: { pending: number; completed_today_amount: string };
  receipts: { issued_today: number; send_failures_today: number };
};

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await api.get<DashData>('/ride/admin/dashboard/');
        setData(d);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-white/60">Loading...</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!data) return null;

  const tiles: Array<{ label: string; value: string | number; sub?: string }> = [
    { label: 'Trips total', value: data.trips.total, sub: `${data.trips.completed} completed` },
    { label: 'GMV today', value: `Rs ${data.gmv}` },
    { label: 'Cancellations 24h', value: data.cancellations.driver_24h },
    { label: 'Drivers online now', value: data.drivers.online_now, sub: `${data.drivers.online_24h} in 24h` },
    { label: 'Riders 24h', value: data.riders.active_24h },
    { label: 'Withdrawals pending', value: data.withdrawals.pending, sub: `Rs ${data.withdrawals.completed_today_amount} paid today` },
    { label: 'Receipts today', value: data.receipts.issued_today, sub: `${data.receipts.send_failures_today} failures` },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
      <p className="text-white/50 text-sm mb-6">{data.date}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <div key={t.label} className="card">
            <div className="text-xs uppercase tracking-widest text-white/50">{t.label}</div>
            <div className="text-2xl font-semibold mt-2">{t.value}</div>
            {t.sub && <div className="text-xs text-white/40 mt-1">{t.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
