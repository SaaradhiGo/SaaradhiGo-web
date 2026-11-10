'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Panel } from '@/components/console/ui';
import { type ChipTone, StatusChip } from '@/components/console/kit/StatusChip';

/**
 * The market's checklist for one driver (10 Nov), and the two decisions that are not files: a
 * changed legal name, and an India bank account checked by hand while RazorpayX is not set up.
 * Each file (photo, Aadhaar, PAN, police verification, address proof, vehicle photos) is reviewed
 * in the document list below, with a reason the driver reads.
 */
export type Requirements = {
  done: number; total: number; blocking: string[];
  items: { key: string; label: string; status: string; reason: string | null; blocks_online: boolean; need: string; expires: string | null }[];
  name_pending: string | null;
  bank: { bank_name: string; account_last4: string; ifsc: string; holder_name: string; verification_status: string } | null;
  police_verification_status: string; background_check_status: string;
};

const TONE: Record<string, ChipTone> = {
  approved: 'good', done: 'good', expiring: 'caution', in_review: 'info', missing: 'caution', rejected: 'critical',
};

export function RequirementsPanel({ driverId, req, may, onDone }: { driverId: number; req: Requirements; may: boolean; onDone: (text: string) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(key: 'legal_name' | 'payout_method', decision: 'approve' | 'reject') {
    setBusy(true); setError(null);
    try {
      await api.post(`/driver/admin/${driverId}/documents/review/`, { document_key: key, decision, reason: decision === 'reject' ? reason.trim() : '' });
      setReason('');
      onDone(`${key === 'legal_name' ? 'Name change' : 'Bank account'} ${decision === 'approve' ? 'approved' : 'rejected'}.`);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally { setBusy(false); }
  }

  const decisionRow = (key: 'legal_name' | 'payout_method', text: string) => (
    <div className="grid gap-2" style={{ borderTop: '1px solid var(--ops-border, #e5e5e5)', paddingTop: 8 }}>
      <div>{text}</div>
      {may ? (
        <div className="flex gap-2 flex-wrap items-center">
          <button type="button" className="sg-btn sg-btn--sm" disabled={busy} onClick={() => void decide(key, 'approve')}>Approve</button>
          <input aria-label="Reason the driver reads" className="input" placeholder="Reason, if you reject" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy || !reason.trim()} onClick={() => void decide(key, 'reject')}>Reject</button>
        </div>
      ) : null}
    </div>
  );

  return (
    <Panel title={`Requirements · ${req.done} of ${req.total} done`}>
      <div className="grid gap-2" data-testid="console-requirements">
        {req.items.map((i) => (
          <div key={i.key} className="flex justify-between gap-2 flex-wrap">
            <span>{i.label}{i.need === 'optional' ? <span className="muted"> · optional</span> : null}{i.blocks_online ? <span className="muted"> · keeps offline</span> : null}</span>
            <span>
              <StatusChip tone={TONE[i.status] ?? 'info'}>{i.status === 'expiring' && i.expires ? `Expiring ${i.expires}` : i.status.replace('_', ' ')}</StatusChip>
              {i.reason ? <span className="muted"> {i.reason}</span> : null}
            </span>
          </div>
        ))}
        {req.name_pending ? decisionRow('legal_name', `Name change waiting: "${req.name_pending}". Check it against the licence.`) : null}
        {req.bank && req.bank.verification_status !== 'verified'
          ? decisionRow('payout_method', `Bank account ${req.bank.bank_name} ••${req.bank.account_last4} (${req.bank.ifsc}) for ${req.bank.holder_name}: ${req.bank.verification_status.replace('_', ' ')}.`)
          : null}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Panel>
  );
}
