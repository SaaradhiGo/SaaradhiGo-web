'use client';

import { useEffect, useState } from 'react';
import { Alert, Field, SubmitButton } from '@/components/form';
import { useTr } from '@/i18n/website';
import { api, ApiError } from '@/lib/api';
import { fetchZones, type Zone } from '@/lib/markets';
import { messageFor } from '@/lib/publicAuth';

/**
 * Apply to drive before sign-up opens (17 Nov, PROD before SMS keys). Name, mobile, city and
 * vehicle go to `/platform/driver-applications/`; operators see them in the console and contact
 * the driver when sign-up opens. No account and no code by text message.
 */
const VEHICLES = [
  { value: 'car', label: 'Car' },
  { value: 'auto', label: 'Auto' },
  { value: 'bike', label: 'Bike' },
];

export default function DriverApplicationForm() {
  const tr = useTr();
  const [zones, setZones] = useState<Zone[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    fetchZones()
      .then((z) => setZones(z))
      .catch(() => setZones([]));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.post<{ city: string }>('/platform/driver-applications/', {
        full_name: name.trim(),
        phone_number: phone.trim(),
        city,
        vehicle_type: vehicle,
        ...(email.trim() ? { email: email.trim() } : {}),
      });
      setDone(res?.city ?? '');
    } catch (err) {
      const field = err instanceof ApiError ? err.field ?? undefined : undefined;
      setError({ field, message: messageFor(err, tr('We could not send your application. Try again.')) });
    } finally {
      setBusy(false);
    }
  }

  if (done !== null) {
    return (
      <Alert kind="success">
        {tr('Thank you. We have your application')}
        {done ? ` (${done})` : ''}. {tr('We will call you when driver sign-up opens.')}
      </Alert>
    );
  }

  const err = (f: string) => (error?.field === f ? error.message : null);
  return (
    <form onSubmit={submit} noValidate className="s-form">
      <Alert kind="info">
        {tr('Driver sign-up opens soon. Leave your details and we will call you.')}
      </Alert>
      <Field label={tr('Full name')} value={name} onChange={(e) => setName(e.target.value)}
        autoComplete="name" required error={err('full_name')} />
      <Field label={tr('Mobile number')} type="tel" inputMode="tel" value={phone}
        onChange={(e) => setPhone(e.target.value)} autoComplete="tel" required error={err('phone_number')} />
      <div className="s-field">
        <label htmlFor="apply-city">{tr('City')}</label>
        <select id="apply-city" className="input" value={city} onChange={(e) => setCity(e.target.value)} required
          aria-invalid={err('city') ? 'true' : undefined}>
          <option value="">{tr('Choose a city')}</option>
          {zones.map((z) => (
            <option key={z.code} value={z.code}>{z.city_name || z.name}</option>
          ))}
        </select>
        {err('city') && <p className="s-err">{err('city')}</p>}
      </div>
      <div className="s-field">
        <label htmlFor="apply-vehicle">{tr('Vehicle')}</label>
        <select id="apply-vehicle" className="input" value={vehicle} onChange={(e) => setVehicle(e.target.value)} required
          aria-invalid={err('vehicle_type') ? 'true' : undefined}>
          <option value="">{tr('Choose a vehicle')}</option>
          {VEHICLES.map((v) => (
            <option key={v.value} value={v.value}>{tr(v.label)}</option>
          ))}
        </select>
        {err('vehicle_type') && <p className="s-err">{err('vehicle_type')}</p>}
      </div>
      <Field label={tr('Email (optional)')} type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        autoComplete="email" error={err('email')} />
      {error && !error.field && <Alert kind="error">{error.message}</Alert>}
      <SubmitButton busy={busy} busyLabel={tr('Sending…')}>{tr('Apply to drive')}</SubmitButton>
    </form>
  );
}
