'use client';

import Link from 'next/link';
import { api } from '@/lib/api';
import { POLICY_PAGES } from '@/lib/legal';

/**
 * The text-message consent on every mobile-number step (13 Nov).
 *
 * Codes and trip messages: a consent line, shown before the number is sent, linking to the Text
 * messages policy. Marketing: a separate checkbox, unticked by default; when ticked it is stored on
 * the account with the time and this wording's version (backend `CONSENT_WORDING`; the text here
 * must stay identical to it, and a change means a new version on both sides).
 */
export const SMS_MARKETING = {
  version: 'sms-marketing-v1',
  text: 'Send me offers and news from SaaradhiGo by text message. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
} as const;

export function SmsConsent({
  marketing,
  onMarketing,
  us,
}: {
  marketing: boolean;
  onMarketing: (v: boolean) => void;
  /** A US number: carriers require STOP and HELP to be named on the opt-in. */
  us?: boolean;
}) {
  return (
    <div className="s-consent" data-testid="sms-consent">
      <p className="caption text-ink-subtle">
        We will text you a one-time code, and trip messages you ask for, to this number.
        Msg &amp; data rates may apply.{us ? ' Reply STOP to opt out, HELP for help.' : ''}{' '}
        See our <Link href={POLICY_PAGES.textMessages}>Text messages policy</Link>.
      </p>
      <label className="s-consent__check">
        <input type="checkbox" checked={marketing} onChange={(e) => onMarketing(e.target.checked)} />
        <span>{SMS_MARKETING.text}</span>
      </label>
    </div>
  );
}

/** After sign-in: record a ticked marketing box on the account. Never blocks sign-in. */
export async function saveSmsMarketingConsent(ticked: boolean) {
  if (!ticked) return;
  try {
    await api.put('/notifications/preferences/', {
      channel: 'sms', category: 'promotional', opted_in: true, wording_version: SMS_MARKETING.version,
    });
  } catch {
    /* the account can opt in later in settings; sign-in goes on */
  }
}
