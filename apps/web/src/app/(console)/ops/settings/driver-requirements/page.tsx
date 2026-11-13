'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canReadPlatform, canWritePlatform } from '@/lib/platform';
import { PlatformNav, PlatformNoAccess } from '@/components/console/platform';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { DataTable, Drawer, ErrorState, PageHeader, Skeleton } from '@/components/console/ui';
import { VehicleCataloguePanel } from '@/components/console/drivers/VehicleCataloguePanel';

/**
 * Configure > Driver requirements (10 Nov). What a driver must provide in each market: each item
 * required, optional or off, and whether it keeps the driver offline until approved; the minimum
 * age, the oldest vehicle, and the languages offered. A state row overrides its country item by
 * item. A change is a request a second admin approves (pricing.change), in the audit log.
 */
type Need = 'required' | 'optional' | 'off';
type Items = Record<string, { need: Need; blocks_online: boolean }>;
type Row = {
  country: string; state_code: string; driver_requirements: Items | null; min_driver_age: number | null;
  max_vehicle_age_years: number | null; languages: string[] | null; version: number; updated_by: string;
};

const ITEMS: [string, string][] = [
  ['profile_photo', 'Profile photo'], ['legal_name', 'Full name as on the licence'], ['date_of_birth', 'Date of birth'],
  ['address', 'Current address'], ['permanent_address', 'Permanent address'], ['address_proof', 'Address proof'],
  ['emergency_contact', 'Emergency contact'], ['driving_licence', 'Driving licence'], ['aadhaar', 'Aadhaar (last 4 + copy)'],
  ['pan', 'PAN'], ['police_verification', 'Police verification'], ['background_check', 'Background check'],
  ['vehicle', 'Vehicle details'], ['vehicle_photos', 'Vehicle photos'], ['rc', 'Registration Certificate (RC)'],
  ['registration', 'Vehicle registration'], ['insurance', 'Vehicle insurance'], ['permit', 'Commercial permit'],
  ['fitness', 'Fitness certificate'], ['puc', 'PUC certificate'], ['inspection', 'Vehicle inspection'],
  ['payout_method', 'Payout method'],
];
const LANGS: [string, string][] = [['en', 'English'], ['te', 'తెలుగు'], ['hi', 'हिन्दी'], ['es', 'Español']];
const where = (r: Row) => (r.state_code ? `${r.country}-${r.state_code}` : `All of ${r.country}`);

export default function DriverRequirementsPage() {
  const access = useAdminAccess();
  const may = canWritePlatform(access);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const got = await api.get<{ results: Row[] }>(withScope('/pricing/admin/regulation/'));
      setRows(got.results.filter((r) => r.driver_requirements || r.languages || r.min_driver_age));
    } catch (err) {
      setRows([]);
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The driver requirements could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!canReadPlatform(access)) {
    return (<><PageHeader title="Driver requirements" /><PlatformNav /><PlatformNoAccess what="Driver requirements" /></>);
  }
  return (
    <>
      <PageHeader title="Driver requirements" />
      <PlatformNav />
      {notice ? <div className="ops-confirm mb-3" role="status"><b>{notice}</b></div> : null}
      <section className="ops-card">
        <header className="ops-card__head"><div>
          <h2>What a driver provides, per market</h2>
          <p>The driver web and app ask for exactly these. A state row overrides its country, item by item.</p>
        </div></header>
        {rows === null ? <Skeleton kind="row" count={2} /> : error ? (
          <ErrorState title="The driver requirements could not be loaded" detail={error} onRetry={() => void load()} />
        ) : (
          <DataTable caption="Driver requirements by market" rows={rows} rowKey={(r) => `${r.country}-${r.state_code}`}
            density="compact" maxHeight={false}
            columns={[
              { key: 'where', label: 'Where', render: (r) => where(r) },
              { key: 'req', label: 'Required', render: (r) => Object.values(r.driver_requirements ?? {}).filter((v) => v.need === 'required').length },
              { key: 'block', label: 'Keep offline until approved', render: (r) => Object.values(r.driver_requirements ?? {}).filter((v) => v.blocks_online).length },
              { key: 'age', label: 'Minimum age', render: (r) => r.min_driver_age ?? '—' },
              { key: 'vage', label: 'Oldest vehicle (years)', render: (r) => r.max_vehicle_age_years ?? '—' },
              { key: 'lang', label: 'Languages', render: (r) => (r.languages ?? []).map((l) => LANGS.find((x) => x[0] === l)?.[1] ?? l).join(', ') },
              { key: 'by', label: 'Last set by', hideBelow: 1100, render: (r) => `${r.updated_by || '—'} (v${r.version})` },
              { key: 'edit', label: '', render: (r) => (may ? <button type="button" className="ops-linkbtn" onClick={() => setEditing(r)}>Change…</button> : null) },
            ]} />
        )}
      </section>
      <VehicleCataloguePanel may={may} />
      {editing ? <EditDrawer row={editing} onClose={() => setEditing(null)}
        onDone={(t) => { setEditing(null); setNotice(t); void load(); }} /> : null}
    </>
  );
}

function EditDrawer({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: (text: string) => void }) {
  const [items, setItems] = useState<Items>(() => Object.fromEntries(ITEMS.map(([k]) => [k, row.driver_requirements?.[k] ?? { need: 'off', blocks_online: false }])));
  const [age, setAge] = useState(String(row.min_driver_age ?? ''));
  const [vage, setVage] = useState(String(row.max_vehicle_age_years ?? ''));
  const [langs, setLangs] = useState<string[]>(row.languages ?? ['en']);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const out = await api.put<{ state: string }>(`/pricing/admin/regulation/${row.country}/`, {
        state_code: row.state_code, driver_requirements: items, min_driver_age: age || null,
        max_vehicle_age_years: vage || null, languages: langs, reason,
      });
      onDone(out.state === 'pending_approval' ? 'Sent for approval. A second admin approves it before it applies.' : 'Saved.');
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That could not be sent.');
    } finally { setBusy(false); }
  }

  return (
    <Drawer open wide title={`Driver requirements · ${where(row)}`} onClose={onClose}>
      <form onSubmit={send} className="ops-form">
        <table className="ops-table ops-table--compact">
          <thead><tr><th>Item</th><th>Asked</th><th>Keeps offline until approved</th></tr></thead>
          <tbody>
            {ITEMS.map(([k, label]) => (
              <tr key={k}>
                <td>{label}</td>
                <td>
                  <select aria-label={`${label}: asked`} className="ops-select" value={items[k].need}
                    onChange={(e) => setItems({ ...items, [k]: { need: e.target.value as Need, blocks_online: e.target.value === 'required' && items[k].blocks_online } })}>
                    <option value="required">Required</option><option value="optional">Optional</option><option value="off">Not asked</option>
                  </select>
                </td>
                <td>
                  {items[k].need === 'required' ? (
                    <input type="checkbox" aria-label={`${label}: keeps offline`} checked={items[k].blocks_online}
                      onChange={(e) => setItems({ ...items, [k]: { ...items[k], blocks_online: e.target.checked } })} />
                  ) : <StatusChip tone="info">—</StatusChip>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <label className="form-label" htmlFor="dr-age">Minimum driver age</label>
        <input id="dr-age" className="input" type="number" min={16} max={30} value={age} onChange={(e) => setAge(e.target.value)} />
        <label className="form-label" htmlFor="dr-vage">Oldest vehicle allowed (years)</label>
        <input id="dr-vage" className="input" type="number" min={1} max={40} value={vage} onChange={(e) => setVage(e.target.value)} />
        <fieldset><legend className="form-label">Languages offered</legend>
          {LANGS.map(([code, label]) => (
            <label key={code} className="mr-3"><input type="checkbox" disabled={code === 'en'} checked={langs.includes(code)}
              onChange={(e) => setLangs(e.target.checked ? [...langs, code] : langs.filter((l) => l !== code))} /> {label}</label>
          ))}
        </fieldset>
        <label className="form-label" htmlFor="dr-why">Reason (in the audit log)</label>
        <textarea id="dr-why" className="input" required value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
        <button type="submit" className="btn btn-primary" disabled={busy || !reason.trim()}>Send for approval</button>
      </form>
    </Drawer>
  );
}
