'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/i18n/LocaleProvider';
import { LANGUAGES, LANGUAGE_INFO, type Language } from '@/i18n/locales';
import { useTr } from '@/i18n/website';
import { formatPlate } from '@/lib/booking';
import { type VehicleForm, inReview, onboarding as loadOnboarding, saveVehicle } from '@/lib/area/driver';
import { monthYear } from '@/lib/area/format';
import { changePhone, className, maskPhone, updateName } from '@/lib/area/rider';
import { useLoad } from '@/lib/area/useLoad';
import { messageFor, sendPublicOtp } from '@/lib/publicAuth';
import { IChevron, IDoc, IHelp } from '../icons';
import { Avatar, firstName, useAccount } from '../ProfileMenu';
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

const linkBtn: React.CSSProperties = {
  border: 'none', background: 'none', font: 'inherit', fontWeight: 600, color: 'var(--c-accent)', cursor: 'pointer', padding: 0,
};

/** Name and email (10 Nov); the number changes only with the code texted to the new one. */
function AccountCard() {
  const tr = useTr();
  const { locale } = useLocale();
  const [acct, setAcct] = useAccount();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
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
      const next = await updateName({ full_name: name.trim(), email: email.trim() });
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
          <label className="a14 amut" htmlFor="dp-name">{tr('Full name')}</label>
          <div className="afield"><input id="dp-name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <label className="a14 amut" htmlFor="dp-email">{tr('Email')}</label>
          <div className="afield"><input id="dp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="arow" style={{ gap: 8 }}>
            <button type="submit" className="abtn abtn--dark" disabled={busy}>{tr('Save')}</button>
            <button type="button" className="abtn abtn--ghost" onClick={() => setEditing(false)}>{tr('Cancel')}</button>
          </div>
        </form>
      ) : (
        <>
          <Row label={tr('Full name')} value={acct?.full_name || '—'}>
            <button type="button" style={linkBtn} onClick={() => { setName(acct?.full_name ?? ''); setEmail(acct?.email ?? ''); setEditing(true); }}>
              {tr('Edit')}
            </button>
          </Row>
          <Row label={tr('Email')} value={acct?.email || '—'} />
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

/** "Add vehicle" with none, "Edit" with one; saving sends it to review (10 Nov). */
function VehicleCard() {
  const tr = useTr();
  const info = useLoad(loadOnboarding);
  const o = info.data;
  const v = o?.vehicle ?? null;
  const [form, setForm] = useState<VehicleForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const types = o?.vehicle_types ?? [];
  const me = useDriver();
  const typeOf = me?.active_vehicle_details?.vehicle_type?.type ?? null;

  function open() {
    setErr(null);
    setForm({
      vehicle_type: typeOf ?? types[0]?.type ?? '', brand: v?.brand ?? '', model: v?.model ?? '',
      color: v?.color ?? '', vehicle_number: v?.vehicle_number ?? '',
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true); setErr(null);
    try {
      await saveVehicle(v?.id ?? null, { ...form, vehicle_number: form.vehicle_number.trim().toUpperCase() });
      setForm(null);
      info.retry();
    } catch (e2) {
      setErr(messageFor(e2, tr('We could not save the vehicle. Try again.')));
    } finally { setBusy(false); }
  }

  const set = (k: keyof VehicleForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form!, [k]: e.target.value });

  return (
    <section className="acard" style={{ padding: 20 }}>
      <div className="arow" style={{ justifyContent: 'space-between' }}>
        <h2 className="a20">{tr('Vehicle')}</h2>
        {v && inReview(o) && <span className="apill apill--warn" data-testid="vehicle-in-review">{tr('In review')}</span>}
        {o && !form && (
          <button type="button" className="abtn abtn--ghost a14" style={{ height: 36, padding: '0 14px' }} onClick={open}>
            {tr(v ? 'Edit' : 'Add vehicle')}
          </button>
        )}
      </div>
      {info.state === 'error' && <LoadError what="profile" retry={info.retry} />}
      {info.state === 'loading' && <Skel h={60} style={{ marginTop: 12 }} />}
      {form ? (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
          <label className="a14 amut" htmlFor="dv-type">{tr('Vehicle type')}</label>
          <select id="dv-type" className="achip" value={form.vehicle_type} onChange={set('vehicle_type')} required>
            {types.map((t) => <option key={t.type} value={t.type}>{className(t.type) ?? t.type}</option>)}
          </select>
          <label className="a14 amut" htmlFor="dv-brand">{tr('Make')}</label>
          <div className="afield"><input id="dv-brand" value={form.brand} onChange={set('brand')} required /></div>
          <label className="a14 amut" htmlFor="dv-model">{tr('Model')}</label>
          <div className="afield"><input id="dv-model" value={form.model} onChange={set('model')} required /></div>
          <label className="a14 amut" htmlFor="dv-color">{tr('Colour')}</label>
          <div className="afield"><input id="dv-color" value={form.color} onChange={set('color')} required /></div>
          <label className="a14 amut" htmlFor="dv-plate">{tr('Number plate')}</label>
          <div className="afield"><input id="dv-plate" value={form.vehicle_number} onChange={set('vehicle_number')} required /></div>
          <p className="a14 amut">{tr('Saving sends your vehicle for review. You can go online again once it is approved.')}</p>
          {err && <p className="a14 ared" role="alert">{err}</p>}
          <div className="arow" style={{ gap: 8 }}>
            <button type="submit" className="abtn abtn--dark" disabled={busy}>{tr('Save')}</button>
            <button type="button" className="abtn abtn--ghost" onClick={() => setForm(null)}>{tr('Cancel')}</button>
          </div>
        </form>
      ) : o && (
        v ? (
          <>
            <Row label={tr('Type')} value={className(typeOf) ?? '—'} />
            <Row label={tr('Model')} value={[[v.brand, v.model].filter(Boolean).join(' '), v.color].filter(Boolean).join(', ') || '—'} />
            <Row label={tr('Number plate')} value={v.vehicle_number ? formatPlate(v.vehicle_number) : '—'} />
            <p className="a14 amut" style={{ marginTop: 8 }}>{tr('Changing the vehicle sends it for review again.')}</p>
          </>
        ) : <p className="aempty">{tr('No vehicle yet. Add the one you drive to get approved.')}</p>
      )}
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

  return (
    <>
      <DriverTop title={firstName(acct) || tr('Your profile')} sub={since ? tr('Saaradhi since {date}').replace('{date}', since) : null} me={me} />
      <main className="dr-main">
        <div className="dr-grid3" style={{ alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <AccountCard />
            <section id="language" className="acard" style={{ padding: 20 }}>
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
          </div>
          <VehicleCard />
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
      </main>
    </>
  );
}
