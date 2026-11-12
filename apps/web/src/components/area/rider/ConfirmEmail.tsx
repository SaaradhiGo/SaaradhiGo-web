'use client';

import { useEffect, useState } from 'react';
import { useTr } from '@/i18n/website';
import { profile, requestEmailConfirmation } from '@/lib/area/rider';

/**
 * "Confirm your email" (11 Nov): a small reminder until the rider opens the confirmation link.
 * It blocks nothing; the account already works.
 */
export function ConfirmEmail() {
  const tr = useTr();
  const [email, setEmail] = useState<string | null>(null);
  const [sent, setSent] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');

  useEffect(() => {
    let live = true;
    profile().then((p) => { if (live && p.email_verified === false && p.email) setEmail(p.email); }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!email) return null;
  async function again() {
    setSent('busy');
    try { await requestEmailConfirmation(); setSent('sent'); } catch { setSent('failed'); }
  }
  return (
    <div className="ar-note a14" role="status" data-testid="confirm-email">
      <span>{tr('Confirm your email. We sent a link to {email}.').replace('{email}', email)}</span>
      {sent === 'sent' ? <span className="amut">{tr('Sent again.')}</span> : (
        <button type="button" className="a14 ab aacc" onClick={again} disabled={sent === 'busy'}
          style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
          {sent === 'failed' ? tr('Try again') : tr('Send again')}
        </button>
      )}
    </div>
  );
}
