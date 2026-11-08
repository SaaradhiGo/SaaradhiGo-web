'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { LANGUAGES, LANGUAGE_INFO, type Language } from '@/i18n/locales';
import { useTr } from '@/i18n/website';
import { AREA_FLAGS } from '@/lib/area/flags';
import { monthYear } from '@/lib/area/format';
import {
  type Profile, type SavedPlace, deleteAccount, exportData, maskPhone, profile as loadProfile, removePlace, savedPlaces, updateName,
} from '@/lib/area/rider';
import { useLoad } from '@/lib/area/useLoad';
import { ICard, IChevron, IUser } from '../icons';
import { LoadError, Skel } from '../states';
import { useArea } from '../useArea';

function Row({ label, value, children }: { label?: string; value: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="arow" style={{ justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--c-border)' }}>
      <div className="agrow">
        {label && <div className="a14 amut">{label}</div>}
        <div className="ab" style={{ overflowWrap: 'anywhere' }}>{value}</div>
      </div>
      {children}
    </div>
  );
}

const linkBtn = { background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' } as const;

/**
 * /account (rider-web-account.html): profile, saved places, payment,
 * preferences, and privacy. Safety (trusted contacts, auto-share) and trip
 * SMS have no backend yet and stay behind their flags (lib/area/flags.ts).
 */
export function RiderAccount() {
  const tr = useTr();
  const { language, setLanguage, locale } = useLocale();
  const { signOut } = useArea();
  const [me, setMe] = useState<Profile | null>(null);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [dark, setDark] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Each card on its own (8 Nov): profile and saved places load, fail and retry separately.
  const profileLoad = useLoad(loadProfile);
  const placesLoad = useLoad(savedPlaces);
  useEffect(() => {
    const p = profileLoad.data;
    if (p) { setMe(p); setName(p.full_name ?? ''); setEmail(p.email ?? ''); }
  }, [profileLoad.data]);
  useEffect(() => { if (placesLoad.data) setPlaces(placesLoad.data); }, [placesLoad.data]);
  useEffect(() => {
    setDark(document.documentElement.getAttribute('data-theme') === 'dark');
  }, []);

  function theme(next: 'light' | 'dark') {
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('sg-theme', next); } catch { /* private mode */ }
    document.cookie = `sg-theme=${next}; path=/; max-age=31536000; samesite=lax`;
    setDark(next === 'dark');
  }

  async function save() {
    try {
      const p = await updateName({ full_name: name.trim(), email: email.trim() || undefined });
      setMe((m) => ({ ...m, ...p }));
      setEditing(false);
    } catch {
      setNote(tr('We could not save your profile.'));
    }
  }

  async function download() {
    try {
      const data = await exportData();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'saaradhigo-data.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setNote(tr('We could not prepare your data. Try again.'));
    }
  }

  async function remove() {
    try {
      await deleteAccount();
      signOut();
    } catch {
      setNote(tr('We could not delete your account. Contact support.'));
    }
  }

  const since = monthYear(me?.created_at, locale);

  return (
    <div className="ar-page" style={{ maxWidth: 1200 }}>
      <div className="arow" style={{ gap: 16 }}>
        <span className="aico" style={{ width: 64, height: 64, borderRadius: 32, background: 'var(--c-gold-bg)', color: 'var(--c-accent)' }}><IUser size={28} /></span>
        <div>
          <h1 className="a28">{tr('Your account')}</h1>
          {since && <p className="amut">{tr('Rider since {date}').replace('{date}', since)}</p>}
        </div>
      </div>
      {note && <p className="a14 ared" role="status">{note}</p>}
      <div className="dr-grid3">
        <section className="acard" style={{ padding: 20 }}>
          <div className="arow" style={{ justifyContent: 'space-between' }}>
            <h2 className="a20">{tr('Profile')}</h2>
            <button type="button" className="aacc ab a14" style={linkBtn} onClick={() => (editing ? save() : setEditing(true))}>
              {tr(editing ? 'Save' : 'Edit')}
            </button>
          </div>
          {editing ? (
            <div className="acol" style={{ gap: 8, marginTop: 12 }}>
              <label className="a14 amut" htmlFor="nm">{tr('Name')}</label>
              <div className="afield"><input id="nm" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <label className="a14 amut" htmlFor="em">{tr('Email')}</label>
              <div className="afield"><input id="em" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            </div>
          ) : profileLoad.state === 'error' ? (
            <LoadError what="account" retry={profileLoad.retry} />
          ) : profileLoad.state === 'loading' ? (
            <Skel h={20} lines={3} gap={26} style={{ marginTop: 16 }} />
          ) : (
            <>
              <Row label={tr('Name')} value={me?.full_name || '—'} />
              <Row label={tr('Mobile')} value={maskPhone(me?.phone_number) ?? '—'}>
                {me?.phone_number && <span className="apill apill--ok">{tr('Verified')}</span>}
              </Row>
              <Row label={tr('Email')} value={me?.email || '—'} />
            </>
          )}
        </section>

        <section className="acard" style={{ padding: 20 }}>
          <div>
            <h2 className="a20">{tr('Saved places')}</h2>
            <div className="a14 amut">{tr('Used for one-tap booking')}</div>
          </div>
          {placesLoad.state === 'error' && <LoadError what="places" retry={placesLoad.retry} />}
          {placesLoad.state === 'loading' && <Skel h={20} lines={2} gap={26} style={{ marginTop: 16 }} />}
          {placesLoad.state === 'ok' && places.length === 0 && <p className="a14 amut" style={{ marginTop: 12 }}>{tr('Pick a place on the Ride page and tap Add a place.')}</p>}
          {places.map((p) => (
            <Row key={p.id} label={p.label === 'home' ? tr('Home') : p.label === 'work' ? tr('Work') : undefined} value={p.address_text}>
              <button type="button" className="aacc ab a14" style={linkBtn}
                onClick={() => removePlace(p.id).then(() => setPlaces((all) => all.filter((x) => x.id !== p.id))).catch(() => {})}>
                {tr('Remove')}
              </button>
            </Row>
          ))}
        </section>

        <section className="acard" style={{ padding: 20 }}>
          <h2 className="a20">{tr('Payment')}</h2>
          <div className="arow" style={{ marginTop: 12, padding: 14, borderRadius: 12, background: 'var(--c-muted)' }}>
            <span className="aico" style={{ background: 'var(--c-surface)' }}><ICard /></span>
            <div className="agrow">
              <div className="ab">{tr('Cash')}</div>
              <div className="a14 amut">{tr('Pay your driver the locked fare at the end.')}</div>
            </div>
            <span className="apill apill--ok">{tr('Default')}</span>
          </div>
          <p className="a14 amut" style={{ marginTop: 12 }}>{tr('Other ways to pay will appear here when they are available in your city.')}</p>
        </section>

        {(AREA_FLAGS.trustedContacts || AREA_FLAGS.autoShare) && (
          <section className="acard" style={{ padding: 20 }}>
            <h2 className="a20">{tr('Safety')}</h2>
          </section>
        )}

        <section className="acard" style={{ padding: 20 }}>
          <h2 className="a20">{tr('Preferences')}</h2>
          <Row label={tr('Language')} value={LANGUAGE_INFO[language].label}>
            <select aria-label={tr('Language')} className="achip" value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_INFO[l].label}</option>)}
            </select>
          </Row>
          <Row label={tr('Theme')} value={tr(dark ? 'Dark' : 'Light')}>
            <div className="arow" style={{ gap: 4, padding: 4, borderRadius: 10, background: 'var(--c-muted)' }} role="group" aria-label={tr('Theme')}>
              <button type="button" className={dark ? 'a14 ab amut' : 'achip'} style={dark ? { ...linkBtn, padding: '0 12px' } : { height: 32 }}
                aria-pressed={!dark} onClick={() => theme('light')}>{tr('Light')}</button>
              <button type="button" className={dark ? 'achip' : 'a14 ab amut'} style={dark ? { height: 32 } : { ...linkBtn, padding: '0 12px' }}
                aria-pressed={dark} onClick={() => theme('dark')}>{tr('Dark')}</button>
            </div>
          </Row>
        </section>

        <section className="acard" style={{ padding: 20 }}>
          <h2 className="a20">{tr('Privacy and account')}</h2>
          <div style={{ marginTop: 8 }}>
            <Row value={tr('Download your data')}>
              <button type="button" className="aacc ab a14" style={linkBtn} onClick={download}>{tr('Request')}</button>
            </Row>
            <Row value={tr('Sign out')}>
              <button type="button" style={linkBtn} aria-label={tr('Sign out')} onClick={signOut}><IChevron /></button>
            </Row>
            <Row value={<span className="ared">{tr('Delete account')}</span>}>
              {confirming ? (
                <span className="arow" style={{ gap: 8 }}>
                  <button type="button" className="a14 ab" style={linkBtn} onClick={() => setConfirming(false)}>{tr('Keep')}</button>
                  <button type="button" className="a14 ab ared" style={linkBtn} onClick={remove}>{tr('Delete')}</button>
                </span>
              ) : (
                <button type="button" className="a14 amut" style={linkBtn} onClick={() => setConfirming(true)}>{tr('Asks to confirm')}</button>
              )}
            </Row>
          </div>
        </section>
      </div>
    </div>
  );
}
