'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTr } from '@/i18n/website';
import { formatPlate } from '@/lib/booking';
import { areaPatch, areaPost } from '@/lib/area/api';
import type { Vehicle } from '@/lib/area/driver';
import { type DateOrder } from '@/lib/area/format';
import {
  type Address, type Catalogue, type Contact, type FileTile, type Requirements, catalogue, ifsc as lookupIfsc,
  saveIdentity, savePayoutMethod, savePersonal, setupHref, stripeOnboarding, stripeRefresh, uploadFile,
} from '@/lib/area/requirements';
import { changePhone, className, maskPhone, updateName } from '@/lib/area/rider';
import { messageFor, sendPublicOtp } from '@/lib/publicAuth';
import { useAccount } from '../../ProfileMenu';
import {
  type ContactProblems, addressProblem, contactProblems, payoutProblem, spacedPhone, vehicleProblem,
} from '@/lib/area/setupChecks';
import { StatusPill, asked, item } from '../profile/shared';
import { DateField, DocTile, Labelled, SelectField, TextField, useCheck, useSave } from './fields';

export type Car = Vehicle & { year?: number | null; catalogue_entry?: number | null; custom_make_model?: boolean } & Record<string, unknown>;
export type StepProps = { data: Requirements; reload: () => void; order: DateOrder; car: Car | null; reloadCar: () => void };

export const IMAGE_ACCEPT = 'image/jpeg,image/png';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Upload field of each file tile: the server's `upload_kinds` (e.g. license_front -> license_doc). */
const field = (data: Requirements, key: string) => data.upload_kinds[key] ?? key;
const files = (data: Requirements, key: string): FileTile[] => item(data, key)?.files ?? [];

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

function Part({ title, children, first = false }: { title: string; children: React.ReactNode; first?: boolean }) {
  return <section className={`su-part${first ? ' su-part--first' : ''}`}><h3 className="a20">{title}</h3>{children}</section>;
}

// ---------------------------------------------------------------------------
// 1. Personal details
// ---------------------------------------------------------------------------

const EMPTY: Address = { line1: '', line2: '', city: '', state_code: '', postal_code: '' };

function AddressBlock({ prefix, value, save, data }: {
  prefix: string; value: Address | null; save: (a: Address) => Promise<unknown>; data: Requirements;
}) {
  const tr = useTr();
  const run = useSave();
  const us = data.config.country === 'US';
  const [a, setA] = useState<Address>(value ?? EMPTY);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setA(value ?? EMPTY); }, [value]);
  const complete = (x: Address) => !!(x.line1.trim() && x.city.trim() && x.state_code && x.postal_code.trim());
  useCheck(() => {
    const problem = addressProblem(a, data.config.country);
    if (problem) setErr(tr(problem));
    return !problem && !err;
  });
  async function commit(next: Address) {
    if (!complete(next) || JSON.stringify(next) === JSON.stringify(value ?? EMPTY)) return;
    setErr(null);
    let problem: string | null = null;
    const ok = await run(async () => { try { await save(next); } catch (e) { problem = messageFor(e, ''); throw e; } });
    if (!ok) setErr(problem);
  }
  const input = (k: keyof Address, label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Labelled id={`${prefix}-${k}`} label={label}>
      <div className="ainput"><input id={`${prefix}-${k}`} value={a[k]} {...extra}
        onChange={(e) => setA({ ...a, [k]: e.target.value })} onBlur={() => void commit(a)} /></div>
    </Labelled>
  );
  return (
    <>
      <div className="su-grid">
        {input('line1', tr('Address line 1'))}
        {input('line2', tr('Address line 2 (optional)'))}
        {input('city', tr('City'))}
        <SelectField id={`${prefix}-state`} label={tr(us ? 'State' : 'State or union territory')} value={a.state_code}
          options={data.states.map((s) => ({ value: s.code, label: s.name }))}
          onChange={(v) => { const next = { ...a, state_code: v }; setA(next); void commit(next); }} />
        {input('postal_code', tr(us ? 'ZIP code' : 'PIN code'), { inputMode: 'numeric', maxLength: us ? 5 : 6 })}
      </div>
      {err && <p className="a14 ared" role="alert">{err}</p>}
    </>
  );
}

function PhotoTile({ data, reload }: { data: Requirements; reload: () => void }) {
  const tr = useTr();
  const p = data.personal;
  const tile = files(data, 'profile_photo')[0];
  if (!tile) return null;
  const src = p.photo_pending ?? p.photo;
  return (
    <div className="su-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={tr('Profile photo')} width={72} height={72} /> : <span className="su-photo__none" aria-hidden="true" />}
      <div className="agrow">
        <DocTile file={{ ...tile, label: 'Profile photo' }} accept={IMAGE_ACCEPT} photo
          upload={async (f) => { await uploadFile('personal', 'photo', await squarePhoto(f)); reload(); }} />
        <p className="a14 amut">{p.photo_pending && tile.status === 'in_review'
          ? tr('Your new photo is in review. Riders see your current photo until it is approved.')
          : tr('A clear photo of your face, JPEG or PNG, under 5 MB. Riders see it once approved.')}</p>
      </div>
    </div>
  );
}

/** The mobile number, masked; it changes only with the code texted to the new one (10 Nov). */
function MobileField() {
  const tr = useTr();
  const [acct, setAcct] = useAccount();
  const [stage, setStage] = useState<'off' | 'number' | 'code'>('off');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  async function next() {
    setBusy(true); setNote(null);
    try {
      if (stage === 'number') { await sendPublicOtp(phone, 'driver'); setStage('code'); }
      else { const got = await changePhone(phone, code); setAcct({ ...acct, ...got }); setStage('off'); setPhone(''); setCode(''); }
    } catch (e) { setNote(messageFor(e, tr('We could not verify that number. Try again.'))); }
    finally { setBusy(false); }
  }
  return (
    <div className="su-field">
      <label className="a14 ab" htmlFor="su-mobile">{tr('Mobile')}</label>
      {stage === 'off' ? (
        <div className="ainput">
          <input id="su-mobile" value={maskPhone(acct?.phone_number) ?? ''} readOnly />
          <button type="button" className="su-link" onClick={() => setStage('number')}>{tr('Change')}</button>
        </div>
      ) : (
        <div className="ainput">
          <input id="su-mobile" value={stage === 'number' ? phone : code} inputMode={stage === 'code' ? 'numeric' : 'tel'}
            placeholder={stage === 'number' ? tr('New number, with country code') : tr('6-digit code')} maxLength={stage === 'code' ? 6 : 16}
            autoComplete={stage === 'code' ? 'one-time-code' : 'tel'}
            onChange={(e) => (stage === 'number' ? setPhone(e.target.value) : setCode(e.target.value))} />
          <button type="button" className="su-link" disabled={busy} onClick={() => void next()}>{tr(stage === 'number' ? 'Send code' : 'Verify')}</button>
        </div>
      )}
      {note ? <span className="a14 ared" role="alert">{note}</span>
        : stage === 'code' ? <span className="a14 amut">{tr('The 6-digit code we texted to {phone}').replace('{phone}', phone)}</span> : null}
    </div>
  );
}

export function PersonalStep({ data, reload, order }: StepProps) {
  const tr = useTr();
  const p = data.personal;
  const [acct, setAcct] = useAccount();
  const [same, setSame] = useState(() => !!p.address && JSON.stringify(p.address) === JSON.stringify(p.permanent_address));
  const after = (fn: () => Promise<unknown>) => async () => { await fn(); reload(); };
  return (
    <>
      {asked(data, 'profile_photo') && <PhotoTile data={data} reload={reload} />}
      <div className="su-grid">
        <TextField id="su-name" label={tr('Full name as on your licence')} value={p.name_pending ?? p.full_name ?? ''}
          help={p.name_pending ? tr('Your new name is in review.') : null} autoComplete="name"
          save={(v) => after(() => savePersonal({ full_name: v }))()} />
        {asked(data, 'date_of_birth') && (
          <DateField id="su-dob" label={tr('Date of birth')} value={p.dob} order={order} testid="dob"
            help={data.config.min_driver_age ? tr('You must be at least {n}.').replace('{n}', String(data.config.min_driver_age)) : null}
            save={(iso) => after(() => savePersonal({ dob: iso }))()} />
        )}
        <TextField id="su-email" label={tr('Email')} type="email" value={acct?.email ?? ''} autoComplete="email"
          save={async (v) => { const next = await updateName({ email: v.trim() }); setAcct({ ...acct, ...next }); }} />
        <MobileField />
      </div>
      {asked(data, 'address') && (
        <Part title={tr('Current address')}>
          <AddressBlock prefix="su-a" value={p.address} data={data} save={(a) => after(() => savePersonal({ address: a }))()} />
        </Part>
      )}
      {asked(data, 'permanent_address') && (
        <Part title={tr('Permanent address')}>
          <label className="arow a14" style={{ gap: 8 }}>
            <input type="checkbox" checked={same} onChange={(e) => {
              setSame(e.target.checked);
              if (e.target.checked && p.address) void after(() => savePersonal({ permanent_same: true }))();
            }} />{tr('Same as current')}
          </label>
          {!same && <AddressBlock prefix="su-p" value={p.permanent_address} data={data} save={(a) => after(() => savePersonal({ permanent_address: a }))()} />}
        </Part>
      )}
      {asked(data, 'address_proof') && (
        <Part title={tr('Address proof')}>
          <p className="a14 amut">{tr('A utility bill, rental agreement or similar, under 3 months old.')}</p>
          <div className="su-tiles">
            {files(data, 'address_proof').map((f) => (
              <DocTile key={f.key} file={f} upload={async (x) => { await uploadFile('identity', field(data, f.key), x); reload(); }} />
            ))}
          </div>
        </Part>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 2. Emergency contact
// ---------------------------------------------------------------------------

export function ContactStep({ data, reload }: StepProps) {
  const tr = useTr();
  const run = useSave();
  const prefix = data.config.country === 'US' ? '+1' : '+91';
  const blank = (position: number): Contact => ({ position, name: '', relationship: '', phone_number: prefix });
  const [rows, setRows] = useState<Contact[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [bad, setBad] = useState<ContactProblems[]>([]);
  // Once the driver types, a reload that lands later (a slow phone, 11 Nov) never puts the old values back.
  const typed = useRef(false);
  useEffect(() => {
    if (typed.current) return;
    const got = data.personal.emergency_contacts.map((c) => ({ ...c, phone_number: spacedPhone(c.phone_number) }));
    setRows(got.length ? got : [blank(1)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  const done = (r: Contact, i: number) => !Object.keys(contactProblems([r], data.config.country, prefix)[0] ?? {}).length && (i === 0 || !!r.name.trim());
  useCheck(() => {
    const found = contactProblems(rows, data.config.country, prefix);
    setBad(found);
    return found.every((f) => !Object.keys(f).length) && !err;
  });
  const problem = (i: number, k: keyof ContactProblems) => (bad[i]?.[k] ? tr(bad[i][k]!) : null);
  async function commit(next: Contact[]) {
    const body = next.filter(done).map((r, i) => ({ ...r, phone_number: r.phone_number.replace(/\s/g, ''), position: i + 1 }));
    if (!body.length || JSON.stringify(body) === JSON.stringify(data.personal.emergency_contacts)) return;
    setErr(null);
    let problem: string | null = null;
    const ok = await run(async () => { try { await savePersonal({ emergency_contacts: body }); } catch (e) { problem = messageFor(e, ''); throw e; } });
    if (ok) reload(); else setErr(problem);
  }
  const set = (i: number, k: keyof Contact, v: string) => {
    typed.current = true;
    if (bad[i]?.[k as keyof ContactProblems]) setBad(bad.map((b, j) => (j === i ? { ...b, [k]: undefined } : b)));
    return rows.map((r, j) => (j === i ? { ...r, [k]: v } : r));
  };
  return (
    <>
      {rows.map((r, i) => (
        <Part key={i} title={i === 0 ? tr('Contact 1') : tr('Contact 2 (optional)')} first={i === 0}>
          <div className="su-grid">
            <Labelled id={`su-c${i}-n`} label={tr('Name')} error={problem(i, 'name')}>
              <div className={`ainput${problem(i, 'name') ? ' ainput--bad' : ''}`}><input id={`su-c${i}-n`} value={r.name} data-testid={`contact-${i}-name`}
                aria-invalid={!!problem(i, 'name')} onChange={(e) => setRows(set(i, 'name', e.target.value))} onBlur={() => void commit(rows)} /></div>
            </Labelled>
            <SelectField id={`su-c${i}-r`} label={tr('Relationship')} value={r.relationship} error={problem(i, 'relationship')} testid={`contact-${i}-relationship`}
              options={data.relationships.map((x) => ({ value: x.code, label: tr(x.label) }))}
              onChange={(v) => { const next = set(i, 'relationship', v); setRows(next); void commit(next); }} />
            <Labelled id={`su-c${i}-p`} label={tr('Mobile number')} error={problem(i, 'phone_number')}>
              <div className={`ainput${problem(i, 'phone_number') ? ' ainput--bad' : ''}`}><input id={`su-c${i}-p`} type="tel" value={r.phone_number} data-testid={`contact-${i}-phone`}
                aria-invalid={!!problem(i, 'phone_number')} onChange={(e) => setRows(set(i, 'phone_number', e.target.value))} onBlur={() => void commit(rows)} /></div>
            </Labelled>
          </div>
        </Part>
      ))}
      {err && <p className="a14 ared" role="alert">{err}</p>}
      {rows.length < 2 && (
        <div><button type="button" className="abtn abtn--ghost" onClick={() => setRows([...rows, blank(2)])}>{tr('Add a second contact')}</button></div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 3. Licence and identity
// ---------------------------------------------------------------------------

const BACKGROUND: Record<string, string> = {
  not_started: 'Not started yet. We start it once your details are in.', pending: 'In progress with our provider.',
  consider: 'Under review by our team.', clear: 'Clear.', failed: 'Not passed. Contact driver support.',
};

export function IdentityStep({ data, reload, order }: StepProps) {
  const tr = useTr();
  const id = data.identity;
  const us = data.config.country === 'US';
  const save = (body: Record<string, unknown>) => saveIdentity(body).then(reload);
  const up = (key: string) => async (f: File) => { await uploadFile('identity', field(data, key), f); reload(); };
  const tiles = (key: string) => files(data, key).map((f) => <DocTile key={f.key} file={f} upload={up(f.key)} />);
  return (
    <>
      <Part title={tr('Driving licence')} first>
        <div className="su-grid">
          <TextField id="su-lic" label={tr('Licence number')} value={id.license_number} clean={(v) => v.toUpperCase()}
            testid="licence-number" save={(v) => save({ license_number: v })} />
          <DateField id="su-exp" label={tr('Valid until')} value={id.license_expiry} order={order} testid="licence-expiry"
            save={(iso) => save({ license_expiry: iso })} />
          {us && (
            <SelectField id="su-lic-st" label={tr('Issuing state')} value={id.license_state}
              options={data.states.map((s) => ({ value: s.code, label: s.name }))}
              onChange={(v) => void save({ license_state: v })} />
          )}
        </div>
        <div className="su-tiles">{tiles('driving_licence')}</div>
      </Part>
      {(asked(data, 'aadhaar') || asked(data, 'pan')) && (
        <Part title={tr('Identity')}>
          <div className="su-grid">
            {asked(data, 'aadhaar') && (
              <TextField id="su-aad" label={tr('Aadhaar, last 4 digits')} value={id.aadhaar_masked?.slice(-4) ?? ''} placeholder="1234"
                inputMode="numeric" maxLength={4} clean={(v) => v.replace(/\D/g, '')} help={tr('We store only the last 4 digits.')}
                save={(v) => save({ aadhaar_last4: v })} />
            )}
            {asked(data, 'pan') && (
              <TextField id="su-pan" label={tr('PAN')} value="" placeholder={id.pan_masked ?? 'ABCDE1234F'} maxLength={10}
                clean={(v) => v.toUpperCase()} help={id.pan_masked ? tr('On file: {v}').replace('{v}', id.pan_masked) : tr('Needed for tax on your earnings.')}
                save={(v) => save({ pan_number: v })} />
            )}
          </div>
          <div className="su-tiles">{tiles('aadhaar')}{tiles('pan')}</div>
        </Part>
      )}
      {asked(data, 'police_verification') && (
        <Part title={tr('Police verification')}>
          <div className="su-tiles su-tiles--one">{tiles('police_verification')}</div>
        </Part>
      )}
      {asked(data, 'background_check') && (
        <Part title={tr('Background check')}>
          <div className="arow" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <span className="amut">{tr(BACKGROUND[id.background_check_status] ?? '')}</span>
            <StatusPill it={item(data, 'background_check')} />
          </div>
        </Part>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 4. Your vehicle
// ---------------------------------------------------------------------------

const OTHER = 'other';

export function VehicleStep({ data, reload, car, reloadCar }: StepProps) {
  const tr = useTr();
  const run = useSave();
  const carType = (car?.vehicle_type && typeof car.vehicle_type === 'object' ? car.vehicle_type.type : car?.vehicle_type) ?? '';
  const [type, setType] = useState(String(carType || data.vehicle_types[0] || ''));
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [make, setMake] = useState(car?.custom_make_model ? OTHER : (car?.brand ?? ''));
  const [modelId, setModelId] = useState(car?.catalogue_entry ? String(car.catalogue_entry) : car?.custom_make_model ? OTHER : '');
  const [otherMake, setOtherMake] = useState(car?.custom_make_model ? car?.brand ?? '' : '');
  const [otherModel, setOtherModel] = useState(car?.custom_make_model ? car?.model ?? '' : '');
  const [year, setYear] = useState(car?.year ? String(car.year) : '');
  const [colour, setColour] = useState(car?.color ?? '');
  const [plate, setPlate] = useState(car?.vehicle_number ?? '');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (type) catalogue(type).then(setCat, () => setCat(null)); }, [type]);
  const models = useMemo(() => cat?.makes.find((m) => m.make === make)?.models ?? [], [cat, make]);
  useCheck(() => {
    const custom = make === OTHER || modelId === OTHER;
    const problem = vehicleProblem({ type, make, modelId, year, colour, plate }, !!car)
      ?? (custom && (!otherModel.trim() || (make === OTHER && !otherMake.trim())) ? 'Enter the make and model names.' : null);
    if (problem) setErr(tr(problem));
    return !problem && !err;
  });

  async function commit(over: Partial<Record<'type' | 'make' | 'modelId' | 'year' | 'colour' | 'plate', string>> = {}) {
    const v = { type, make, modelId, year, colour, plate, ...over };
    const custom = v.make === OTHER || v.modelId === OTHER;
    const ready = v.type && v.make && v.modelId && v.year && v.colour && v.plate.trim()
      && (!custom || (otherModel.trim() && (v.make !== OTHER || otherMake.trim())));
    if (!ready) return;
    const body: Record<string, unknown> = { vehicle_type: v.type, year: Number(v.year), color: v.colour, vehicle_number: v.plate };
    if (custom) Object.assign(body, { custom: true, brand: v.make === OTHER ? otherMake : v.make, model: otherModel });
    else body.catalogue_entry = Number(v.modelId);
    setErr(null);
    let problem: string | null = null;
    const ok = await run(async () => {
      try { await (car ? areaPatch(`/driver/vehicles/${car.id}/`, body) : areaPost('/driver/vehicles/add/', body)); }
      catch (e) { problem = messageFor(e, ''); throw e; }
    });
    if (ok) { reloadCar(); reload(); } else setErr(problem);
  }
  const pick = (k: 'type' | 'make' | 'modelId' | 'year' | 'colour', set: (v: string) => void) => (v: string) => { set(v); void commit({ [k]: v }); };
  return (
    <>
      <div className="su-grid">
        <SelectField id="su-vt" label={tr('Vehicle type')} value={type} testid="vehicle-type"
          options={data.vehicle_types.map((t) => ({ value: t, label: className(t) ?? t }))}
          onChange={(v) => { setType(v); setMake(''); setModelId(''); }} />
        <SelectField id="su-make" label={tr('Make')} value={make} testid="vehicle-make"
          options={[...(cat?.makes.map((m) => ({ value: m.make, label: m.make })) ?? []), { value: OTHER, label: tr('Other') }]}
          onChange={(v) => { setMake(v); setModelId(v === OTHER ? OTHER : ''); }} />
        {make === OTHER && (
          <Labelled id="su-omake" label={tr('Make name')}>
            <div className="ainput"><input id="su-omake" value={otherMake} onChange={(e) => setOtherMake(e.target.value)} onBlur={() => void commit()} /></div>
          </Labelled>
        )}
        {make !== OTHER && (
          <SelectField id="su-model" label={tr('Model')} value={modelId} testid="vehicle-model"
            options={[...models.map((m) => ({ value: String(m.id), label: m.model })), { value: OTHER, label: tr('Other') }]}
            onChange={pick('modelId', setModelId)} />
        )}
        {(make === OTHER || modelId === OTHER) && (
          <Labelled id="su-omodel" label={tr('Model name')} help={tr('Not in our list: our team checks the make and model.')}>
            <div className="ainput"><input id="su-omodel" value={otherModel} onChange={(e) => setOtherModel(e.target.value)} onBlur={() => void commit()} /></div>
          </Labelled>
        )}
        <SelectField id="su-year" label={tr('Year')} value={year} testid="vehicle-year"
          options={data.vehicle_years.map((y) => ({ value: String(y), label: String(y) }))} onChange={pick('year', setYear)} />
        <SelectField id="su-colour" label={tr('Colour')} value={colour} testid="vehicle-colour"
          options={(cat?.colours ?? []).map((c) => ({ value: c, label: tr(c) }))} onChange={pick('colour', setColour)} />
        <Labelled id="su-plate" label={tr('Number plate')} help={plate ? formatPlate(plate) : null}>
          <div className="ainput"><input id="su-plate" value={plate} data-testid="vehicle-plate" onChange={(e) => setPlate(e.target.value.toUpperCase())} onBlur={() => void commit()} /></div>
        </Labelled>
      </div>
      {err && <p className="a14 ared" role="alert">{err}</p>}
      <p className="a14 amut">{tr('Saving sends your vehicle for review. You can go online again once it is approved.')}</p>
    </>
  );
}

// ---------------------------------------------------------------------------
// 5. Vehicle photos and papers
// ---------------------------------------------------------------------------

const EXPIRY: Record<string, keyof Vehicle> = {
  insurance: 'insurance_expiry', permit: 'permit_expiry', fitness: 'fitness_expiry', puc: 'puc_expiry',
};
const DOCS = ['rc', 'registration', 'insurance', 'permit', 'fitness', 'puc', 'inspection'];

export function VehicleDocsStep({ data, reload, order, car, reloadCar }: StepProps) {
  const tr = useTr();
  if (!car) {
    return (
      <div className="anote" data-testid="add-vehicle-first">
        <div className="agrow"><div className="ab">{tr('Add your vehicle first')}</div>
          <div className="a14 amut">{tr('Photos and papers belong to a vehicle. Add yours, then come back here.')}</div></div>
        <Link href={setupHref('vehicle')} className="abtn abtn--ghost">{tr('Your vehicle')}</Link>
      </div>
    );
  }
  const up = (key: string) => async (f: File) => { await uploadFile({ vehicle: car.id }, field(data, key), f); reloadCar(); reload(); };
  const docs = DOCS.filter((k) => asked(data, k));
  return (
    <>
      {asked(data, 'vehicle_photos') && (
        <Part title={tr('Photos')} first>
          <div className="su-tiles">
            {files(data, 'vehicle_photos').map((f) => <DocTile key={f.key} file={f} upload={up(f.key)} accept={IMAGE_ACCEPT} photo />)}
          </div>
        </Part>
      )}
      {docs.length > 0 && (
        <Part title={tr('Papers')}>
          <div className="su-tiles">
            {docs.flatMap((k) => files(data, k)).map((f) => <DocTile key={f.key} file={f} upload={up(f.key)} />)}
          </div>
          {docs.some((k) => EXPIRY[k]) && (
            <div className="su-grid">
              {docs.filter((k) => EXPIRY[k]).map((k) => (
                <DateField key={k} id={`su-x-${k}`} label={tr('{doc} valid until').replace('{doc}', tr(item(data, k)?.label ?? k))}
                  value={(car[EXPIRY[k]] as string | null | undefined) ?? null} order={order}
                  save={(iso) => areaPatch(`/driver/vehicles/${car.id}/`, { [EXPIRY[k]]: iso }).then(() => { reloadCar(); reload(); })} />
              ))}
            </div>
          )}
        </Part>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// 6. Bank and payouts
// ---------------------------------------------------------------------------

const VERIFY: Record<string, string> = {
  verified: 'Verified', pending: 'Verification pending', pending_config: 'Verification pending (config)',
  failed: 'Could not be verified',
};
const STRIPE: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', ready: 'Ready' };

export function PayoutsStep({ data, reload }: StepProps) {
  const tr = useTr();
  const run = useSave();
  const search = useSearchParams();
  const pm = data.payout_method;
  const [method, setMethod] = useState<'bank' | 'upi'>(pm.kind === 'upi' ? 'upi' : 'bank');
  const [holder, setHolder] = useState('');
  const [number, setNumber] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [bank, setBank] = useState<string | null>(null);
  const [upi, setUpi] = useState('');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    // Back from Stripe's onboarding (or QA's fake one): read the account's state again.
    if (search?.get('stripe') === 'return') stripeRefresh(search.get('fake') === '1').then(reload, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setBank(null);
    if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) lookupIfsc(code).then((b) => setBank(`${b.bank}, ${b.branch}`), () => setBank(''));
  }, [code]);
  useCheck(() => {
    if (data.config.country === 'US') return true;
    const problem = payoutProblem({ method, holder, number, confirm, code, upi });
    if (problem) setErr(tr(problem));
    return !problem && !err;
  });

  if (data.config.country === 'US') {
    return (
      <>
        <p className="amut">{tr('Payouts in the USA go through Stripe. Stripe asks for your bank details and tax information; SaaradhiGo never sees them.')}</p>
        <div className="arow" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span>{tr('Status')}: <span className="ab">{tr(STRIPE[pm.stripe_status ?? 'not_started'])}</span></span>
          {pm.stripe_status !== 'ready' && (
            <button type="button" className="abtn abtn--dark" data-testid="stripe-setup"
              onClick={() => void run(async () => { const { url } = await stripeOnboarding(); window.location.assign(url); })}>
              {tr('Set up payouts')}
            </button>
          )}
        </div>
      </>
    );
  }

  async function commit(kind: 'bank' | 'upi') {
    const ready = kind === 'upi' ? /^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upi)
      : holder.trim() && number.length >= 6 && number === confirm && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(code);
    if (!ready) return;
    const body = kind === 'upi' ? { method: kind, upi_id: upi }
      : { method: kind, holder_name: holder, account_number: number, account_number_confirm: confirm, ifsc: code };
    setErr(null);
    let problem: string | null = null;
    const ok = await run(async () => { try { await savePayoutMethod(body); } catch (e) { problem = messageFor(e, ''); throw e; } });
    if (ok) { setNumber(''); setConfirm(''); setUpi(''); reload(); } else setErr(problem);
  }
  const box = (id: string, label: string, value: string, set: (v: string) => void, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, help?: string | null) => (
    <Labelled id={id} label={label} help={help}>
      <div className="ainput"><input id={id} value={value} autoComplete="off" {...extra} onChange={(e) => set(e.target.value)} onBlur={() => void commit(method)} /></div>
    </Labelled>
  );
  return (
    <>
      {(pm.bank || pm.upi_masked) && (
        <p className="a14">{tr('On file')}: <span className="ab">{pm.bank ? `${pm.bank.bank_name} ${pm.bank.account_masked}` : `UPI ${pm.upi_masked}`}</span>
          {pm.bank && <> · {tr(VERIFY[pm.bank.verification_status] ?? pm.bank.verification_status)}</>}</p>
      )}
      {pm.held_until && <p className="a14 ared" role="note">{tr('Your payout details changed. For your safety, payouts resume at {time}.').replace('{time}', new Date(pm.held_until).toLocaleString())}</p>}
      <div className="arow" role="radiogroup" aria-label={tr('Payout method')} style={{ gap: 8 }}>
        {(['bank', 'upi'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={method === m} className={`achip${method === m ? ' achip--on' : ''}`} onClick={() => setMethod(m)}>
            {tr(m === 'bank' ? 'Bank account' : 'UPI ID')}
          </button>
        ))}
      </div>
      {method === 'bank' ? (
        <div className="su-grid">
          {box('su-bh', tr('Account holder name'), holder, setHolder)}
          {box('su-bi', tr('IFSC'), code, (v) => setCode(v.toUpperCase()), { maxLength: 11 }, bank === null ? null : bank || tr('We could not find that IFSC.'))}
          {box('su-bn', tr('Account number'), number, (v) => setNumber(v.replace(/\s/g, '')), { inputMode: 'numeric' })}
          {box('su-bc', tr('Account number again'), confirm, (v) => setConfirm(v.replace(/\s/g, '')), { inputMode: 'numeric', onPaste: (e) => e.preventDefault() })}
        </div>
      ) : (
        <div className="su-grid">{box('su-upi', tr('UPI ID'), upi, (v) => setUpi(v.trim()), { placeholder: 'name@okaxis' })}</div>
      )}
      {err && <p className="a14 ared" role="alert">{err}</p>}
      <p className="a14 amut">{tr('Changing your payout details pauses payouts for 24 hours, and we text you about the change.')}</p>
    </>
  );
}

export const STEP_BODY = {
  personal: PersonalStep, contact: ContactStep, identity: IdentityStep, vehicle: VehicleStep,
  vehicle_docs: VehicleDocsStep, payouts: PayoutsStep,
} as const;
