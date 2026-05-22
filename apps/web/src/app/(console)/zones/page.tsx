'use client';

import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

type Zone = {
  id: number;
  code: string;
  name: string;
  city: string;
  state_code: string;
  country: string;
  zone_type: string;
  priority: number;
  is_active: boolean;
  currency: string;
};

type RateCard = {
  id: number;
  zone_code: string;
  vehicle_type_name: string;
  base_fare: string;
  per_km_fare: string;
  per_min_fare: string;
  min_fare: string;
  surge_cap_multiplier: string;
  commission_percent: string;
  gst_percent: string;
  version: number;
  is_active: boolean;
};

export default function ZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [cards, setCards] = useState<Record<number, RateCard[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await api.get<any>('/pricing/admin/zones/');
        const list = (r?.results ?? r?.data ?? r) as Zone[];
        setZones(Array.isArray(list) ? list : []);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Could not load zones');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadCards(zoneId: number) {
    try {
      const r = await api.get<any>(`/pricing/admin/rate-cards/?zone=${zoneId}&is_active=true`);
      const list = (r?.results ?? r?.data ?? r) as RateCard[];
      setCards((prev) => ({ ...prev, [zoneId]: Array.isArray(list) ? list : [] }));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Could not load rate cards');
    }
  }

  if (loading) return <p className="text-white/60">Loading...</p>;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Service zones</h1>
      <div className="space-y-4">
        {zones.map((z) => (
          <div key={z.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-semibold">
                  {z.name} <span className="text-white/40 text-sm ml-2">{z.code}</span>
                </div>
                <div className="text-white/50 text-sm mt-1">
                  {z.zone_type} · {z.city}, {z.state_code}, {z.country} · priority {z.priority}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`tag ${z.is_active ? 'border-emerald-500/40 text-emerald-300' : 'border-white/20 text-white/60'}`}>
                  {z.is_active ? 'Active' : 'Inactive'}
                </span>
                <button className="btn-ghost text-brand text-sm" onClick={() => loadCards(z.id)}>
                  Show rate cards
                </button>
              </div>
            </div>
            {cards[z.id] && (
              <table className="w-full text-xs mt-4">
                <thead className="text-left text-white/60">
                  <tr>
                    <th className="pb-2">Vehicle</th>
                    <th className="pb-2">Base</th>
                    <th className="pb-2">/km</th>
                    <th className="pb-2">/min</th>
                    <th className="pb-2">Min</th>
                    <th className="pb-2">Surge cap</th>
                    <th className="pb-2">Commission</th>
                    <th className="pb-2">GST</th>
                  </tr>
                </thead>
                <tbody>
                  {cards[z.id].map((c) => (
                    <tr key={c.id} className="table-row">
                      <td className="py-1">{c.vehicle_type_name}</td>
                      <td className="py-1">Rs {c.base_fare}</td>
                      <td className="py-1">Rs {c.per_km_fare}</td>
                      <td className="py-1">Rs {c.per_min_fare}</td>
                      <td className="py-1">Rs {c.min_fare}</td>
                      <td className="py-1">x {c.surge_cap_multiplier}</td>
                      <td className="py-1">{c.commission_percent}%</td>
                      <td className="py-1">{c.gst_percent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
