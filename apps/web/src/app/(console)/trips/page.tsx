'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Empty, PageHeader, Panel, Pill, Table, Filters } from '@/components/console/ui';

/**
 * Trips, for looking one up.
 *
 * An operator comes here with a question — a rider rang about a charge, a
 * driver disputes a cancellation — so the filters are the states those
 * questions are about, and every row opens the full trip.
 *
 * The fare column shows what was CHARGED where that is known and the
 * estimate otherwise, labelled, because the difference is the thing most
 * disputes are about.
 */
type Trip = {
  id: number;
  status?: string;
  status_id?: { status_code?: string };
  user_id?: number | { id?: number; phone_number?: string; full_name?: string };
  driver_id?: number | { id?: number };
  pickup_address?: string;
  destination_address?: string;
  estimated_fare?: string;
  final_fare?: string;
  currency?: string | null;
  requested_at?: string;
};

type Page = { count?: number; next?: string | null; results?: Trip[] };

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'requested', label: 'Requested' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good',
  cancelled: 'bad',
  requested: 'wait',
  accepted: 'wait',
  in_progress: 'wait',
};

const when = (s?: string) => (s ? s.replace('T', ' ').slice(0, 16) : '—');

function rider(t: Trip) {
  const u = typeof t.user_id === 'object' && t.user_id ? t.user_id : null;
  return u?.full_name?.trim() || u?.phone_number
    || (typeof t.user_id === 'number' ? `#${t.user_id}` : '—');
}

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [status, setStatus] = useState<(typeof FILTERS)[number]['key']>('');
  const [total, setTotal] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTrips(null);
    setError(null);
    try {
      const query = new URLSearchParams({ page_size: '50' });
      if (status) query.set('status', status);
      const page = await api.get<Page>(`/ride/admin/trips/?${query}`);
      const list = Array.isArray(page?.results) ? page.results
        : (Array.isArray(page) ? (page as unknown as Trip[]) : []);
      setTrips(list);
      setTotal(typeof page?.count === 'number' ? page.count : null);
      setMore(Boolean(page?.next));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the trips.');
      setTrips([]);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHeader
        title="Trips"
        subtitle={total !== null ? `${total} matching` : undefined}
        actions={<Filters value={status} options={FILTERS} onChange={setStatus} />}
      />

      {error && <div className="alert-error mb-5" role="alert">{error}</div>}

      <Panel flush>
        {trips === null ? (
          <Empty title="Loading…" />
        ) : trips.length === 0 ? (
          <Empty
            error={Boolean(error)}
            title={error ? 'The list could not be loaded' : 'No trips match'}
            detail={error ? 'This is not the same as there being none.' : undefined}
          />
        ) : (
          <Table head={<>
            <th>Trip</th><th>Status</th><th>Rider</th>
            <th>Pickup</th><th>Drop</th>
            <th className="num">Fare</th><th>Requested</th>
          </>}>
            {trips.map((t) => {
              const state = t.status || t.status_id?.status_code || 'unknown';
              const charged = t.final_fare != null && t.final_fare !== '';
              return (
                <tr key={t.id}>
                  <td><Link href={`/trips/${t.id}`}>#{t.id}</Link></td>
                  <td><Pill tone={TONE[state] ?? 'neutral'}>{state}</Pill></td>
                  <td>{rider(t)}</td>
                  <td className="max-w-[15rem] truncate" title={t.pickup_address}>
                    {t.pickup_address || '—'}
                  </td>
                  <td className="max-w-[15rem] truncate" title={t.destination_address}>
                    {t.destination_address || '—'}
                  </td>
                  <td className="num">
                    {t.currency ? `${t.currency} ` : ''}
                    {charged ? t.final_fare : t.estimated_fare ?? '—'}
                    {!charged && t.estimated_fare ? (
                      <span className="text-ink-subtle"> est.</span>
                    ) : null}
                  </td>
                  <td>{when(t.requested_at)}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      {more && (
        <p className="help mt-3">
          Showing the first 50 of {total ?? 'many'}. Use the filters to narrow it.
        </p>
      )}
    </>
  );
}
