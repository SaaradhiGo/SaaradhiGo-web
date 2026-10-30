'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { stamp } from '@/lib/consoleTime';
import {
  CONFIG_FIELDS, configPatch, configValue, emergencyLine, type ConfigPage, type ConfigRow,
} from '@/lib/safety';
import {
  Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * Safety settings: the per-country timers, thresholds and emergency numbers.
 *
 * Everyone who answers an SOS can READ them; only `safety.config` (Super
 * Admin by default) can change them. A change writes a new VERSION: the old
 * one is kept with who changed it and why, so "what was the limit on the
 * night" is a lookup. A blank means "off", never "use a default": a country
 * with no configuration has no timer and no detection, and says so here.
 */
function EditDrawer({ row, limits, onClose, onDone }: {
  row: ConfigRow; limits: Record<string, [number, number]>;
  onClose: () => void; onDone: (message: string) => void;
}) {
  const current = row.active;
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(
    CONFIG_FIELDS.map(({ key }) => [key, current?.[key] === null || current?.[key] === undefined ? '' : String(current[key])])));
  const [numbers, setNumbers] = useState(() => (current?.emergency_numbers ?? row.registry_numbers)
    .map((n) => ({ ...n })));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const { patch, invalid } = configPatch(draft, current);
    if (invalid.length) { setError(`These need whole numbers: ${invalid.join(', ')}.`); return; }
    const numbersChanged = JSON.stringify(numbers) !== JSON.stringify(current?.emergency_numbers ?? []);
    if (Object.keys(patch).length === 0 && !numbersChanged) { setError('Nothing has changed.'); return; }
    setBusy(true);
    setError(null);
    try {
      await api.post(`/safety/admin/config/${row.country}/`, {
        ...patch, ...(numbersChanged ? { emergency_numbers: numbers } : {}), reason: reason.trim(),
      });
      onDone(`${row.name}: saved as a new version.`);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open wide
      title={`${row.configured ? 'Edit' : 'Set up'} safety settings · ${row.name}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || reason.trim() === ''} onClick={() => void submit()}>
            {busy ? 'Working…' : 'Save as a new version'}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        <div className="ops-confirm">
          <b>{row.name}</b>
          <span>Saved as version {(current?.version ?? 0) + 1}. The current version is kept. Leave a field blank to turn that rule off.</span>
        </div>
        {CONFIG_FIELDS.map(({ key, label, unit, hint }) => {
          const range = limits[key];
          return (
            <div key={key} className="ops-form__row">
              <label className="ops-form__label" htmlFor={`cfg-${key}`}>{label}</label>
              <input
                id={`cfg-${key}`} className="ops-select" inputMode="numeric" size={8} value={draft[key]}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                aria-describedby={`cfg-${key}-hint`}
              />
              <span className="muted">{unit}</span>
              <span id={`cfg-${key}-hint`} className="ops-config__hint">
                {hint}{range ? ` (${range[0]} to ${range[1]})` : ''}
              </span>
            </div>
          );
        })}
        <div className="ops-filterset">
          <fieldset>
            <legend>Emergency numbers</legend>
            {numbers.map((n, i) => (
              <div key={i} className="ops-form__row">
                <label className="sr-only" htmlFor={`num-label-${i}`}>Label {i + 1}</label>
                <input id={`num-label-${i}`} className="ops-select" value={n.label} size={14}
                  onChange={(e) => setNumbers(numbers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <label className="sr-only" htmlFor={`num-number-${i}`}>Number {i + 1}</label>
                <input id={`num-number-${i}`} className="ops-select" value={n.number} size={14} inputMode="tel"
                  onChange={(e) => setNumbers(numbers.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} />
                <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setNumbers(numbers.filter((_, j) => j !== i))}>Remove</button>
              </div>
            ))}
            <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={numbers.length >= 8}
              onClick={() => setNumbers([...numbers, { label: '', number: '' }])}>Add a number</button>
          </fieldset>
        </div>
        <label className="ops-form__label" htmlFor="cfg-reason">Reason (required)</label>
        <textarea id="cfg-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}

export default function SafetyConfigPage() {
  const [page, setPage] = useState<ConfigPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ConfigRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPage(await api.get<ConfigPage>('/safety/admin/config/'));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the safety settings.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHeader
        title="Safety settings"
        subtitle={<><Link href="/safety-ops">Safety</Link> · timers, detection thresholds and emergency numbers, one set per country</>}
      />
      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}

      {!page && !error ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the safety settings</span>
          <Skeleton kind="block" count={2} />
        </div>
      ) : error && !page ? (
        <ErrorState title="The safety settings could not be loaded" detail={error} onRetry={() => void load()} />
      ) : page && page.results.length === 0 ? (
        <Panel><Empty title="No country in your scope" detail="Safety settings are per country." /></Panel>
      ) : page ? (
        <div className="ops-config">
          {!page.can_edit && <p className="help" role="note">You can read these. Changing them needs the safety.config permission.</p>}
          {page.results.map((row) => (
            <Panel
              key={row.country}
              title={`${row.name} (${row.country})`}
              action={page.can_edit ? (
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setEditing(row)}>
                  {row.configured ? 'Edit' : 'Set up'}
                </button>
              ) : undefined}
            >
              {!row.configured || !row.active ? (
                <Empty
                  title={`Not configured for ${row.name}`}
                  detail="No SOS timer, no detection and no emergency numbers apply here until it is set up. Nothing is borrowed from another country."
                />
              ) : (
                <>
                  <p className="help">
                    Version {row.active.version}, in force since {stamp(row.active.valid_from)}
                    {row.active.created_by.label ? ` · set by ${row.active.created_by.label}` : ''}.
                    {row.active.reason ? ` ${row.active.reason}` : ''}
                  </p>
                  <table className="ops-config__table">
                    <caption className="sr-only">{row.name} safety settings</caption>
                    <thead><tr><th scope="col">Setting</th><th scope="col">Value</th></tr></thead>
                    <tbody>
                      {CONFIG_FIELDS.map(({ key, label, unit, hint }) => (
                        <tr key={key}>
                          <td>{label}<span className="ops-config__hint">{hint}</span></td>
                          <td className="num">
                            {key === 'min_safety_officers' && row.active?.[key] == null
                              ? 'Not configured' : configValue(row.active?.[key], unit)}
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td>Emergency numbers</td>
                        <td>{emergencyLine({ country: row.country, configured: row.active.emergency_numbers.length > 0, numbers: row.active.emergency_numbers })}</td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
              {row.history.length > 1 && (
                <>
                  <h3 className="ops-subhead">History</h3>
                  <ol className="ops-history__list" aria-label={`${row.name} version history`}>
                    {row.history.map((h) => (
                      <li key={h.id} className="ops-history__item">
                        <span>
                          <b>Version {h.version}</b>{' '}{h.is_active ? <Pill tone="good">In force</Pill> : null}
                          <span className="ops-config__hint">{stamp(h.valid_from)} · {h.created_by.label || 'system'} · {h.reason}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </Panel>
          ))}
        </div>
      ) : null}

      {editing && page && (
        <EditDrawer
          row={editing} limits={page.limits} onClose={() => setEditing(null)}
          onDone={(m) => { setEditing(null); setNotice(m); void load(); }}
        />
      )}
    </>
  );
}
