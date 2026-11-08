'use client';

import Link from 'next/link';
import { useLocale } from '@/i18n/LocaleProvider';
import { LANGUAGES, LANGUAGE_INFO, type Language } from '@/i18n/locales';
import { useTr } from '@/i18n/website';
import { formatPlate } from '@/lib/booking';
import { monthYear } from '@/lib/area/format';
import { className, maskPhone, profile as loadAccount } from '@/lib/area/rider';
import { useLoad } from '@/lib/area/useLoad';
import { IChevron, IDoc, IHelp, IUser } from '../icons';
import { LoadError, Skel } from '../states';
import { useArea } from '../useArea';
import { DriverTop, useDriver } from './parts';

function Row({ label, value, children }: { label: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="arow" style={{ justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--c-border)' }}>
      <div className="agrow"><div className="a14 amut">{label}</div><div className="ab">{value}</div></div>
      {children}
    </div>
  );
}

/**
 * /driver/profile (driver-web-profile.html): who the driver is, their rating
 * over their trips, language, the active vehicle, and the ways to support.
 */
export function DriverProfile() {
  const tr = useTr();
  const { language, setLanguage, locale } = useLocale();
  const { signOut, both, switchTo } = useArea();
  const me = useDriver();
  const account = useLoad(loadAccount);
  const acct = account.data;

  const v = me?.active_vehicle_details ?? null;
  const since = monthYear(acct?.created_at, locale);
  const rating = me?.ratings != null && Number(me.ratings) > 0 ? Number(me.ratings).toFixed(1) : null;

  return (
    <>
      <DriverTop title={tr('Your profile')} me={me} />
      <main className="dr-main">
        <div className="dr-grid3" style={{ alignItems: 'start' }}>
          <section className="acard" style={{ padding: 20 }}>
            <div className="arow" style={{ marginBottom: 12 }}>
              <span className="aico" style={{ width: 56, height: 56, borderRadius: 28, background: 'var(--c-gold-bg)', color: 'var(--c-accent)' }}><IUser /></span>
              <div>
                {account.state === 'loading' ? <Skel h={22} w={160} /> : <h2 className="a20">{acct?.full_name || '—'}</h2>}
                {since && <div className="a14 amut">{tr('Saaradhi since {date}').replace('{date}', since)}</div>}
              </div>
            </div>
            {account.state === 'error' && <LoadError what="profile" retry={account.retry} />}
            <Row label={tr('Mobile')} value={maskPhone(acct?.phone_number) ?? '—'}>
              {acct?.phone_number && <span className="apill apill--ok">{tr('Verified')}</span>}
            </Row>
            <Row label={tr('Rating')} value={
              rating ? tr('{r} from {n} trips').replace('{r}', rating).replace('{n}', `${me?.total_trips ?? 0}`)
                : tr('{n} trips').replace('{n}', `${me?.total_trips ?? 0}`)
            } />
            <Row label={tr('Language')} value={LANGUAGE_INFO[language].label}>
              <select aria-label={tr('Language')} className="achip" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_INFO[l].label}</option>)}
              </select>
            </Row>
          </section>
          <section className="acard" style={{ padding: 20 }}>
            <h2 className="a20">{tr('Vehicle')}</h2>
            <Row label={tr('Type')} value={className(v?.vehicle_type?.type) ?? '—'} />
            <Row label={tr('Model')} value={[[v?.brand, v?.model].filter(Boolean).join(' '), v?.color].filter(Boolean).join(', ') || '—'} />
            <Row label={tr('Number plate')} value={v?.vehicle_number ? formatPlate(v.vehicle_number) : '—'} />
            <p className="a14 amut" style={{ marginTop: 8 }}>{tr('Changing the vehicle sends it for review again.')}</p>
          </section>
          <section className="acard" style={{ padding: 20 }}>
            <h2 className="a20">{tr('Support')}</h2>
            <Link href="/driver/support" className="arow" style={{ padding: '12px 0', borderTop: '1px solid var(--c-border)', textDecoration: 'none', marginTop: 8 }}>
              <span className="aico"><IHelp /></span>
              <span className="agrow"><span className="ab" style={{ display: 'block' }}>{tr('Contact driver support')}</span><span className="a14 amut">{tr('In your language')}</span></span>
            </Link>
            <Link href="/driver/documents" className="arow" style={{ padding: '12px 0', borderTop: '1px solid var(--c-border)', textDecoration: 'none' }}>
              <span className="aico"><IDoc /></span>
              <span className="agrow"><span className="ab" style={{ display: 'block' }}>{tr('Documents')}</span><span className="a14 amut">{tr('Licence, registration, insurance')}</span></span>
            </Link>
            {both && (
              <button type="button" className="arow" onClick={() => switchTo('rider')}
                style={{ width: '100%', padding: '12px 0', border: 'none', borderTop: '1px solid var(--c-border)', background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
                <span className="ab agrow">{tr('Switch to rider')}</span><IChevron />
              </button>
            )}
            <button type="button" className="arow" onClick={signOut}
              style={{ width: '100%', padding: '12px 0', border: 'none', borderTop: '1px solid var(--c-border)', background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
              <span className="ab agrow">{tr('Sign out')}</span><IChevron />
            </button>
          </section>
        </div>
      </main>
    </>
  );
}
