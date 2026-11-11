'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { LANGUAGES, LANGUAGE_INFO, type Language } from '@/i18n/locales';
import { useTr } from '@/i18n/website';
import { vehicles as loadVehicles } from '@/lib/area/driver';
import { dateOrder, monthYear, numericDate } from '@/lib/area/format';
import {
  type ItemStatus, type StepKey, type StepStatus, STATUS_LABEL, setupHref, worst,
} from '@/lib/area/requirements';
import { maskPhone } from '@/lib/area/rider';
import { documentRows, isApproved, readyToDrive, spacedPhone, stepState, stepWords } from '@/lib/area/setupChecks';
import { useLoad } from '@/lib/area/useLoad';
import { formatPlate } from '@/lib/booking';
import { IBank, ICar, IDoc, IHelp, IPhone, IUser } from '../icons';
import { firstName, useAccount } from '../ProfileMenu';
import { LoadError, Skel } from '../states';
import { useArea } from '../useArea';
import { DriverTop, useDriver } from './parts';
import { item, useRequirementsLoad } from './profile/shared';
import type { Car } from './setup/steps';

const TONE: Record<StepStatus, string> = { done: 'apill--ok', in_review: 'apill--warn', todo: 'apill--neu', action: 'apill--err' };
const VERIFY: Record<string, string> = {
  verified: 'Name matches the account', pending: 'Verification pending', pending_config: 'Verification pending (config)',
  failed: 'Could not be verified',
};

function Card({ id, icon, title, state, step, rows, href, open = false }: {
  id: string; icon: React.ReactNode; title: string; state: StepStatus | null; step?: StepKey; rows: [string, React.ReactNode][];
  href: string; open?: boolean;
}) {
  const tr = useTr();
  return (
    <section className="acard pf-card" id={id} data-testid={`card-${id}`}>
      <div className="arow" style={{ justifyContent: 'space-between', marginBottom: 8, alignItems: 'flex-start' }}>
        <div className="arow" style={{ gap: 10 }}><span className="aico">{icon}</span><h2 className="a20">{title}</h2></div>
        {state && <span className={`apill ${TONE[state]}`} data-state={state}>{tr(stepWords(state, step))}</span>}
      </div>
      {rows.map(([label, value]) => (
        <div key={label} className="pf-row"><span className="a14 amut">{label}</span><span className="a14 ab">{value || '—'}</span></div>
      ))}
      <Link href={href} className="aacc ab a14 pf-go">{tr(open ? 'Open' : 'Edit')} →</Link>
    </section>
  );
}

/** Language and theme, edited in place. */
function PrefsCard() {
  const tr = useTr();
  const { language, setLanguage } = useLocale();
  const { both, switchTo } = useArea();
  const [acct] = useAccount();
  const [editing, setEditing] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => setDark(document.documentElement.getAttribute('data-theme') === 'dark'), []);
  // Only the market's languages (10 Nov): India en/te/hi, USA en/es.
  const offered = LANGUAGES.filter((l) => (acct?.market_languages ?? LANGUAGES).includes(l));
  function theme(next: 'light' | 'dark') {
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('sg-theme', next); } catch { /* private mode */ }
    document.cookie = `sg-theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setDark(next === 'dark');
  }
  return (
    <section className="acard pf-card" id="language" data-testid="card-preferences">
      <div className="arow" style={{ gap: 10, marginBottom: 8 }}><span className="aico"><IHelp /></span><h2 className="a20">{tr('Language and preferences')}</h2></div>
      <div className="pf-row"><span className="a14 amut">{tr('Language')}</span>
        {editing ? (
          <select aria-label={tr('Language')} className="achip" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
            {offered.map((l) => <option key={l} value={l}>{LANGUAGE_INFO[l].label}</option>)}
          </select>
        ) : <span className="a14 ab">{LANGUAGE_INFO[language].label}</span>}
      </div>
      <div className="pf-row"><span className="a14 amut">{tr('Theme')}</span>
        {editing ? (
          <div className="arow" style={{ gap: 4 }} role="group" aria-label={tr('Theme')}>
            <button type="button" className={`achip${dark ? '' : ' achip--on'}`} aria-pressed={!dark} onClick={() => theme('light')}>{tr('Light')}</button>
            <button type="button" className={`achip${dark ? ' achip--on' : ''}`} aria-pressed={dark} onClick={() => theme('dark')}>{tr('Dark')}</button>
          </div>
        ) : <span className="a14 ab">{tr(dark ? 'Dark' : 'Light')}</span>}
      </div>
      {editing && both && (
        <button type="button" className="su-link a14" style={{ marginTop: 12, textAlign: 'left' }} onClick={() => switchTo('rider')}>{tr('Switch to rider')}</button>
      )}
      <button type="button" className="su-link a14 pf-go" onClick={() => setEditing(!editing)}>{tr(editing ? 'Done' : 'Edit')} {editing ? '' : '→'}</button>
    </section>
  );
}

/**
 * /driver/profile (driver-v2-profile): who the driver is and six section cards matching the
 * setup steps, each with its key details (masked where sensitive), its state and Edit or Open,
 * which opens that setup step with a way back here.
 */
export function DriverProfile() {
  const tr = useTr();
  const { locale } = useLocale();
  const me = useDriver();
  const [acct] = useAccount();
  const req = useRequirementsLoad();
  const cars = useLoad(loadVehicles);
  const data = req.data;
  const car = (cars.data?.[0] ?? null) as Car | null;
  const since = monthYear(acct?.created_at, locale);
  const order = dateOrder(data?.config.country ?? acct?.market_country);
  const rating = me?.ratings != null && Number(me.ratings) > 0 ? Number(me.ratings).toFixed(1) : null;
  const trips = Number(me?.total_trips ?? 0);
  const approved = readyToDrive(data);
  const held = !!data?.checklist.approved && !approved;
  const p = data?.personal;
  const id = data?.identity;
  const pm = data?.payout_method;
  const photo = p?.photo ?? null;
  const vehicleFiles = documentRows(data).filter((f) => f.vehicle);
  const label = (s: ItemStatus | undefined) => (s ? tr(STATUS_LABEL[s]) : null);
  const edit = (k: StepKey) => setupHref(k, 'profile');
  const contactRel = (code: string) => tr(data?.relationships.find((r) => r.code === code)?.label ?? code).toLowerCase();

  return (
    <>
      <DriverTop title={firstName(acct) || tr('Your profile')} sub={since ? tr('Saaradhi since {date}').replace('{date}', since) : null} me={me} />
      <main className="dr-main">
        {req.state === 'error' && <LoadError what="profile" retry={req.retry} />}
        <section className="acard pf-head" data-testid="profile-summary">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo ? <img src={photo} alt="" className="pf-face" /> : <span className="pf-face" aria-hidden="true"><IUser size={32} /></span>}
          <div className="agrow">
            {acct === null ? <Skel h={28} w={220} /> : <h2 className="a28">{acct.full_name || '—'}</h2>}
            <div className="arow a14 amut pf-meta">
              <span>{maskPhone(acct?.phone_number) ?? ''}</span><span aria-hidden="true">·</span>
              <span>{rating ? tr('{r} rating from {n} trips').replace('{r}', rating).replace('{n}', String(trips)) : tr('{n} trips').replace('{n}', String(trips))}</span>
              {p?.home_city && <><span aria-hidden="true">·</span><span>{p.home_city}</span></>}
            </div>
          </div>
          {data && (
            <span className={`apill ${approved ? 'apill--ok' : held ? 'apill--err' : 'apill--warn'} pf-status`} data-testid="profile-status">
              {tr(approved ? 'Approved to drive' : held ? 'Offline until fixed' : 'Setup in progress')}
            </span>
          )}
        </section>
        {!data && req.state !== 'error' && <Skel h={260} />}
        {data && p && id && pm && (
          <div className="pf-grid">
            <Card id="personal" icon={<IUser />} title={tr('Personal details')} state={stepState(data, 'personal')} href={edit('personal')} rows={[
              [tr('Date of birth'), numericDate(p.dob, order)],
              [tr('Email'), acct?.email ?? ''],
              [tr('Address'), p.address ? `${[p.address.line2 || p.address.line1, p.address.city].filter(Boolean).join(', ')} ${p.address.postal_code}` : ''],
            ]} />
            <Card id="contacts" icon={<IPhone />} title={tr('Emergency contacts')} state={stepState(data, 'contact')} step="contact" href={edit('contact')}
              rows={p.emergency_contacts.length ? p.emergency_contacts.map((c) => [`${c.name} (${contactRel(c.relationship)})`, spacedPhone(c.phone_number)]) : [[tr('Contact'), '']]} />
            <Card id="identity" icon={<IDoc />} title={tr('Licence and identity')} state={stepState(data, 'identity')} href={edit('identity')} open rows={[
              [tr('Licence'), id.license_expiry ? tr('Valid until {d}').replace('{d}', numericDate(id.license_expiry, order)) : ''],
              ...(item(data, 'aadhaar') ? [[tr('Aadhaar'), id.aadhaar_masked ? `•••• ${id.aadhaar_masked.slice(-4)}` : '']] as [string, string][] : []),
              ...(item(data, 'pan') ? [[tr('PAN'), id.pan_masked ?? '']] as [string, string][] : []),
              ...(item(data, 'police_verification') ? [[tr('Police verification'), label(item(data, 'police_verification')?.status)]] as [string, string | null][] : []),
              ...(item(data, 'background_check') ? [[tr('Background check'), label(item(data, 'background_check')?.status)]] as [string, string | null][] : []),
            ]} />
            <Card id="vehicle" icon={<ICar />} title={tr('Vehicle')} state={stepState(data, 'vehicle', 'vehicle_docs')} href={edit(car ? 'vehicle_docs' : 'vehicle')} open rows={[
              [tr('Vehicle'), car ? [car.brand, car.model, car.year].filter(Boolean).join(' ') : ''],
              [tr('Colour'), car?.color ? tr(car.color) : ''],
              [tr('Number plate'), car?.vehicle_number ? formatPlate(car.vehicle_number) : ''],
              [tr('Photos and papers'), car ? tr('{a} of {n} approved').replace('{a}', String(vehicleFiles.filter((f) => isApproved(f.status)).length)).replace('{n}', String(vehicleFiles.length)) : ''],
            ]} />
            <Card id="payouts" icon={<IBank />} title={tr('Bank and payouts')} state={stepState(data, 'payouts')} href={edit('payouts')} rows={
              pm.kind === 'stripe' || data.config.country === 'US' ? [[tr('Paid through'), 'Stripe'], [tr('Status'), tr(pm.stripe_status === 'ready' ? 'Ready' : pm.stripe_status === 'in_progress' ? 'In progress' : 'Not started')]]
                : [
                  [tr('Paid to'), pm.bank ? `${pm.bank.bank_name} ${pm.bank.account_masked}` : pm.upi_masked ? `UPI ${pm.upi_masked}` : ''],
                  [tr('Verified'), pm.bank ? tr(VERIFY[pm.bank.verification_status] ?? pm.bank.verification_status) : label(worst([item(data, 'payout_method')?.status ?? 'missing']))],
                  ...(pm.held_until ? [[tr('Payouts paused until'), new Date(pm.held_until).toLocaleString(locale)]] as [string, string][] : []),
                ]} />
            <PrefsCard />
          </div>
        )}
      </main>
    </>
  );
}
