'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { messageOf } from '@/components/console/notifications';
import { PricingNav } from '@/components/console/pricing';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { RecordFacts, RecordSection } from '@/components/console/kit/ListBits';
import { RecordPanel } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';

/** Vehicle classes: what a driver can register, and where a fare card prices it. */
type ClassRow = {
  id: number; code: string; description: string; zones_priced: number; zones_in_scope: number;
  zones: { id: number; name: string; city: string }[];
  zones_missing: { id: number; name: string }[];
  active_vehicles: number;
};
type Payload = { results: ClassRow[]; can_edit: boolean };

function AddForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.post('/pricing/admin/vehicle-classes/', { code: code.trim(), description: description.trim() });
      onDone();
    } catch (e) {
      setErr(messageOf(e, 'The vehicle class could not be added.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="ops-confirm mb-4" aria-label="Add a vehicle class" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <label className="ops-form__label" htmlFor="vc-code">Code</label>
      <input id="vc-code" className="input" value={code} placeholder="suv_xl" onChange={(e) => setCode(e.target.value.toLowerCase())} />
      <label className="ops-form__label" htmlFor="vc-desc">Description</label>
      <input id="vc-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      <p className="help">Drivers can choose it when they register at once; riders see it only where a fare card prices it. The code cannot be changed later.</p>
      {err ? <p className="alert-error" role="alert">{err}</p> : null}
      <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || !code.trim()}>Add class</button>{' '}
      <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onCancel}>Cancel</button>
    </form>
  );
}

function DescriptionEdit({ row, onSaved }: { row: ClassRow; onSaved: () => void }) {
  const [text, setText] = useState(row.description);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => setText(row.description), [row.id, row.description]);
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api.patch(`/pricing/admin/vehicle-classes/${row.id}/`, { description: text.trim() });
      onSaved();
    } catch (e) {
      setErr(messageOf(e, 'The description could not be saved.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <label className="ops-form__label" htmlFor="vc-edit">Edit description</label>
      <input id="vc-edit" className="input" value={text} onChange={(e) => setText(e.target.value)} />
      {err ? <p className="alert-error" role="alert">{err}</p> : null}
      <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || text.trim() === row.description}
        onClick={() => void save()}>Save description</button>
    </div>
  );
}

export default function VehicleClassesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Payload>('/pricing/admin/vehicle-classes/'));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The vehicle classes could not be loaded.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const rows = data?.results ?? [];
  const canEdit = data?.can_edit ?? false;
  const open = rows.find((r) => r.id === openId) ?? null;
  const columns: ListColumn<ClassRow>[] = [
    { key: 'class', label: 'Class', primary: true, render: (r) => <>{r.code}<br /><span className="muted">{r.description}</span></> },
    {
      key: 'priced', label: 'Priced in',
      render: (r) => (
        <>{`${r.zones_priced} of ${r.zones_in_scope} zones`}{' '}
          {r.zones_priced === 0 ? <StatusChip tone="caution">Not priced anywhere</StatusChip> : null}</>
      ),
    },
    { key: 'veh', label: 'Active vehicles', num: true, render: (r) => r.active_vehicles },
  ];

  return (
    <>
      <PricingNav />
      {adding ? <AddForm onCancel={() => setAdding(false)} onDone={() => { setAdding(false); void load(); }} /> : null}
      <div className={open ? 'ops-split' : undefined}>
        <ListPage<ClassRow>
          pageKey="pricing-vehicle-classes"
          title="Vehicle classes"
          summary="What a driver can register, and in how many zones a fare card prices it."
          views={[{ key: '', label: 'All classes', count: data ? rows.length : undefined }]}
          view=""
          onView={() => undefined}
          actionsSlot={canEdit ? (
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setAdding(true)}>Add a vehicle class…</button>
          ) : undefined}
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          total={data ? rows.length : null}
          page={1}
          pageSize={Math.max(1, rows.length)}
          onPage={() => undefined}
          onRow={(r) => setOpenId(r.id)}
          activeKey={openId}
          loading={data === null && !error}
          error={error}
          empty="No vehicle classes yet."
        />
        {open ? (
          <RecordPanel
            label={`Vehicle class ${open.code}`}
            title={open.code}
            subtitle={open.description}
            onClose={() => setOpenId(null)}
            tabs={[
              {
                key: 'coverage', label: 'Coverage',
                content: (
                  <>
                    <RecordSection title="Priced in">
                      {open.zones.length === 0 ? <p className="ops-record__empty">No zone prices this class yet.</p> : (
                        <ul>{open.zones.map((z) => (
                          <li key={z.id}><Link href={`/ops/zones/${z.id}`} className="ops-linkbtn">{z.name}</Link> <span className="muted">{z.city}</span></li>
                        ))}</ul>
                      )}
                    </RecordSection>
                    <RecordSection title="Missing a fare card">
                      {open.zones_missing.length === 0 ? <p className="ops-record__empty">Every zone in scope prices this class.</p> : (
                        <ul>{open.zones_missing.map((z) => (
                          <li key={z.id}>{z.name}{' '}
                            <Link href="/ops/pricing/fare-cards" className="ops-linkbtn" aria-label={`Add a fare card for ${z.name}`}>Add a fare card</Link></li>
                        ))}</ul>
                      )}
                    </RecordSection>
                  </>
                ),
              },
              {
                key: 'details', label: 'Details',
                content: (
                  <>
                    <RecordFacts rows={[['Code', open.code], ['Description', open.description || '—'], ['Active vehicles', open.active_vehicles]]} />
                    {canEdit ? <DescriptionEdit row={open} onSaved={() => void load()} /> : null}
                  </>
                ),
              },
            ]}
          />
        ) : null}
      </div>
    </>
  );
}
