'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Pill, Skeleton } from '@/components/console/ui';
import { FieldsDrawer, toText, type FieldSpec } from '@/components/console/kit/FieldsDrawer';

/**
 * MVAG 2025 driver records (9 Nov): health and term insurance and induction training, checked
 * against the driver's market, and the active vehicle's AIS-140 tracker and panic button.
 * Operations records them here. While the market's gate is off nothing blocks the driver; the
 * panel says which records would.
 */
type Item = {
  key: string; label: string; ok: boolean; problem: 'missing' | 'expired' | 'below_minimum' | null;
  expiry?: string | null; hours?: string | null; minimum_hours?: string | null; has_document: boolean;
};
type Records = Record<string, unknown> & {
  vehicle: Record<string, unknown> | null;
  status: { gate_enabled: boolean; compliant: boolean; blocks_driver: boolean; items: Item[] };
};

const PROBLEM: Record<string, string> = { missing: 'Not recorded', expired: 'Expired', below_minimum: 'Below the required amount' };

const FIELDS: FieldSpec[] = [
  { key: 'health_insurance_policy_number', label: 'Health insurance: policy number', kind: 'text' },
  { key: 'health_insurance_insurer', label: 'Health insurance: insurer', kind: 'text' },
  { key: 'health_insurance_sum_insured_minor', label: 'Health insurance: sum insured (minor units)', kind: 'number' },
  { key: 'health_insurance_expiry', label: 'Health insurance: expiry', kind: 'date' },
  { key: 'term_insurance_policy_number', label: 'Term insurance: policy number', kind: 'text' },
  { key: 'term_insurance_insurer', label: 'Term insurance: insurer', kind: 'text' },
  { key: 'term_insurance_sum_insured_minor', label: 'Term insurance: sum insured (minor units)', kind: 'number' },
  { key: 'term_insurance_expiry', label: 'Term insurance: expiry', kind: 'date' },
  { key: 'induction_training_hours', label: 'Induction training: hours completed', kind: 'number' },
  { key: 'induction_training_date', label: 'Induction training: date', kind: 'date' },
  { key: 'ais140_device_id', label: 'AIS-140 tracker: device ID', kind: 'text' },
  { key: 'ais140_fitted', label: 'AIS-140 tracker fitted', kind: 'bool' },
  { key: 'panic_button_device_id', label: 'Panic button: device ID', kind: 'text' },
  { key: 'panic_button_fitted', label: 'Panic button fitted', kind: 'bool' },
];
const VEHICLE = new Set(['ais140_device_id', 'ais140_fitted', 'panic_button_device_id', 'panic_button_fitted']);

export function DriverRecords({ driverId, may }: { driverId: number; may: boolean }) {
  const [data, setData] = useState<Records | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Records>(`/driver/admin/${driverId}/records/`));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The insurance and training records could not be loaded.');
    }
  }, [driverId]);
  useEffect(() => { void load(); }, [load]);

  const value = (k: string) => (VEHICLE.has(k) ? data?.vehicle?.[k] : data?.[k]);

  return (
    <section className="ops-card" aria-labelledby="dr-records">
      <header className="ops-card__head">
        <div>
          <h2 id="dr-records">Insurance and training (MVAG 2025)</h2>
          {data ? (
            <p>
              {data.status.gate_enabled
                ? (data.status.blocks_driver ? 'The gate is on in this market: these records keep the driver offline.' : 'The gate is on in this market and the driver meets it.')
                : 'The gate is off in this market: nothing here blocks the driver yet.'}
            </p>
          ) : null}
        </div>
        {may && data ? <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setEditing(true)}>Record…</button> : null}
      </header>
      {notice ? <div className="alert-success mb-3" role="status"><b>{notice}</b></div> : null}
      {error ? <div className="alert-error" role="alert">{error}</div> : !data ? <Skeleton kind="row" count={3} /> : (
        <ul className="m-0 p-0 list-none grid gap-2">
          {data.status.items.map((i) => (
            <li key={i.key} className="ops-doc">
              <span className={`ops-doc__tick ${i.ok ? 'is-on' : 'is-off'}`} aria-hidden="true">{i.ok ? '✓' : '!'}</span>
              <span className="ops-doc__text">
                <b>{i.label} <Pill tone={i.ok ? 'good' : 'bad'}>{i.ok ? 'Meets the requirement' : PROBLEM[i.problem ?? 'missing']}</Pill></b>
                <span>
                  {i.expiry ? `Expires ${i.expiry}` : i.hours ? `${i.hours} of ${i.minimum_hours ?? '—'} hours` : 'Nothing recorded'}
                  {i.has_document ? ' · document on file' : ''}
                </span>
              </span>
            </li>
          ))}
          <li className="help">
            Vehicle: AIS-140 tracker {data.vehicle?.ais140_fitted === true ? 'fitted' : data.vehicle?.ais140_fitted === false ? 'not fitted' : 'not recorded'}
            {' · '}panic button {data.vehicle?.panic_button_fitted === true ? 'fitted' : data.vehicle?.panic_button_fitted === false ? 'not fitted' : 'not recorded'}.
          </li>
        </ul>
      )}
      {editing && data ? (
        <FieldsDrawer title="Insurance, training and vehicle devices" fields={FIELDS} reasonRequired={false}
          initial={Object.fromEntries(FIELDS.map((f) => [f.key, toText(value(f.key))]))}
          send={(changes, reason) => api.patch(`/driver/admin/${driverId}/records/`, { ...changes, reason })}
          onClose={() => setEditing(false)}
          onDone={() => { setEditing(false); setNotice('Records saved.'); void load(); }} />
      ) : null}
    </section>
  );
}
