'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { marketDate } from '@/lib/consoleTime';
import { RecordSection } from '@/components/console/kit/ListBits';

type Person = { role: 'primary' | 'backup' | 'head'; name: string; phone: string };
type Rota = {
  city: { code: string; name: string };
  people: Person[];
  complete: boolean;
  updated_at: string | null;
  updated_by: string | null;
  can_edit: boolean;
};

const ROLE_LABEL: Record<Person['role'], string> = { primary: 'Primary', backup: 'Backup', head: 'City head' };

/**
 * Who is on call for SOS, per city (12 Nov). An SOS nobody acknowledges is phoned to the primary
 * after the country's acknowledgement time, then the backup, then the city head, round after round
 * until someone acknowledges it (servers/safety/oncall.py). Every page shows on the incident timeline.
 */
export function OnCallRota() {
  const [rows, setRows] = useState<Rota[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRows((await api.get<{ results: Rota[] }>('/safety/admin/oncall/')).results);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The on-call rota could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function start(row: Rota) {
    const d: Record<string, string> = {};
    for (const p of row.people) { d[`${p.role}_name`] = p.name; d[`${p.role}_phone`] = ''; }
    setDraft(d); setReason(''); setSaveError(null); setEditing(row.city.code);
  }

  async function save(code: string) {
    setBusy(true); setSaveError(null);
    const body: Record<string, string> = { reason };
    for (const [k, v] of Object.entries(draft)) if (!k.endsWith('_phone') || v.trim()) body[k] = v.trim();
    try {
      await api.post(`/safety/admin/oncall/${code}/`, body);
      setEditing(null);
      await load();
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'The rota could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="alert-error" role="alert">{error}</p>;
  if (!rows) return null;
  return (
    <>
      {rows.map((row) => (
        <RecordSection
          key={row.city.code}
          title={`On call for SOS · ${row.city.name}`}
          action={row.can_edit && editing !== row.city.code ? (
            <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => start(row)}>
              {row.complete ? 'Edit' : 'Set up'}
            </button>
          ) : undefined}
        >
          <p className="help">
            An SOS nobody acknowledges is phoned to the primary, then the backup, then the city head, and again,
            until someone acknowledges it. An SMS goes when a call cannot be placed.
            {row.updated_at ? ` Last changed ${marketDate(row.updated_at)}${row.updated_by ? ` by ${row.updated_by}` : ''}.` : ''}
          </p>
          {!row.complete && editing !== row.city.code && (
            <p className="alert-error" role="note">Not complete: an SOS here can not reach everyone in the chain.</p>
          )}
          {editing === row.city.code ? (
            <div className="ops-form">
              {row.people.map((p) => (
                <div key={p.role} className="ops-form__row">
                  <label className="ops-form__label" htmlFor={`oc-${p.role}-name`}>{ROLE_LABEL[p.role]}</label>
                  <input id={`oc-${p.role}-name`} className="ops-select" value={draft[`${p.role}_name`] ?? ''} size={16}
                    placeholder="Name" onChange={(e) => setDraft({ ...draft, [`${p.role}_name`]: e.target.value })} />
                  <label className="sr-only" htmlFor={`oc-${p.role}-phone`}>{ROLE_LABEL[p.role]} phone</label>
                  <input id={`oc-${p.role}-phone`} className="ops-select" value={draft[`${p.role}_phone`] ?? ''} size={14}
                    inputMode="tel" placeholder={p.phone ? `Keep ${p.phone}` : 'Phone number'}
                    onChange={(e) => setDraft({ ...draft, [`${p.role}_phone`]: e.target.value })} />
                </div>
              ))}
              <label className="ops-form__label" htmlFor={`oc-${row.city.code}-reason`}>Reason (required)</label>
              <textarea id={`oc-${row.city.code}-reason`} className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              {saveError && <div className="alert-error" role="alert">{saveError}</div>}
              <div className="ops-form__row">
                <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setEditing(null)} disabled={busy}>Back</button>
                <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || !reason.trim()} onClick={() => void save(row.city.code)}>
                  {busy ? 'Saving…' : 'Save the rota'}
                </button>
              </div>
            </div>
          ) : (
            <table className="ops-config__table" data-testid={`oncall-${row.city.code}`}>
              <caption className="sr-only">On call in {row.city.name}</caption>
              <thead><tr><th scope="col">Order</th><th scope="col">Name</th><th scope="col">Phone</th></tr></thead>
              <tbody>
                {row.people.map((p) => (
                  <tr key={p.role}><td>{ROLE_LABEL[p.role]}</td><td>{p.name || 'Not set'}</td><td>{p.phone || 'Not set'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </RecordSection>
      ))}
    </>
  );
}
