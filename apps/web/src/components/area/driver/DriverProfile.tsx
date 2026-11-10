'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/i18n/LocaleProvider';
import { LANGUAGES, LANGUAGE_INFO, type Language } from '@/i18n/locales';
import { useTr } from '@/i18n/website';
import { monthYear } from '@/lib/area/format';
import { changePhone, maskPhone, updateName } from '@/lib/area/rider';
import { messageFor, sendPublicOtp } from '@/lib/publicAuth';
import { IChevron, IDoc, IHelp } from '../icons';
import { Avatar, firstName, useAccount } from '../ProfileMenu';
import { LoadError, Skel } from '../states';
import { IdentitySection } from './profile/IdentitySection';
import { PayoutsSection } from './profile/PayoutsSection';
import { ContactsSection, PersonalSection } from './profile/PersonalSection';
import { ReqContext, useRequirementsLoad } from './profile/shared';
import { VehicleSection } from './profile/VehicleSection';
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

const linkBtn: React.CSSProperties = {
  border: 'none', background: 'none', font: 'inherit', fontWeight: 600, color: 'var(--c-accent)', cursor: 'pointer', padding: 0,
};

/** Name and email (10 Nov); the number changes only with the code texted to the new one. */
function AccountCard() {
  const tr = useTr();
  const { locale } = useLocale();
  const [acct, setAcct] = useAccount();
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [phoneStep, setPhoneStep] = useState<'off' | 'number' | 'code'>('off');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const since = monthYear(acct?.created_at, locale);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try {
      const next = await updateName({ email: email.trim() });
      setAcct({ ...acct, ...next });
      setEditing(false);
      setNote({ ok: true, text: tr('Saved.') });
    } catch (err) {
      setNote({ ok: false, text: messageFor(err, tr('We could not save that. Try again.')) });
    } finally { setBusy(false); }
  }

  async function phoneNext(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setNote(null);
    try {
      if (phoneStep === 'number') {
        await sendPublicOtp(phone, 'driver');
        setPhoneStep('code');
      } else {
        const next = await changePhone(phone, code);
        setAcct({ ...acct, ...next });
        setPhoneStep('off'); setPhone(''); setCode('');
        setNote({ ok: true, text: tr('Your mobile number is changed.') });
      }
    } catch (err) {
      setNote({ ok: false, text: messageFor(err, tr('We could not verify that number. Try again.')) });
    } finally { setBusy(false); }
  }

  return (
    <section className="acard" style={{ padding: 20 }}>
      <div className="arow" style={{ marginBottom: 12 }}>
        <Avatar me={acct} size={56} />
        <div>
          {acct === null ? <Skel h={22} w={160} /> : <h2 className="a20">{acct.full_name || '—'}</h2>}
          {since && <div className="a14 amut">{tr('Saaradhi since {date}').replace('{date}', since)}</div>}
        </div>
      </div>
      {editing ? (
        <form onSubmit={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label className="a14 amut" htmlFor="dp-email">{tr('Email')}</label>
          <div className="afield"><input id="dp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="arow" style={{ gap: 8 }}>
            <button type="submit" className="abtn abtn--dark" disabled={busy}>{tr('Save')}</button>
            <button type="button" className="abtn abtn--ghost" onClick={() => setEditing(false)}>{tr('Cancel')}</button>
          </div>
        </form>
      ) : (
        <>
          <Row label={tr('Email')} value={acct?.email || '—'}>
            <button type="button" style={linkBtn} onClick={() => { setEmail(acct?.email ?? ''); setEditing(true); }}>
              {tr('Edit')}
            </button>
          </Row>
        </>
      )}
      <Row label={tr('Mobile')} value={maskPhone(acct?.phone_number) ?? '—'}>
        {phoneStep === 'off' && (
          <button type="button" style={linkBtn} onClick={() => { setNote(null); setPhoneStep('number'); }}>{tr('Change')}</button>
        )}
      </Row>
      {phoneStep !== 'off' && (
        <form onSubmit={phoneNext} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {phoneStep === 'number' ? (
            <>
              <label className="a14 amut" htmlFor="dp-phone">{tr('New mobile number, with country code')}</label>
              <div className="afield"><input id="dp-phone" type="tel" placeholder="+91" value={phone} onChange={(e) => setPhone(e.target.value)} required /></div>
            </>
          ) : (
            <>
              <label className="a14 amut" htmlFor="dp-code">{tr('The 6-digit code we texted to {phone}').replace('{phone}', phone)}</label>
              <div className="afield"><input id="dp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required /></div>
            </>
          )}
          <div className="arow" style={{ gap: 8 }}>
            <button type="submit" className="abtn abtn--dark" disabled={busy}>{tr(phoneStep === 'number' ? 'Send code' : 'Verify and change')}</button>
            <button type="button" className="abtn abtn--ghost" onClick={() => setPhoneStep('off')}>{tr('Cancel')}</button>
          </div>
        </form>
      )}
      {note && <p className={`a14 ${note.ok ? 'agreen' : 'ared'}`} role="status" style={{ marginTop: 8 }}>{note.text}</p>}
    </section>
  );
}

/**
 * /driver/profile (driver-web-profile.html): who the driver is, with their name as the title
 * (10 Nov), editable name, email and number, language, the vehicle, and support.
 */
export function DriverProfile() {
  const tr = useTr();
  const { language, setLanguage, locale } = useLocale();
  const { signOut, both, switchTo } = useArea();
  const me = useDriver();
  const [acct] = useAccount();
  const since = monthYear(acct?.created_at, locale);
  const rating = me?.ratings != null && Number(me.ratings) > 0 ? Number(me.ratings).toFixed(1) : null;
  const req = useRequirementsLoad();
  // Only the market's languages (10 Nov): India en/te/hi, USA en/es.
  const offered = LANGUAGES.filter((l) => (acct?.market_languages ?? LANGUAGES).includes(l));

  return (
    <>
      <DriverTop title={firstName(acct) || tr('Your profile')} sub={since ? tr('Saaradhi since {date}').replace('{date}', since) : null} me={me} />
      <main className="dr-main">
        <ReqContext.Provider value={req}>
          {req.state === 'error' && <LoadError what="profile" retry={req.retry} />}
          <div className="dr-grid2" style={{ alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <PersonalSection />
              <ContactsSection />
              <IdentitySection />
              <VehicleSection />
              <Suspense fallback={null}><PayoutsSection /></Suspense>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <AccountCard />
              <section id="language" className="acard" style={{ padding: 20 }}>
                <Row label={tr('Rating')} value={
                  rating ? tr('{r} from {n} trips').replace('{r}', rating).replace('{n}', `${me?.total_trips ?? 0}`)
                    : tr('{n} trips').replace('{n}', `${me?.total_trips ?? 0}`)
                } />
                <Row label={tr('Language')} value={LANGUAGE_INFO[language].label}>
                  <select aria-label={tr('Language')} className="achip" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                    {offered.map((l) => <option key={l} value={l}>{LANGUAGE_INFO[l].label}</option>)}
                  </select>
                </Row>
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
            <button type="button" className="arow" onClick={() => signOut()}
              style={{ width: '100%', padding: '12px 0', border: 'none', borderTop: '1px solid var(--c-border)', background: 'none', font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'left' }}>
              <span className="ab agrow">{tr('Sign out')}</span><IChevron />
            </button>
          </section>
            </div>
          </div>
        </ReqContext.Provider>
      </main>
    </>
  );
}
