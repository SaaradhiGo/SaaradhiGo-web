'use client';

import { useEffect, useState } from 'react';
import { useTr } from '@/i18n/website';
import { saveIdentity, uploadFile } from '@/lib/area/requirements';
import { Field, FileSlot, Reason, Section, StatusPill, asked, item, useReq, useSaver } from './shared';

const BACKGROUND: Record<string, string> = {
  not_started: 'Not started yet. We start it once your details are in.', pending: 'In progress with our provider.',
  consider: 'Under review by our team.', clear: 'Clear.', failed: 'Not passed. Contact driver support.',
};

export function IdentitySection() {
  const tr = useTr();
  const { data, reload } = useReq();
  const id = data?.identity;
  const country = data?.config.country ?? 'IN';
  const [number, setNumber] = useState('');
  const [state, setState] = useState('');
  const [expiry, setExpiry] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [pan, setPan] = useState('');
  const saver = useSaver();

  useEffect(() => {
    if (!id) return;
    setNumber(id.license_number); setState(id.license_state); setExpiry(id.license_expiry ?? '');
  }, [id]);
  if (!data || !id) return null;
  const up = (field: string) => async (f: File) => { await uploadFile('identity', field, f); reload(); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { license_number: number, license_expiry: expiry };
    if (country === 'US') body.license_state = state;
    if (aadhaar) body.aadhaar_last4 = aadhaar;
    if (pan) body.pan_number = pan;
    if (await saver.run(() => saveIdentity(body))) { setAadhaar(''); setPan(''); reload(); }
  }

  const licence = item(data, 'driving_licence');
  return (
    <Section id="identity" title={tr('Identity and checks')} it={licence}>
      <Reason it={licence} />
      <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
        <Field id="id-lic" label={tr('Driving licence number')}><div className="afield"><input id="id-lic" value={number} onChange={(e) => setNumber(e.target.value.toUpperCase())} required /></div></Field>
        {country === 'US' && (
          <Field id="id-lic-st" label={tr('Issuing state')}>
            <select id="id-lic-st" className="achip" value={state} onChange={(e) => setState(e.target.value)} required>
              <option value="">{tr('Choose')}</option>
              {data.states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <Field id="id-exp" label={tr('Licence expiry date')}><div className="afield"><input id="id-exp" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} required /></div></Field>
        {asked(data, 'aadhaar') && (
          <Field id="id-aad" label={tr('Last 4 digits of your Aadhaar')} help={id.aadhaar_masked ? tr('On file: {v}').replace('{v}', id.aadhaar_masked) : tr('We never store your full Aadhaar number.')}>
            <div className="afield"><input id="id-aad" inputMode="numeric" maxLength={4} pattern="\d{4}" value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/\D/g, ''))} /></div>
          </Field>
        )}
        {asked(data, 'pan') && (
          <Field id="id-pan" label={tr('PAN')} help={id.pan_masked ? tr('On file: {v}').replace('{v}', id.pan_masked) : tr('Needed for TDS on your earnings.')}>
            <div className="afield"><input id="id-pan" maxLength={10} value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} /></div>
          </Field>
        )}
        <div><button type="submit" className="abtn abtn--dark" disabled={saver.busy}>{tr('Save')}</button></div>
        {saver.line}
      </form>
      <FileSlot label={tr('Licence (front)')} present={licence?.status !== 'missing'} onFile={up('license_doc')} testid="upload-license_front" />
      <FileSlot label={tr('Licence (back)')} present={licence?.status !== 'missing'} onFile={up('license_doc_back')} testid="upload-license_back" />
      {asked(data, 'aadhaar') && (
        <div className="arow" style={{ justifyContent: 'space-between' }}><span className="a14 amut">{tr('Aadhaar copy')}</span><StatusPill it={item(data, 'aadhaar')} /></div>
      )}
      {asked(data, 'aadhaar') && <><FileSlot label={tr('Aadhaar copy')} present={item(data, 'aadhaar')?.status !== 'missing'} onFile={up('aadhaar_doc')} testid="upload-aadhaar" /><Reason it={item(data, 'aadhaar')} /></>}
      {asked(data, 'pan') && (
        <div className="arow" style={{ justifyContent: 'space-between' }}><span className="a14 amut">{tr('PAN card')}</span><StatusPill it={item(data, 'pan')} /></div>
      )}
      {asked(data, 'pan') && <><FileSlot label={tr('PAN card')} present={item(data, 'pan')?.status !== 'missing'} onFile={up('pan_doc')} testid="upload-pan" /><Reason it={item(data, 'pan')} /></>}
      {asked(data, 'police_verification') && (
        <>
          <div className="arow" style={{ justifyContent: 'space-between' }}><span className="a14 amut">{tr('Police verification certificate')}</span><StatusPill it={item(data, 'police_verification')} /></div>
          <FileSlot label={tr('Police verification certificate')} present={item(data, 'police_verification')?.status !== 'missing'} onFile={up('police_verification_doc')} testid="upload-police_verification" />
          <Reason it={item(data, 'police_verification')} />
        </>
      )}
      {asked(data, 'background_check') && (
        <div className="arow" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--c-border)', paddingTop: 8 }}>
          <div><div className="ab">{tr('Background check')}</div><div className="a14 amut">{tr(BACKGROUND[id.background_check_status] ?? '')}</div></div>
          <StatusPill it={item(data, 'background_check')} />
        </div>
      )}
    </Section>
  );
}
