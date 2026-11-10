'use client';

import { useEffect, useRef, useState } from 'react';
import { useTr } from '@/i18n/website';
import { type Address, type Contact, savePersonal, uploadFile } from '@/lib/area/requirements';
import { Field, IMAGE_ACCEPT, MAX_PHOTO_BYTES, Reason, Section, asked, item, useReq, useSaver } from './shared';

/** A centred square, 800 px, as JPEG: what riders see (10 Nov). */
export async function squarePhoto(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Choose a JPEG or PNG photo.');
  if (file.size > MAX_PHOTO_BYTES) throw new Error('Choose a photo under 5 MB.');
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(side, 800);
  canvas.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side,
    0, 0, canvas.width, canvas.height);
  const blob: Blob = await new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('crop'))), 'image/jpeg', 0.9));
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}

const EMPTY: Address = { line1: '', line2: '', city: '', state_code: '', postal_code: '' };

function AddressForm({ prefix, value, onChange, states, country }: {
  prefix: string; value: Address; onChange: (a: Address) => void; states: { code: string; name: string }[]; country: string;
}) {
  const tr = useTr();
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Field id={`${prefix}-l1`} label={tr('Address line 1')}><div className="afield"><input id={`${prefix}-l1`} value={value.line1} onChange={set('line1')} required /></div></Field>
      <Field id={`${prefix}-l2`} label={tr('Address line 2 (optional)')}><div className="afield"><input id={`${prefix}-l2`} value={value.line2} onChange={set('line2')} /></div></Field>
      <Field id={`${prefix}-city`} label={tr('City')}><div className="afield"><input id={`${prefix}-city`} value={value.city} onChange={set('city')} required /></div></Field>
      <Field id={`${prefix}-state`} label={tr(country === 'US' ? 'State' : 'State or union territory')}>
        <select id={`${prefix}-state`} className="achip" value={value.state_code} onChange={set('state_code')} required>
          <option value="">{tr('Choose')}</option>
          {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      </Field>
      <Field id={`${prefix}-pin`} label={tr(country === 'US' ? 'ZIP code' : 'PIN code')}>
        <div className="afield"><input id={`${prefix}-pin`} inputMode="numeric" maxLength={country === 'US' ? 5 : 6} value={value.postal_code} onChange={set('postal_code')} required /></div>
      </Field>
    </div>
  );
}

export function PersonalSection() {
  const tr = useTr();
  const { data, reload } = useReq();
  const p = data?.personal;
  const country = data?.config.country ?? 'IN';
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [addr, setAddr] = useState<Address>(EMPTY);
  const [perm, setPerm] = useState<Address>(EMPTY);
  const [same, setSame] = useState(false);
  const photo = useRef<HTMLInputElement | null>(null);
  const saver = useSaver();
  const photoSaver = useSaver();

  useEffect(() => {
    if (!p) return;
    setName(p.name_pending ?? p.full_name ?? '');
    setDob(p.dob ?? '');
    setAddr(p.address ?? EMPTY);
    setPerm(p.permanent_address ?? EMPTY);
  }, [p]);

  if (!data || !p) return null;
  const photoItem = item(data, 'profile_photo');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { full_name: name, address: addr };
    if (dob) body.dob = dob;
    if (asked(data, 'permanent_address')) {
      if (same) body.permanent_same = true;
      else if (perm.line1) body.permanent_address = perm;
    }
    if (await saver.run(() => savePersonal(body))) reload();
  }

  return (
    <Section id="personal" title={tr('Personal details')} it={item(data, 'address')}>
      {asked(data, 'profile_photo') && (
        <div className="arow" style={{ gap: 12, flexWrap: 'wrap' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {(p.photo_pending || p.photo) ? <img src={p.photo_pending ?? p.photo ?? ''} alt={tr('Profile photo')} width={72} height={72} style={{ borderRadius: 36, objectFit: 'cover' }} />
            : <span className="apm-face" style={{ width: 72, height: 72 }} aria-hidden="true" />}
          <div className="agrow">
            <div className="ab">{tr('Profile photo')}</div>
            <div className="a14 amut">{tr('A clear photo of your face, JPEG or PNG, under 5 MB. Riders see it once approved.')}</div>
            {p.photo_pending && photoItem?.status === 'in_review' && <div className="a14 amut">{tr('Your new photo is in review. Riders see your current photo until it is approved.')}</div>}
            <Reason it={photoItem} />
          </div>
          <input ref={photo} type="file" accept={IMAGE_ACCEPT} className="sr-only" aria-label={tr('Profile photo')}
            onChange={(e) => {
              const f = e.target.files?.[0]; e.target.value = '';
              if (f) void photoSaver.run(async () => { await uploadFile('personal', 'photo', await squarePhoto(f)); reload(); },
                tr('Uploaded. Our team will review it.'));
            }} />
          <button type="button" className="abtn abtn--ghost a14" style={{ height: 36, padding: '0 14px' }} data-testid="upload-photo"
            disabled={photoSaver.busy} onClick={() => photo.current?.click()}>{tr(p.photo || p.photo_pending ? 'Change photo' : 'Add photo')}</button>
          {photoSaver.line}
        </div>
      )}
      <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
        <Field id="pp-name" label={tr('Full name as on your licence')} help={p.name_pending ? tr('Your new name is in review.') : undefined}>
          <div className="afield"><input id="pp-name" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        </Field>
        {asked(data, 'date_of_birth') && (
          <Field id="pp-dob" label={tr('Date of birth')} help={data.config.min_driver_age ? tr('You must be at least {n}.').replace('{n}', String(data.config.min_driver_age)) : undefined}>
            <div className="afield"><input id="pp-dob" type="date" value={dob} onChange={(e) => setDob(e.target.value)} required /></div>
          </Field>
        )}
        <h3 className="ab">{tr('Current address')}</h3>
        <AddressForm prefix="pa" value={addr} onChange={setAddr} states={data.states} country={country} />
        {asked(data, 'permanent_address') && (
          <>
            <h3 className="ab">{tr('Permanent address (optional)')}</h3>
            <label className="arow a14" style={{ gap: 8 }}><input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} />{tr('Same as current')}</label>
            {!same && <AddressForm prefix="pp" value={perm} onChange={setPerm} states={data.states} country={country} />}
          </>
        )}
        <div><button type="submit" className="abtn abtn--dark" disabled={saver.busy}>{tr('Save')}</button></div>
        {saver.line}
      </form>
    </Section>
  );
}

export function ContactsSection() {
  const tr = useTr();
  const { data, reload } = useReq();
  const [rows, setRows] = useState<Contact[]>([]);
  const saver = useSaver();
  useEffect(() => {
    const got = data?.personal.emergency_contacts ?? [];
    setRows(got.length ? got : [{ position: 1, name: '', relationship: '', phone_number: '' }]);
  }, [data]);
  if (!data || !asked(data, 'emergency_contact')) return null;
  const set = (i: number, k: keyof Contact) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = rows.filter((r) => r.name || r.phone_number).map((r, i) => ({ ...r, position: i + 1 }));
    if (await saver.run(() => savePersonal({ emergency_contacts: body }))) reload();
  }

  return (
    <Section id="contacts" title={tr('Emergency contacts')} it={item(data, 'emergency_contact')}>
      <p className="a14 amut">{tr('Support and our safety team call them only if you need help on a trip. Riders never see them.')}</p>
      <form onSubmit={save} style={{ display: 'grid', gap: 16 }}>
        {rows.map((r, i) => (
          <fieldset key={i} style={{ border: 0, padding: 0, display: 'grid', gap: 8 }}>
            <legend className="ab">{i === 0 ? tr('Contact 1 (required)') : tr('Contact 2 (optional)')}</legend>
            <Field id={`ec-n${i}`} label={tr('Name')}><div className="afield"><input id={`ec-n${i}`} value={r.name} onChange={set(i, 'name')} required={i === 0} /></div></Field>
            <Field id={`ec-r${i}`} label={tr('Relationship')}>
              <select id={`ec-r${i}`} className="achip" value={r.relationship} onChange={set(i, 'relationship')} required={i === 0}>
                <option value="">{tr('Choose')}</option>
                {data.relationships.map((x) => <option key={x.code} value={x.code}>{tr(x.label)}</option>)}
              </select>
            </Field>
            <Field id={`ec-p${i}`} label={tr('Mobile number')}><div className="afield"><input id={`ec-p${i}`} type="tel" value={r.phone_number} onChange={set(i, 'phone_number')} required={i === 0} /></div></Field>
          </fieldset>
        ))}
        <div className="arow" style={{ gap: 8 }}>
          {rows.length < 2 && <button type="button" className="abtn abtn--ghost" onClick={() => setRows([...rows, { position: 2, name: '', relationship: '', phone_number: '' }])}>{tr('Add a second contact')}</button>}
          <button type="submit" className="abtn abtn--dark" disabled={saver.busy}>{tr('Save')}</button>
        </div>
        {saver.line}
      </form>
    </Section>
  );
}
