'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { areaPost } from '@/lib/area/api';
import { establishServerSession, readRiderToken, sessionRoles, switchRole, type PublicRole } from '@/lib/publicAuth';
import { useTr } from '@/i18n/website';

/**
 * The role gate (owner, 13 Nov: one person, one account, two roles).
 *
 * The middleware serves this, at the URL the visitor asked for, when a page belongs to the
 * role they are not using right now (lib/session/routing.ts). It never moves them silently:
 *
 *   holds the role       -> "This page is for riding/driving", Switch to riding/driving
 *   driver, no rider row -> "Ride with your SaaradhiGo account": adds the rider role to the
 *                           same account (POST /auth/me/ride/), then continues to the page
 *   rider, no driver row -> "You don't drive with SaaradhiGo yet", Apply to drive
 */
type State = { role: PublicRole; roles: PublicRole[] } | null | 'loading';

export function safeNext(next: string | null, need: PublicRole) {
  const home = need === 'driver' ? '/driver' : '/ride/choose';
  if (!next || !next.startsWith('/') || next.startsWith('//')) return home;
  return next;
}

export function RoleGate() {
  const tr = useTr();
  const router = useRouter();
  const params = useSearchParams();
  const need: PublicRole = params.get('need') === 'driver' ? 'driver' : 'rider';
  const next = safeNext(params.get('next'), need);
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { sessionRoles().then((s) => setState(s ?? null)); }, []);

  async function go() {
    router.replace(next);
    router.refresh();
  }

  async function switchNow() {
    setBusy(true); setError(null);
    if (await switchRole(need)) return go();
    setBusy(false); setError(tr('That did not work. Try again.'));
  }

  async function rideWithThisAccount() {
    setBusy(true); setError(null);
    try {
      await areaPost('/auth/me/ride/', {});
      const token = readRiderToken();
      if (token && (await establishServerSession(token, 'rider'))) return go();
    } catch { /* shown below */ }
    setBusy(false); setError(tr('That did not work. Try again.'));
  }

  if (state === 'loading') return <section className="s-wrap s-page" aria-busy="true" />;

  const holds = state !== null && state.roles.includes(need);
  const backHref = state?.role === 'driver' ? '/driver' : '/ride';
  const back = state?.role === 'driver' ? tr('Back to driver home') : tr('Back to booking');

  let title: string; let body: string; let action: React.ReactNode;
  if (state === null) {
    title = need === 'driver' ? tr('Sign in to drive') : tr('Sign in to ride');
    body = tr('This page needs you to be signed in.');
    action = (
      <Link className="s-btn s-btn--primary s-btn--lg" href={`${need === 'driver' ? '/driver/sign-in' : '/sign-in'}?next=${encodeURIComponent(next)}`}>
        {tr('Sign in')}
      </Link>
    );
  } else if (holds) {
    title = need === 'driver' ? tr('This page is for driving') : tr('This page is for riding');
    body = need === 'driver'
      ? tr('You are using SaaradhiGo as a rider right now. Switch to driving to open it. Nothing about your rides changes.')
      : tr('You are using SaaradhiGo as a driver right now. Switch to riding to open it. Nothing about your driving changes.');
    action = (
      <button type="button" className="s-btn s-btn--primary s-btn--lg" onClick={switchNow} disabled={busy} data-testid="gate-switch">
        {need === 'driver' ? tr('Switch to driving') : tr('Switch to riding')}
      </button>
    );
  } else if (need === 'rider') {
    title = tr('Ride with your SaaradhiGo account');
    body = tr('Book rides with the account you drive with: same name, same mobile number, no new sign-up. Your driving is not affected.');
    action = (
      <button type="button" className="s-btn s-btn--primary s-btn--lg" onClick={rideWithThisAccount} disabled={busy} data-testid="gate-add-rider">
        {tr('Ride with this account')}
      </button>
    );
  } else {
    title = tr("You don't drive with SaaradhiGo yet");
    body = tr('Driver pages need a driver account. See what you need and how to apply.');
    action = <Link className="s-btn s-btn--primary s-btn--lg" href="/drive">{tr('Apply to drive')}</Link>;
  }

  return (
    <section className="s-wrap s-page s-gate" data-testid="role-gate" data-need={need}>
      <div className="t-label">{need === 'driver' ? tr('Driving') : tr('Riding')}</div>
      <h1 className="t-heading">{title}</h1>
      <p className="s-gate__body">{body}</p>
      {error && <p className="s-gate__error" role="alert">{error}</p>}
      <div className="s-actions">
        {action}
        {state !== null && <Link className="s-btn s-btn--outline s-btn--lg" href={backHref}>{back}</Link>}
      </div>
    </section>
  );
}
