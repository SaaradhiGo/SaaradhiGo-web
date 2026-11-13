'use client';

import { useEffect, useState } from 'react';
import { useTr } from '@/i18n/website';
import { type AccountClosure, accountClosure, closeAccount } from '@/lib/area/rider';
import { Sheet } from './driver/Sheet';

/**
 * Delete account (13 Nov), the same for riders and drivers and the same as both apps: what is
 * deleted, what we must keep and for how long, any earnings still owed, then a typed confirmation.
 * A driver who is still owed money is "closing": the account closes after the last payout.
 */
export function DeleteAccountSheet({ onClose, onClosed }: { onClose: () => void; onClosed: () => void }) {
  const tr = useTr();
  const [info, setInfo] = useState<AccountClosure | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { accountClosure().then(setInfo).catch(() => setInfo(null)); }, []);

  async function confirm() {
    setBusy(true);
    setNote(null);
    try {
      const r = await closeAccount();
      if (r.status === 'closed') { onClosed(); return; }
      setNote(r.message ?? tr('Your account closes after your earnings are paid.'));
      setInfo(await accountClosure());
    } catch {
      setNote(tr('We could not delete your account. Contact support.'));
    } finally {
      setBusy(false);
    }
  }

  const owed = info?.pending_payouts;
  return (
    <Sheet label={tr('Delete account')} onClose={onClose} testid="delete-account">
      <h2 className="a20">{tr('Delete your account')}</h2>
      {info?.closure ? (
        <p className="a14" role="status" style={{ marginTop: 8 }}>{tr('Closing: waiting for your earnings to be paid.')}</p>
      ) : (
        <>
          <h3 className="a14 ab" style={{ marginTop: 12 }}>{tr('What we delete')}</h3>
          <ul className="a14 amut" style={{ paddingLeft: 18, margin: '4px 0' }}>{(info?.deleted ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
          <h3 className="a14 ab" style={{ marginTop: 12 }}>{tr('What we must keep')}</h3>
          <ul className="a14 amut" style={{ paddingLeft: 18, margin: '4px 0' }}>{(info?.kept ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
          {owed && (
            <p className="a14" style={{ marginTop: 12 }} data-testid="owed">
              {tr('You are still owed {amount}. Your account closes after it is paid; until then you stay signed in and cannot go online.')
                .replace('{amount}', `${owed.currency} ${owed.balance}`)}
            </p>
          )}
          <label className="acol a14" style={{ gap: 4, marginTop: 12 }}>
            {tr('Type DELETE to confirm')}
            <input className="achip" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </label>
          <div className="arow" style={{ gap: 8, marginTop: 12 }}>
            <button type="button" className="abtn abtn--ghost" onClick={onClose}>{tr('Keep my account')}</button>
            <button type="button" className="abtn abtn--pri" disabled={typed.trim() !== 'DELETE' || busy} onClick={confirm}>
              {tr('Delete account')}
            </button>
          </div>
        </>
      )}
      {note && <p className="a14" role="status" style={{ marginTop: 12 }}>{note}</p>}
    </Sheet>
  );
}
