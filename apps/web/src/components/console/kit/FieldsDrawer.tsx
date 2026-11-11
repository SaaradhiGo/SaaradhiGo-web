'use client';

import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { interpretWrite } from '@/lib/trips';
import { Drawer } from '@/components/console/ui';

/**
 * A settings edit as a drawer of plain fields (MVAG 2025 regulation, state caps, payout scopes,
 * driver records). Blank means "not set here" and is sent as null; the drawer sends only the
 * fields that changed, with a reason, and reports the server's answer in words.
 */
export type FieldSpec = {
  key: string;
  label: string;
  kind: 'text' | 'number' | 'select' | 'bool' | 'date' | 'time';
  options?: Array<{ value: string; label: string }>;
  help?: string;
};
export type FieldValues = Record<string, string>;

export function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return String(v);
}

/** A field's text back to the value the API takes: '' is null, yes/no are booleans. */
export function fromText(spec: FieldSpec, text: string): unknown {
  const t = text.trim();
  if (t === '') return null;
  if (spec.kind === 'bool') return t === 'yes';
  if (spec.kind === 'number') return /^-?\d+$/.test(t) ? Number(t) : t;
  return t;
}

export function changedBody(fields: FieldSpec[], before: FieldValues, after: FieldValues) {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    if ((before[f.key] ?? '') !== (after[f.key] ?? '')) body[f.key] = fromText(f, after[f.key] ?? '');
  }
  return body;
}

export function FieldsDrawer({ title, fields, initial, note, send, onClose, onDone, reasonRequired = true }: {
  title: string;
  fields: FieldSpec[];
  initial: FieldValues;
  note?: string;
  send: (changes: Record<string, unknown>, reason: string) => Promise<unknown>;
  onClose: () => void;
  onDone: (text: string, kind: 'pending' | 'done') => void;
  reasonRequired?: boolean;
}) {
  const [values, setValues] = useState<FieldValues>(initial);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changes = changedBody(fields, initial, values);
  const bad = Object.keys(changes).length === 0 ? 'Nothing differs from the current settings.'
    : reasonRequired && reason.trim().length < 5 ? 'Say why, in a few words.' : null;

  async function submit() {
    if (bad) return;
    setBusy(true); setError(null);
    try {
      const body = await send(changes, reason.trim());
      const result = interpretWrite(body as never, 'Saved.');
      onDone(result.message, result.kind);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open title={title} onClose={onClose}
      footer={(
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy || bad !== null}>
            {busy ? 'Working…' : reasonRequired ? 'Send for approval' : 'Save'}
          </button>
        </>
      )}>
      <div className="ops-form">
        {note ? <p className="help m-0">{note}</p> : null}
        {fields.map((f) => {
          const id = `fd-${f.key}`;
          const v = values[f.key] ?? '';
          const set = (x: string) => setValues((all) => ({ ...all, [f.key]: x }));
          return (
            <div key={f.key} className="ops-form">
              <label className="ops-form__label" htmlFor={id}>{f.label}</label>
              {f.kind === 'select' || f.kind === 'bool' ? (
                <select id={id} className="input" value={v} onChange={(e) => set(e.target.value)}>
                  <option value="">Not set here</option>
                  {(f.kind === 'bool' ? [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] : f.options ?? [])
                    .map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              ) : (
                <input id={id} className="input" value={v}
                  type={f.kind === 'date' ? 'date' : f.kind === 'time' ? 'time' : 'text'}
                  inputMode={f.kind === 'number' ? 'decimal' : undefined}
                  onChange={(e) => set(e.target.value)} />
              )}
              {f.help ? <p className="help m-0">{f.help}</p> : null}
            </div>
          );
        })}
        <label className="ops-form__label" htmlFor="fd-why">Why (kept in the audit log)</label>
        <textarea id="fd-why" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        {bad && (reason || Object.keys(changes).length > 0) ? <p className="help m-0" role="note">{bad}</p> : null}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}
