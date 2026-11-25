'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { interpretWrite } from '@/lib/trips';
import { Drawer } from '@/components/console/ui';
import { ChangePreview } from '@/components/console/edit/ChangePreview';

/**
 * Switch a provider between live, test and off (owner ruling, 25 Nov). Keys stay in the environment
 * and are never shown; live also needs them there and the environment's live switch. A second person
 * who holds platform settings approves.
 */
export const MODE_CHOICES: Array<[string, string]> = [
  ['live', 'Live'], ['test', 'Test (nobody receives it)'], ['off', 'Off (nothing is sent)'],
];
const NOW_WORDS: Record<string, string> = { live: 'Live', test: 'Test (nobody receives it)', off: 'Off (nothing is sent)' };

export function ProviderModeDrawer({ row, onClose, onDone }: {
  row: { type: string; label: string; country: string; console_mode?: string | null };
  onClose: () => void; onDone: (t: string) => void;
}) {
  const [mode, setMode] = useState(row.console_mode ?? 'test');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = mode !== (row.console_mode ?? null);
  async function send() {
    setBusy(true); setError(null);
    try {
      const r = await api.post('/platform/admin/integrations/mode/', { type: row.type, country: row.country, mode, reason: reason.trim() });
      onDone(interpretWrite(r as never, 'Sent for approval.').message);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally { setBusy(false); }
  }
  return (
    <Drawer open title={`Mode · ${row.label} · ${row.country}`} onClose={onClose}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()}
          disabled={busy || !changed || reason.trim().length < 5}>{busy ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      <div className="ops-form">
        <p className="help m-0">Keys stay in the server environment and are never shown here. Live also needs them there.</p>
        <div className={changed ? 'ops-field is-changed' : 'ops-field'}>
          <label className="ops-form__label" htmlFor="pm-mode">Mode</label>
          <select id="pm-mode" className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODE_CHOICES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {changed ? <ChangePreview display={{ changes: [{ label: `${row.label} in ${row.country}`,
          from: row.console_mode ? NOW_WORDS[row.console_mode] : 'Set by the environment', to: NOW_WORDS[mode] }],
          effective: 'From approval.' }} /> : null}
        <label className="ops-form__label" htmlFor="pm-why">Why (the approver and the history see it)</label>
        <textarea id="pm-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}
