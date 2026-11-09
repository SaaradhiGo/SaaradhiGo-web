'use client';

import { useEffect, useState } from 'react';
import { useTr } from '@/i18n/website';
import { ApiError } from '@/lib/api';
import {
  type Contact, type SavedPlace, addContact, deletePlace, removeContact, savedPlaces, setAutoShare,
  sharingSettings, trustedContacts,
} from '@/lib/area/rider';
import { useLoad } from '@/lib/area/useLoad';
import { IBriefcase, IHome, IPlus, IUser } from '../icons';
import { LoadError, Skel } from '../states';
import { PlaceSheet } from './PlaceSheet';

const linkBtn = { background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' } as const;
const rowStyle = { justifyContent: 'space-between', padding: '12px 0', borderTop: '1px solid var(--c-border)', gap: 12 } as const;

/** Account > Saved places (9 Nov): the list as designed, with Add, Edit and Delete (Delete asks). */
export function SavedPlacesCard() {
  const tr = useTr();
  const load = useLoad(savedPlaces);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [sheet, setSheet] = useState<{ place: SavedPlace | null } | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (load.data) setPlaces(load.data); }, [load.data]);

  function saved(p: SavedPlace) {
    setPlaces((all) => {
      const rest = all.filter((x) => x.id !== p.id);
      const order = { home: 0, work: 1, other: 2 } as const;
      return [...rest, p].sort((a, b) => order[a.label ?? 'other'] - order[b.label ?? 'other']);
    });
    setSheet(null);
  }

  async function remove(id: number) {
    try {
      await deletePlace(id);
      setPlaces((all) => all.filter((x) => x.id !== id));
      setConfirm(null);
    } catch {
      setNote(tr('We could not delete that place. Try again.'));
    }
  }

  const title = (p: SavedPlace) => (p.label === 'home' ? tr('Home') : p.label === 'work' ? tr('Work') : p.name || p.address_text.split(',')[0]);

  return (
    <section className="acard" style={{ padding: 20 }}>
      <div className="arow" style={{ justifyContent: 'space-between' }}>
        <div>
          <h2 className="a20">{tr('Saved places')}</h2>
          <div className="a14 amut">{tr('Used for one-tap booking')}</div>
        </div>
        {load.state === 'ok' && (
          <button type="button" className="aacc ab a14 arow" style={{ ...linkBtn, gap: 4, whiteSpace: 'nowrap' }}
            onClick={() => setSheet({ place: null })}>
            <IPlus size={16} />{tr('Add')}
          </button>
        )}
      </div>
      {load.state === 'error' && <LoadError what="places" retry={load.retry} />}
      {load.state === 'loading' && <Skel h={20} lines={2} gap={26} style={{ marginTop: 16 }} />}
      {load.state === 'ok' && places.length === 0 && (
        <p className="a14 amut" style={{ marginTop: 12 }}>{tr('No saved places yet. Add Home and Work for one-tap booking.')}</p>
      )}
      {note && <p className="a14 ared" role="status">{note}</p>}
      {places.map((p) => (
        <div key={p.id} className="arow" style={rowStyle}>
          <span className="aico">{p.label === 'work' ? <IBriefcase size={18} /> : <IHome size={18} />}</span>
          <div className="agrow" style={{ minWidth: 0 }}>
            <div className="ab">{title(p)}</div>
            <div className="a14 amut" style={{ overflowWrap: 'anywhere' }}>{p.address_text}</div>
            {p.notice && <div className="a14" style={{ color: 'var(--c-warn-ink)' }}>{tr(p.notice)}</div>}
          </div>
          {confirm === p.id ? (
            <span className="arow" style={{ gap: 10 }}>
              <button type="button" className="a14 ab" style={linkBtn} onClick={() => setConfirm(null)}>{tr('Keep')}</button>
              <button type="button" className="a14 ab ared" style={linkBtn} onClick={() => remove(p.id)}>{tr('Delete')}</button>
            </span>
          ) : (
            <span className="arow" style={{ gap: 12 }}>
              <button type="button" className="aacc ab a14" style={linkBtn} onClick={() => setSheet({ place: p })}>{tr('Edit')}</button>
              <button type="button" className="a14 amut" style={linkBtn} onClick={() => setConfirm(p.id)}>{tr('Delete')}</button>
            </span>
          )}
        </div>
      ))}
      {sheet && <PlaceSheet place={sheet.place} onClose={() => setSheet(null)} onSaved={saved} />}
    </section>
  );
}

/** Account > Safety (9 Nov): trusted contacts, Add and Remove, and "Share every trip automatically". */
export function SafetyCard() {
  const tr = useTr();
  const load = useLoad(trustedContacts);
  const prefs = useLoad(sharingSettings);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [auto, setAuto] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const max = load.data?.max ?? 5;
  useEffect(() => { if (load.data) setContacts(load.data.contacts); }, [load.data]);
  useEffect(() => { if (prefs.data) setAuto(prefs.data.auto_share); }, [prefs.data]);

  async function add() {
    if (!name.trim() || !phone.trim()) { setNote(tr('Enter a name and a mobile number.')); return; }
    setBusy(true);
    setNote(null);
    try {
      const c = await addContact({ name: name.trim(), phone: phone.trim() });
      setContacts((all) => [...all, c]);
      setAdding(false); setName(''); setPhone('');
    } catch (e) {
      setNote(e instanceof ApiError && e.fromServer ? tr(e.message) : tr('We could not add that contact. Try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    try {
      await removeContact(id);
      setContacts((all) => all.filter((c) => c.id !== id));
      setConfirm(null);
    } catch {
      setNote(tr('We could not remove that contact. Try again.'));
    }
  }

  async function toggle() {
    const next = !auto;
    setAuto(next);
    try { setAuto((await setAutoShare(next)).auto_share); } catch { setAuto(!next); setNote(tr('We could not change that setting. Try again.')); }
  }

  return (
    <section className="acard" style={{ padding: 20 }}>
      <h2 className="a20">{tr('Safety')}</h2>
      <div className="arow" style={{ ...rowStyle, marginTop: 8 }}>
        <div>
          <div className="ab">{tr('Trusted contacts')}</div>
          <div className="a14 amut">{tr('They get your trip link and SOS alerts')}</div>
        </div>
        {load.state === 'ok' && contacts.length < max && !adding && (
          <button type="button" className="aacc ab a14" style={linkBtn} onClick={() => setAdding(true)}>{tr('Add')}</button>
        )}
      </div>
      {load.state === 'error' && <LoadError what="contacts" retry={load.retry} />}
      {load.state === 'loading' && <Skel h={20} lines={2} gap={26} />}
      {load.state === 'ok' && contacts.length === 0 && !adding && (
        <p className="a14 amut">{tr('No trusted contacts yet. Add up to five people.')}</p>
      )}
      {contacts.map((c) => (
        <div key={c.id} className="arow" style={rowStyle}>
          <span className="aico"><IUser size={18} /></span>
          <div className="agrow" style={{ minWidth: 0 }}>
            <div className="ab">{c.name}</div>
            <div className="a14 amut">{c.phone}{c.opted_out ? ` · ${tr('Opted out of messages')}` : ''}</div>
          </div>
          {confirm === c.id ? (
            <span className="arow" style={{ gap: 10 }}>
              <button type="button" className="a14 ab" style={linkBtn} onClick={() => setConfirm(null)}>{tr('Keep')}</button>
              <button type="button" className="a14 ab ared" style={linkBtn} onClick={() => remove(c.id)}>{tr('Remove')}</button>
            </span>
          ) : (
            <button type="button" className="a14 amut" style={linkBtn} onClick={() => setConfirm(c.id)}>{tr('Remove')}</button>
          )}
        </div>
      ))}
      {adding && (
        <div className="acol" style={{ gap: 8, paddingTop: 12, borderTop: '1px solid var(--c-border)' }}>
          <label className="a14 amut" htmlFor="tc-name">{tr('Name')}</label>
          <div className="afield"><input id="tc-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></div>
          <label className="a14 amut" htmlFor="tc-phone">{tr('Mobile number')}</label>
          <div className="afield"><input id="tc-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <p className="a14 amut">{tr('They get one text saying you added them. They can reply STOP.')}</p>
          <div className="arow" style={{ gap: 8 }}>
            <button type="button" className="abtn abtn--ghost" onClick={() => { setAdding(false); setNote(null); }}>{tr('Cancel')}</button>
            <button type="button" className="abtn abtn--pri agrow" disabled={busy} onClick={add}>{busy ? tr('Saving…') : tr('Add contact')}</button>
          </div>
        </div>
      )}
      {note && <p className="a14 ared" role="status">{note}</p>}
      <div className="arow" style={rowStyle}>
        <div>
          <div className="ab">{tr('Share every trip automatically')}</div>
          <div className="a14 amut">{tr('With your trusted contacts')}</div>
        </div>
        <button type="button" role="switch" className="aswitch" aria-checked={auto} aria-label={tr('Share every trip automatically')}
          disabled={prefs.state !== 'ok'} onClick={toggle} />
      </div>
      <p className="a14 amut" style={{ marginTop: 8 }}>{tr('Your contacts only see this trip, and only until 30 minutes after it ends.')}</p>
    </section>
  );
}
