'use client';

import { useEffect, useState } from 'react';
import { useTr } from '@/i18n/website';
import { ApiError } from '@/lib/api';
import { profile, requestEmailConfirmation } from '@/lib/area/rider';

export type ResendState = 'idle' | 'busy' | 'sent' | 'unsent' | 'failed';

/** Ask for the confirmation link again; 'unsent' when the server could not send any mail. */
export async function resendConfirmation(): Promise<ResendState> {
  try {
    await requestEmailConfirmation();
    return 'sent';
  } catch (e) {
    return e instanceof ApiError && e.code === 'EMAIL_NOT_SENT' ? 'unsent' : 'failed';
  }
}

/** The line under a Resend button, or null. */
export function resendNote(state: ResendState, tr: (s: string) => string): string | null {
  if (state === 'sent') return tr('Sent. Check your inbox.');
  if (state === 'unsent') return tr('We could not send the email right now. Try again later.');
  if (state === 'failed') return tr('Something went wrong. Try again.');
  return null;
}

/**
 * "Confirm your email" (11 Nov; 12 Nov: shown until the address is confirmed, also where no mail
 * can be sent, and it never says a link was sent when none was). It blocks nothing.
 */
export function ConfirmEmail() {
  const tr = useTr();
  const [email, setEmail] = useState<string | null>(null);
  const [mailOk, setMailOk] = useState(true);
  const [state, setState] = useState<ResendState>('idle');

  useEffect(() => {
    let live = true;
    profile().then((p) => {
      if (!live || p.email_verified !== false || !p.email) return;
      setEmail(p.email);
      setMailOk(p.email_mail_configured !== false);
    }).catch(() => {});
    return () => { live = false; };
  }, []);

  if (!email) return null;
  async function again() {
    setState('busy');
    setState(await resendConfirmation());
  }
  const note = resendNote(state, tr);
  return (
    <div className="ar-note a14" role="status" data-testid="confirm-email">
      <span>
        {(mailOk ? tr('Confirm your email. We sent a link to {email}.') : tr('Confirm your email: {email}.'))
          .replace('{email}', email)}
      </span>
      {note ? <span className={state === 'sent' ? 'amut' : 'ared'}>{note}</span> : null}
      {state !== 'sent' && (
        <button type="button" className="a14 ab aacc" onClick={again} disabled={state === 'busy'}
          style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit', textDecoration: 'underline' }}>
          {tr(mailOk ? 'Send again' : 'Send link')}
        </button>
      )}
    </div>
  );
}
