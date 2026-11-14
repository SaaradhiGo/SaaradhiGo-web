'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { type Day, type Period, type Profile, isOnline, profile as loadProfile } from '@/lib/area/driver';
import { chartDay, money } from '@/lib/area/format';
import { LOAD_TIMEOUT_MS, type Load } from '@/lib/area/useLoad';
import { DriverHead } from '../DriverShell';
import { IPower, ISwitch } from '../icons';
import { ProfileMenu } from '../ProfileMenu';
import { useArea } from '../useArea';
import { LoadError, Skel } from '../states';

/**
 * The driver's profile, loaded once per page: ten seconds, then one more try (11 Nov: a request lost
 * in a deploy left the header without its pill); `{}` when it could not be read.
 */
export function useDriver() {
  const [me, setMe] = useState<Profile | null>(null);
  useEffect(() => {
    let live = true;
    const once = () => Promise.race([loadProfile(), new Promise<never>((_, no) => setTimeout(() => no(new Error('timeout')), LOAD_TIMEOUT_MS))]);
    once().catch(() => once()).then((p) => { if (live) setMe(p); }, () => { if (live) setMe({}); });
    return () => { live = false; };
  }, []);
  return me;
}

/** The account items only (14 Nov); Documents and Support are in the sidebar and in More. */
export const DRIVER_MENU = [
  { href: '/driver/profile', label: 'Your profile' },
  { href: '/driver/profile#language', label: 'Language' },
];

/**
 * Every driver page's header: the title, then (10 Nov) the Offline/Online pill, where driving
 * happens (the web takes no ride requests) and the profile button at the far right.
 */
export function DriverTop({ title, sub, me }: { title: string; sub?: string | null; me: Profile | null }) {
  const tr = useTr();
  const { signOut, both, switchTo } = useArea();
  const on = isOnline(me);
  return (
    <DriverHead title={title} sub={sub}>
      {/* On every driver page (11 Nov): a placeholder while loading, never a gap. */}
      {me === null ? <Skel h={36} w={96} /> : (
        <span className={`apill ${on ? 'apill--ok' : 'apill--neu'}`} style={{ height: 36, padding: '0 14px' }} data-testid="status-pill">
          <span className={`adot${on ? ' adot--on' : ''}`} aria-hidden="true" />{tr(on ? 'Online' : me.status ? 'Offline' : 'Status unknown')}
        </span>
      )}
      <span className="abtn abtn--dark dr-go" role="note"><IPower size={18} />
        <span className="dr-go__long">{tr('Go online in the driver app')}</span><span className="dr-go__short">{tr('Go online in the app')}</span>
      </span>
      <ProfileMenu links={DRIVER_MENU} onSignOut={() => signOut()} extra={both && (
        <button type="button" role="menuitem" onClick={() => switchTo('rider')}>
          <ISwitch size={18} />{tr('Switch to rider')}
        </button>
      )} />
    </DriverHead>
  );
}

/** Today / This week / This month. */
export function PeriodChips({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const tr = useTr();
  const label: Record<Period, string> = { today: 'Today', week: 'This week', month: 'This month' };
  return (
    <div className="arow" style={{ gap: 8 }} role="group" aria-label={tr('Period')}>
      {(['today', 'week', 'month'] as const).map((p) => (
        <button key={p} type="button" className={`achip${value === p ? ' achip--on' : ''}`} aria-pressed={value === p}
          onClick={() => onChange(p)}>{tr(label[p])}</button>
      ))}
    </div>
  );
}

/**
 * The last seven days, weekday and date under each bar, amount above it.
 * A driver with no trips yet sees seven empty bars at ₹0.00 (the API answers
 * every day, with zeros); while loading, seven grey bars; on failure, Try again.
 */
export function WeekChart({ load, currency }: { load: Load<Day[]>; currency: string | null }) {
  const { locale } = useLocale();
  const tr = useTr();
  if (load.state === 'error') return <LoadError what="earnings" retry={load.retry} />;
  const days = load.data;
  if (!days) {
    return (
      <div className="dr-chart" aria-busy="true">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i}><Skel h={14} w={48} /><div className="dr-chart__well" /><Skel h={14} w={40} /></div>
        ))}
      </div>
    );
  }
  const top = Math.max(...days.map((d) => Number(d.net)), 0);
  const empty = days.every((d) => d.trips === 0 && Number(d.net) === 0);
  return (
    <div className={`dr-chart${empty ? ' dr-chart--empty' : ''}`} role="img" aria-label={tr('Last 7 days')} data-empty={empty || undefined}>
      {empty && <div className="a14 amut er-empty">{tr('No trips in {period} yet').replace('{period}', tr('the last 7 days'))}</div>}
      {days.map((d, i) => {
        const v = Number(d.net);
        const h = top > 0 ? Math.max(4, Math.round((v / top) * 100)) : 4;
        return (
          <div key={d.date}>
            <span className="a14 ab dr-chart__amt">{money(d.net, currency, locale) ?? ''}</span>
            <div className="dr-chart__well">
              <div className={`dr-chart__bar${i === days.length - 1 ? ' dr-chart__bar--today' : ''}`} style={{ height: h }} />
            </div>
            <span className="a14 amut">{chartDay(d.date, locale)}</span>
          </div>
        );
      })}
    </div>
  );
}
