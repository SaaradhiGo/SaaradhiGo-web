'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTr } from '@/i18n/website';
import { formatPlate } from '@/lib/booking';
import { type Vehicle, vehicles as loadVehicles } from '@/lib/area/driver';
import { type Catalogue, catalogue, uploadFile } from '@/lib/area/requirements';
import { areaPatch, areaPost } from '@/lib/area/api';
import { className } from '@/lib/area/rider';
import { useLoad } from '@/lib/area/useLoad';
import { Field, FileSlot, IMAGE_ACCEPT, Reason, Section, StatusPill, item, useReq, useSaver } from './shared';

const OTHER = 'other';
const SIDES = [
  ['vehicle_pic', 'Front'], ['photo_back', 'Back'], ['photo_left', 'Left side'], ['photo_right', 'Right side'],
  ['photo_interior', 'Inside'],
] as const;
type Car = Vehicle & { year?: number | null; catalogue_entry?: number | null; custom_make_model?: boolean } & Record<string, unknown>;

export function VehicleSection() {
  const tr = useTr();
  const { data, reload } = useReq();
  const cars = useLoad(loadVehicles);
  const car = (cars.data?.[0] ?? null) as Car | null;
  const [editing, setEditing] = useState(false);
  const [type, setType] = useState('');
  const [cat, setCat] = useState<Catalogue | null>(null);
  const [make, setMake] = useState('');
  const [modelId, setModelId] = useState('');
  const [otherMake, setOtherMake] = useState('');
  const [otherModel, setOtherModel] = useState('');
  const [year, setYear] = useState('');
  const [colour, setColour] = useState('');
  const [plate, setPlate] = useState('');
  const saver = useSaver();

  useEffect(() => { if (type) catalogue(type).then(setCat, () => setCat(null)); }, [type]);
  const models = useMemo(() => cat?.makes.find((m) => m.make === make)?.models ?? [], [cat, make]);

  if (!data) return null;
  const carType = (car?.vehicle_type && typeof car.vehicle_type === 'object' ? car.vehicle_type.type : car?.vehicle_type) ?? '';

  function open() {
    setType(String(carType || data!.vehicle_types[0] || ''));
    setMake(car?.custom_make_model ? OTHER : (car?.brand ?? ''));
    setModelId(car?.catalogue_entry ? String(car.catalogue_entry) : '');
    setOtherMake(car?.custom_make_model ? car?.brand ?? '' : '');
    setOtherModel(car?.custom_make_model ? car?.model ?? '' : '');
    setYear(car?.year ? String(car.year) : '');
    setColour(car?.color ?? '');
    setPlate(car?.vehicle_number ?? '');
    setEditing(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { vehicle_type: type, year: Number(year), color: colour, vehicle_number: plate };
    if (make === OTHER || modelId === OTHER) Object.assign(body, { custom: true, brand: make === OTHER ? otherMake : make, model: otherModel });
    else body.catalogue_entry = Number(modelId);
    const ok = await saver.run(() => (car ? areaPatch(`/driver/vehicles/${car.id}/`, body) : areaPost('/driver/vehicles/add/', body)),
      tr('Saved. Your vehicle is in review.'));
    if (ok) { setEditing(false); cars.retry(); reload(); }
  }

  const photos = item(data, 'vehicle_photos');
  return (
    <Section id="vehicle" title={tr('Vehicle')} it={item(data, 'vehicle')}>
      {!editing && (car ? (
        <div style={{ display: 'grid', gap: 4 }}>
          <div className="ab">{[car.brand, car.model, car.year].filter(Boolean).join(' ')}</div>
          <div className="a14 amut">{[className(String(carType)), car.color, car.vehicle_number ? formatPlate(car.vehicle_number) : null].filter(Boolean).join(' · ')}</div>
          {car.custom_make_model && <div className="a14 amut">{tr('Not in our list: our team checks the make and model.')}</div>}
        </div>
      ) : <p className="aempty">{tr('No vehicle yet. Add the one you drive to get approved.')}</p>)}
      {!editing && <div><button type="button" className="abtn abtn--ghost" onClick={open}>{tr(car ? 'Edit' : 'Add vehicle')}</button></div>}
      {editing && (
        <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
          <Field id="vh-type" label={tr('Vehicle type')}>
            <select id="vh-type" className="achip" value={type} onChange={(e) => { setType(e.target.value); setMake(''); setModelId(''); }} required>
              {data.vehicle_types.map((t) => <option key={t} value={t}>{className(t) ?? t}</option>)}
            </select>
          </Field>
          <Field id="vh-make" label={tr('Make')}>
            <select id="vh-make" className="achip" value={make} onChange={(e) => { setMake(e.target.value); setModelId(''); }} required>
              <option value="">{tr('Choose')}</option>
              {cat?.makes.map((m) => <option key={m.make} value={m.make}>{m.make}</option>)}
              <option value={OTHER}>{tr('Other')}</option>
            </select>
          </Field>
          {make === OTHER && <Field id="vh-omake" label={tr('Make')}><div className="afield"><input id="vh-omake" value={otherMake} onChange={(e) => setOtherMake(e.target.value)} required /></div></Field>}
          <Field id="vh-model" label={tr('Model')}>
            {make === OTHER ? <div className="afield"><input id="vh-model" value={otherModel} onChange={(e) => setOtherModel(e.target.value)} required /></div> : (
              <select id="vh-model" className="achip" value={modelId} onChange={(e) => setModelId(e.target.value)} required>
                <option value="">{tr('Choose')}</option>
                {models.map((m) => <option key={m.id} value={m.id}>{m.model}</option>)}
                <option value={OTHER}>{tr('Other')}</option>
              </select>
            )}
          </Field>
          {make !== OTHER && modelId === OTHER && <Field id="vh-omodel" label={tr('Model name')}><div className="afield"><input id="vh-omodel" value={otherModel} onChange={(e) => setOtherModel(e.target.value)} required /></div></Field>}
          <Field id="vh-year" label={tr('Year')}>
            <select id="vh-year" className="achip" value={year} onChange={(e) => setYear(e.target.value)} required>
              <option value="">{tr('Choose')}</option>
              {data.vehicle_years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field id="vh-colour" label={tr('Colour')}>
            <select id="vh-colour" className="achip" value={colour} onChange={(e) => setColour(e.target.value)} required>
              <option value="">{tr('Choose')}</option>
              {(cat?.colours ?? []).map((c) => <option key={c} value={c}>{tr(c)}</option>)}
            </select>
          </Field>
          <Field id="vh-plate" label={tr('Number plate')}><div className="afield"><input id="vh-plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} required /></div></Field>
          <p className="a14 amut">{tr('Saving sends your vehicle for review. You can go online again once it is approved.')}</p>
          <div className="arow" style={{ gap: 8 }}>
            <button type="submit" className="abtn abtn--dark" disabled={saver.busy}>{tr('Save')}</button>
            <button type="button" className="abtn abtn--ghost" onClick={() => setEditing(false)}>{tr('Cancel')}</button>
          </div>
        </form>
      )}
      {saver.line}
      {car && (
        <div style={{ display: 'grid', gap: 4 }} data-testid="vehicle-photos">
          <div className="arow" style={{ justifyContent: 'space-between' }}><h3 className="ab">{tr('Vehicle photos')}</h3><StatusPill it={photos} /></div>
          <Reason it={photos} />
          {SIDES.map(([field, label]) => (
            <FileSlot key={field} label={tr(label)} present={!!car[field]} accept={IMAGE_ACCEPT} testid={`upload-${field}`}
              onFile={async (f) => { await uploadFile({ vehicle: car.id }, field, f); cars.retry(); reload(); }} />
          ))}
        </div>
      )}
    </Section>
  );
}
