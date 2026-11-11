'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { DataTable, ErrorState, Skeleton } from '@/components/console/ui';

/**
 * The vehicle catalogue drivers pick make and model from (10 Nov). USA from NHTSA vPIC; India a
 * curated list for admins to extend. Adding or retiring an entry is audited; nothing is deleted.
 */
type Entry = { id: number; country: string; vehicle_type: string; make: string; model: string; source: string; curated: boolean; is_active: boolean };

export function VehicleCataloguePanel({ may }: { may: boolean }) {
  const [country, setCountry] = useState('IN');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<{ results: Entry[]; count: number; types: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [add, setAdd] = useState({ vehicle_type: '', make: '', model: '' });
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const qs = new URLSearchParams({ country, ...(type ? { type } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
      setData(await api.get(`/driver/admin/vehicle-catalogue/?${qs}`));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The catalogue could not be loaded.');
    }
  }, [country, type, q]);
  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setNote(null);
    try {
      await api.post('/driver/admin/vehicle-catalogue/', { country, ...add, reason: 'Added in the console' });
      setAdd({ ...add, model: '' }); setNote('Added.'); void load();
    } catch (err) { setNote(err instanceof ApiError && err.fromServer ? err.message : 'That could not be added.'); }
  }
  async function toggle(e: Entry) {
    try { await api.patch(`/driver/admin/vehicle-catalogue/${e.id}/`, { is_active: !e.is_active }); void load(); }
    catch (err) { setNote(err instanceof ApiError && err.fromServer ? err.message : 'That could not be changed.'); }
  }

  return (
    <section className="ops-card" aria-labelledby="vc-h">
      <header className="ops-card__head"><div>
        <h2 id="vc-h">Vehicle catalogue</h2>
        <p>Makes and models drivers pick from. A driver whose vehicle is missing chooses Other, and the vehicle is reviewed.</p>
      </div></header>
      <div className="ops-list__filters mb-3">
        <select aria-label="Country" className="ops-select" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="IN">India</option><option value="US">USA</option>
        </select>
        <select aria-label="Vehicle type" className="ops-select" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Every type</option>
          {(data?.types ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input aria-label="Search make or model" className="input" type="search" placeholder="Search make or model" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {note ? <div className="ops-confirm mb-3" role="status">{note}</div> : null}
      {may ? (
        <form onSubmit={create} className="ops-list__filters mb-3" aria-label="Add a model">
          <select aria-label="Type to add" className="ops-select" required value={add.vehicle_type} onChange={(e) => setAdd({ ...add, vehicle_type: e.target.value })}>
            <option value="">Type</option>
            {(data?.types ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input aria-label="Make" className="input" required placeholder="Make" value={add.make} onChange={(e) => setAdd({ ...add, make: e.target.value })} />
          <input aria-label="Model" className="input" required placeholder="Model" value={add.model} onChange={(e) => setAdd({ ...add, model: e.target.value })} />
          <button type="submit" className="btn btn-primary">Add</button>
        </form>
      ) : null}
      {data === null && !error ? <Skeleton kind="row" count={3} /> : error ? (
        <ErrorState title="The catalogue could not be loaded" detail={error} onRetry={() => void load()} />
      ) : (
        <>
          <p className="muted mb-2">{data!.count} entries{data!.count > data!.results.length ? `, first ${data!.results.length} shown` : ''}.</p>
          <DataTable caption="Vehicle catalogue" rows={data!.results} rowKey={(e) => String(e.id)} density="compact"
            columns={[
              { key: 'type', label: 'Type', render: (e) => e.vehicle_type },
              { key: 'make', label: 'Make', render: (e) => e.make },
              { key: 'model', label: 'Model', render: (e) => e.model },
              { key: 'src', label: 'Source', hideBelow: 1100, render: (e) => (e.curated ? 'Curated' : 'NHTSA vPIC') },
              { key: 'state', label: 'State', render: (e) => <StatusChip tone={e.is_active ? 'good' : 'info'}>{e.is_active ? 'Offered' : 'Retired'}</StatusChip> },
              { key: 'act', label: '', render: (e) => (may ? <button type="button" className="ops-linkbtn" onClick={() => void toggle(e)}>{e.is_active ? 'Retire' : 'Offer again'}</button> : null) },
            ]} />
        </>
      )}
    </section>
  );
}
