'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { type Day, type Period, type Profile, isOnline, profile as loadProfile } from '@/lib/area/driver';
import { chartDay, money } from '@/lib/area/format';
import type { Load } from '@/lib/area/useLoad';
import { DriverHead } from '../DriverShell';
import { IPower } from '../icons';
import { LoadError, Skel } from '../states';

/** The driver's profile, loaded once per page; `{}` when it could not be read (the header just omits the pill). */
export function useDriver() {
  const [me, setMe] = useState<Profile | null>(null);
  useEffect(() => { loadProfile().then(setMe).catch(() => setMe({})); }, []);
  return me;
}

/**
 * Every driver page's header: the title, whether dispatch shows the driver
 * online, and where driving happens. The web takes no ride requests.
 */
export function DriverTop({ title, me }: { title: string; me: Profile | null }) {
  const tr = useTr();
  const on = isOnline(me);
  return (
    <DriverHead title={title}>
      {me && (
        <span className={`apill ${on ? 'apill--ok' : 'apill--neu'}`} style={{ height: 36, padding: '0 14px' }}>
          <span className={`adot${on ? ' adot--on' : ''}`} aria-hidden="true" />{tr(on ? 'Online' : 'Offline')}
        </span>
      )}
      <span className="abtn abtn--dark" role="note"><IPower size={18} />{tr('Go online in the driver app')}</span>
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
  return (
    <div className="dr-chart" role="img" aria-label={tr('Last 7 days')}>
      {days.map((d, i) => {
        const v = Number(d.net);
        const h = top > 0 ? Math.max(4, Math.round((v / top) * 100)) : 4;
        return (
          <div key={d.date}>
            <span className="a14 ab">{money(d.net, currency, locale) ?? ''}</span>
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
