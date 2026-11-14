'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canReadPlatform, canWritePlatform } from '@/lib/platform';
import { PlatformNav, PlatformNoAccess } from '@/components/console/platform';
import { DataTable, Drawer, ErrorState, PageHeader, Skeleton } from '@/components/console/ui';

/**
 * Configure > Market rules (14 Nov, USA from day 1). The per-state operating rules on
 * MarketRegulation: cash, tips, sales tax, records kept, background re-checks, zero tolerance, the
 * platform's insurance policy and the agent for service of process. Each rule cites the statute it
 * comes from. A state row overrides its country; a change is a request a second admin approves.
 */
type Insurance = { insurer?: string; policy_number?: string; holder?: string; logged_in?: string; on_trip?: string;
  certificate_url?: string; expires?: string };
type Agent = { name?: string; address?: string; phone?: string };
type Row = {
  country: string; state_code: string; version: number; updated_by: string;
  cash_allowed: boolean | null; tips_enabled: boolean | null; tip_presets: number[] | null; sales_tax_enabled: boolean | null;
  vehicle_classes: string[] | null; min_vehicle_year: number | null; vehicle_min_doors: number | null;
  trip_record_retention_days: number | null; driver_record_retention_days: number | null;
  complaint_record_retention_days: number | null; background_recheck_months: number | null;
  zero_tolerance_suspend: boolean | null; platform_insurance_required: boolean | null; fee_plan_required: boolean | null;
  platform_insurance: Insurance | null; service_agent: Agent | null; citations: Record<string, string> | null;
};

const where = (r: Row) => (r.state_code ? `${r.country}-${r.state_code}` : `All of ${r.country}`);
const yn = (v: boolean | null) => (v === null ? 'Not set here' : v ? 'Yes' : 'No');
const BOOLS: [keyof Row, string][] = [
  ['cash_allowed', 'Cash accepted'], ['tips_enabled', 'Tips'], ['sales_tax_enabled', 'Sales tax charged'],
  ['zero_tolerance_suspend', 'Impairment report pauses the driver at once'],
  ['platform_insurance_required', 'Platform insurance needed before drivers go online'],
  ['fee_plan_required', 'Driver fee plan needed before drivers go online'],
];
const NUMS: [keyof Row, string][] = [
  ['trip_record_retention_days', 'Trip records kept (days)'], ['driver_record_retention_days', 'Driver records kept after leaving (days)'],
  ['complaint_record_retention_days', 'Zero tolerance reports kept (days)'], ['background_recheck_months', 'Background re-check every (months)'],
  ['min_vehicle_year', 'Oldest model year'], ['vehicle_min_doors', 'Minimum doors'],
];

export default function MarketRulesPage() {
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
      setRows(got.results);
    } catch (err) {
      setRows([]);
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The market rules could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!canReadPlatform(access)) {
    return (<><PageHeader title="Market rules" /><PlatformNav /><PlatformNoAccess what="Market rules" /></>);
  }
  return (
    <>
      <PageHeader title="Market rules" subtitle="Cash, tips, insurance, records and the statute behind each, per country and state." />
      <PlatformNav />
      {notice && <p className="ops-notice" role="status">{notice}</p>}
      {error && <ErrorState title="The market rules could not be loaded" detail={error} onRetry={load} />}
      {rows === null ? <Skeleton count={4} /> : (
        <DataTable
          caption="Market rules"
          rows={rows}
          rowKey={(r) => `${r.country}-${r.state_code}`}
          columns={[
            { key: 'where', label: 'Market', render: (r) => where(r) },
            { key: 'cash', label: 'Cash', render: (r) => yn(r.cash_allowed) },
            { key: 'tips', label: 'Tips', render: (r) => yn(r.tips_enabled) },
            { key: 'insurance', label: 'Platform insurance', render: (r) => (r.platform_insurance?.policy_number
              ? `${r.platform_insurance.insurer ?? ''} ${r.platform_insurance.policy_number}` : (r.platform_insurance_required ? 'Needed, not set' : '—')) },
            { key: 'agent', label: 'Agent for service', render: (r) => r.service_agent?.name ?? '—' },
            { key: 'records', label: 'Trip records kept', render: (r) => (r.trip_record_retention_days ? `${r.trip_record_retention_days} days` : '—') },
            { key: 'edit', label: '', render: (r) => (may ? <button type="button" className="btn btn-sm" onClick={() => setEditing(r)}>Edit</button> : null) },
          ]}
        />
      )}
      {editing && (
        <RulesDrawer row={editing} onClose={() => setEditing(null)}
          onDone={(m) => { setEditing(null); setNotice(m); void load(); }} />
      )}
    </>
  );
}

function RulesDrawer({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: (m: string) => void }) {
  const [bools, setBools] = useState<Record<string, boolean | null>>(Object.fromEntries(BOOLS.map(([k]) => [k, row[k] as boolean | null])));
  const [nums, setNums] = useState<Record<string, string>>(Object.fromEntries(NUMS.map(([k]) => [k, row[k] == null ? '' : String(row[k])])));
  const [presets, setPresets] = useState((row.tip_presets ?? []).join(', '));
  const [ins, setIns] = useState<Insurance>(row.platform_insurance ?? {});
  const [agent, setAgent] = useState<Agent>(row.service_agent ?? {});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const body: Record<string, unknown> = { state_code: row.state_code, reason };
    for (const [k] of BOOLS) if (bools[k] !== row[k]) body[k] = bools[k];
    for (const [k] of NUMS) if (nums[k] !== (row[k] == null ? '' : String(row[k])) && nums[k] !== '') body[k] = Number(nums[k]);
    const tips = presets.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0);
    if (tips.join() !== (row.tip_presets ?? []).join() && tips.length) body.tip_presets = tips;
    if (JSON.stringify(ins) !== JSON.stringify(row.platform_insurance ?? {})) body.platform_insurance = ins;
    if (JSON.stringify(agent) !== JSON.stringify(row.service_agent ?? {})) body.service_agent = agent;
    try {
      const out = await api.put<{ state: string }>(`/pricing/admin/regulation/${row.country}/`, body);
      onDone(out.state === 'pending_approval' ? 'Sent for approval. A second admin approves it before it applies.' : 'Saved.');
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That could not be sent.');
    } finally { setBusy(false); }
  }
  const cite = (k: string) => row.citations?.[k];
  return (
    <Drawer open wide title={`Market rules · ${where(row)}`} onClose={onClose}>
      <form onSubmit={send} className="ops-form">
        <fieldset className="ops-fieldset">
          <legend>Rules</legend>
          {BOOLS.map(([k, label]) => (
            <label key={k} className="ops-check">
              <input type="checkbox" checked={!!bools[k]} onChange={(e) => setBools({ ...bools, [k]: e.target.checked })} />
              {label}{cite(k) ? <span className="ops-muted"> · {cite(k)}</span> : null}
            </label>
          ))}
          <label className="ops-field">Tip presets (percent, comma separated)
            <input className="input" value={presets} onChange={(e) => setPresets(e.target.value)} placeholder="15, 18, 20" />
          </label>
          {NUMS.map(([k, label]) => (
            <label key={k} className="ops-field">{label}{cite(k) ? <span className="ops-muted"> · {cite(k)}</span> : null}
              <input className="input" inputMode="numeric" value={nums[k]} onChange={(e) => setNums({ ...nums, [k]: e.target.value.replace(/\D/g, '') })} />
            </label>
          ))}
        </fieldset>
        <fieldset className="ops-fieldset">
          <legend>Platform insurance{cite('platform_insurance') ? ` · ${cite('platform_insurance')}` : ''}</legend>
          {([['insurer', 'Insurer'], ['policy_number', 'Policy number'], ['logged_in', 'Logged in, waiting: limits'],
            ['on_trip', 'On a trip: limits'], ['certificate_url', 'Certificate link (shown to drivers)'], ['expires', 'Expires (mm/dd/yyyy)']] as const).map(([k, label]) => (
            <label key={k} className="ops-field">{label}
              <input className="input" value={ins[k] ?? ''} onChange={(e) => setIns({ ...ins, [k]: e.target.value })} />
            </label>
          ))}
          <label className="ops-field">Held by
            <select className="input" value={ins.holder ?? ''} onChange={(e) => setIns({ ...ins, holder: e.target.value })}>
              <option value="">Not set</option><option value="platform">SaaradhiGo (DeepTrics LLC)</option>
              <option value="driver">The driver</option><option value="both">Both</option>
            </select>
          </label>
        </fieldset>
        <fieldset className="ops-fieldset">
          <legend>Agent for service of process{cite('service_agent') ? ` · ${cite('service_agent')}` : ''}</legend>
          {([['name', 'Name'], ['address', 'Address'], ['phone', 'Phone']] as const).map(([k, label]) => (
            <label key={k} className="ops-field">{label}
              <input className="input" value={agent[k] ?? ''} onChange={(e) => setAgent({ ...agent, [k]: e.target.value })} />
            </label>
          ))}
        </fieldset>
        <label className="ops-field">Why (for the approver and the audit log)
          <textarea className="input" required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {error && <p className="ops-error" role="alert">{error}</p>}
        <div className="ops-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || reason.trim().length < 5}>{busy ? 'Sending…' : 'Send for approval'}</button>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </Drawer>
  );
}
