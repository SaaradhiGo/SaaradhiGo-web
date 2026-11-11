/**
 * Driver setup (10 Nov, v2 the same day): India and the USA show different fields, documents and
 * languages; six steps with their states; an uploaded file is In review, never Missing; dates in
 * the market's order; make and model from the catalogue, "Other" sent for review.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';

const nav = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/driver/setup/identity',
  useRouter: () => ({ replace: vi.fn(), push: nav.push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const STEPS: [string, string[]][] = [
  ['personal', ['profile_photo', 'legal_name', 'date_of_birth', 'address', 'address_proof']], ['contact', ['emergency_contact']],
  ['identity', ['driving_licence', 'aadhaar', 'pan', 'police_verification', 'background_check']], ['vehicle', ['vehicle']],
  ['vehicle_docs', ['vehicle_photos', 'rc', 'registration', 'insurance', 'permit', 'fitness', 'puc', 'inspection']], ['payouts', ['payout_method']],
];
const FILES: Record<string, string[]> = {
  driving_licence: ['license_front', 'license_back'], aadhaar: ['aadhaar'], pan: ['pan'], police_verification: ['police_verification'],
};
const LABELS: Record<string, string> = { license_front: 'Licence, front', license_back: 'Licence, back' };
const tile = (key: string, status: string) => ({
  key, label: LABELS[key] ?? key, status, reason: null, uploaded_at: status === 'missing' ? null : '2026-11-10T09:00:00Z', vehicle: false,
});
const item = (key: string, section: string, status = 'missing', blocks = true) => ({
  key, section, label: key, help: '', need: 'required', blocks_online: blocks, status, reason: null, expires: null,
  step: STEPS.find(([, ks]) => ks.includes(key))?.[0],
  // The licence: front uploaded and waiting for review, back missing.
  files: (FILES[key] ?? []).map((f) => tile(f, f === 'license_front' ? 'in_review' : 'missing')),
});
const IN_ITEMS = ['profile_photo', 'legal_name', 'date_of_birth', 'address', 'address_proof', 'emergency_contact',
  'driving_licence', 'aadhaar', 'pan', 'police_verification', 'vehicle', 'vehicle_photos', 'rc', 'insurance', 'permit',
  'fitness', 'puc', 'payout_method'];
const US_ITEMS = ['profile_photo', 'legal_name', 'date_of_birth', 'address', 'emergency_contact', 'driving_licence',
  'background_check', 'vehicle', 'vehicle_photos', 'registration', 'insurance', 'inspection', 'payout_method'];
const VEHICLE_KEYS = ['rc', 'insurance', 'permit', 'fitness', 'puc', 'registration', 'inspection'];
const IDENTITY_KEYS = ['driving_licence', 'aadhaar', 'pan', 'police_verification', 'background_check'];

function market(country: 'IN' | 'US') {
  const keys = country === 'IN' ? IN_ITEMS : US_ITEMS;
  const items = keys.map((k) => item(k,
    k.startsWith('vehicle') || VEHICLE_KEYS.includes(k) ? 'vehicle' : IDENTITY_KEYS.includes(k) ? 'identity' : k === 'payout_method' ? 'payouts' : 'personal',
    k === 'legal_name' || k === 'payout_method' ? 'done' : k === 'emergency_contact' ? 'approved' : 'missing'));
  const steps = STEPS.map(([key, ks], i) => ({
    key, number: i + 1, items: ks.filter((k) => keys.includes(k)),
    status: key === 'contact' || key === 'payouts' ? 'done' : key === 'personal' ? 'in_review' : 'todo',
  }));
  return {
    config: { country, state: '', items: Object.fromEntries(keys.map((k) => [k, { need: 'required', blocks_online: true }])),
      min_driver_age: country === 'IN' ? 18 : 21, max_vehicle_age_years: 15, languages: country === 'IN' ? ['en', 'te', 'hi'] : ['en', 'es'] },
    checklist: { market: { country, state: '' }, items, done: 2, total: keys.length, blocking: ['profile_photo', 'address'], approved: false,
      steps, steps_done: 2, next_step: 'identity', minutes_left: 10 },
    personal: { full_name: 'Srinu', name_pending: null, photo: null, photo_pending: null, dob: null, address: null, permanent_address: null, emergency_contacts: [] },
    identity: { license_number: '', license_state: '', license_expiry: null, aadhaar_masked: null, pan_masked: null, police_verification_status: 'not_submitted', background_check_status: 'not_started' },
    payout_method: country === 'IN' ? { kind: null, held_until: null, bank: null } : { kind: 'stripe', stripe_status: 'not_started', held_until: null },
    states: country === 'IN' ? [{ code: 'TG', name: 'Telangana' }] : [{ code: 'TX', name: 'Texas' }],
    relationships: [{ code: 'spouse', label: 'Spouse or partner' }],
    vehicle_types: ['sedan', 'suv'], vehicle_years: [2026, 2025, 2012], upload_kinds: { license_front: 'license_doc', license_back: 'license_doc_back' },
  };
}

let country: 'IN' | 'US' = 'IN';
const posts: [string, unknown][] = [];
vi.mock('@/lib/area/api', () => ({
  areaToken: async () => 'tok',
  areaGet: vi.fn(async (p: string) => {
    if (p === '/driver/requirements/') return market(country);
    if (p === '/auth/profile/') return { id: 32, full_name: 'Srinu', market_country: country, market_languages: country === 'IN' ? ['en', 'te', 'hi'] : ['en', 'es'] };
    if (p.startsWith('/driver/vehicle-catalogue/')) return { type: 'sedan', colours: ['White'], makes: [{ make: 'Maruti Suzuki', models: [{ id: 11, model: 'Dzire' }] }] };
    if (p === '/driver/vehicles/') return [];
    if (p === '/driver/driver/onboarding/') return { driver_documents: [], vehicle_documents: [], vehicle: null };
    if (p === '/driver/driver/profile/') return { status: 'offline' };
    return {};
  }),
  areaPost: vi.fn(async (p: string, b: unknown) => { posts.push([p, b]); return { id: 1 }; }),
  areaPatch: vi.fn(async () => ({})),
  endAreaSession: async () => {},
}));
vi.mock('@/lib/publicAuth', async (orig) => ({
  ...(await orig<typeof import('@/lib/publicAuth')>()),
  readRiderToken: () => 'tok',
  sessionRoles: async () => ({ roles: ['driver'] }),
}));

beforeEach(async () => { posts.length = 0; (await import('../ProfileMenu')).forgetAccount(); });
afterEach(() => { cleanup(); country = 'IN'; });
const wrap = (n: React.ReactNode) => render(<LocaleProvider>{n}</LocaleProvider>);
const setup = async (slug: string) => {
  const { DriverSetup } = await import('./setup/DriverSetup');
  return wrap(<DriverSetup slug={slug} />);
};
const languages = async () => {
  const { DriverProfile } = await import('./DriverProfile');
  const { container } = wrap(<DriverProfile />);
  fireEvent.click(await screen.findByRole('button', { name: /^Edit/ }));
  return () => Array.from(container.querySelectorAll('select[aria-label="Language"] option')).map((o) => o.getAttribute('value'));
};

describe('per market', () => {
  it('India asks for Aadhaar and PAN, IFSC for payouts, and offers en, te, hi', async () => {
    await setup('identity');
    await screen.findByLabelText('Aadhaar, last 4 digits');
    expect(screen.getByLabelText('PAN')).toBeTruthy();
    cleanup();
    await setup('payouts');
    await screen.findByLabelText('IFSC');
    expect(screen.queryByText('Set up payouts')).toBeNull();
    cleanup();
    const got = await languages();
    await waitFor(() => expect(got()).toEqual(['en', 'te', 'hi']));
  });

  it('the USA never shows Aadhaar, PAN or IFSC, offers en and es, and starts Stripe', async () => {
    country = 'US';
    await setup('identity');
    await screen.findByLabelText('Issuing state');
    expect(screen.queryByLabelText('Aadhaar, last 4 digits')).toBeNull();
    expect(screen.queryByLabelText('PAN')).toBeNull();
    expect(document.querySelector('[data-step="identity"]')?.textContent).not.toContain('Aadhaar');
    cleanup();
    await setup('payouts');
    await screen.findByText('Set up payouts');
    expect(screen.queryByLabelText('IFSC')).toBeNull();
    cleanup();
    const got = await languages();
    await waitFor(() => expect(got()).toEqual(['en', 'es']));
  });
});

describe('guided setup', () => {
  it('six steps with their states, "2 of 6 steps", one orange button', async () => {
    await setup('identity');
    expect((await screen.findByTestId('steps-done')).textContent).toBe('2 of 6 steps');
    expect(document.querySelector('[data-step="contact"]')?.getAttribute('data-state')).toBe('done');
    expect(document.querySelector('[data-step="personal"]')?.getAttribute('data-state')).toBe('in_review');
    expect(document.querySelector('[data-step="identity"]')?.getAttribute('aria-current')).toBe('step');
    expect(document.querySelectorAll('.abtn--pri').length).toBe(1);
  });

  it('an uploaded, unreviewed file is In review, never Missing', async () => {
    await setup('identity');
    const front = await waitFor(() => {
      const el = document.querySelector('[data-file="license_front"]');
      expect(el).not.toBeNull();
      return el!;
    });
    expect(front.querySelector('.apill')?.textContent).toBe('In review');
    expect(front.textContent).toContain('Replace');
    expect(document.querySelector('[data-file="license_back"] .apill')?.textContent).toBe('Missing');
  });

  it('dates: dd/mm/yyyy in India, mm/dd/yyyy in the USA', async () => {
    await setup('identity');
    expect((await screen.findByTestId('licence-expiry')).getAttribute('placeholder')).toBe('dd/mm/yyyy');
    cleanup();
    country = 'US';
    await setup('identity');
    expect((await screen.findByTestId('licence-expiry')).getAttribute('placeholder')).toBe('mm/dd/yyyy');
  });
});

describe('vehicle', () => {
  it('make and model come from the catalogue and save when complete', async () => {
    await setup('vehicle');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Maruti Suzuki' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Maruti Suzuki' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2025' } });
    expect(screen.getByLabelText('Year').querySelectorAll('option').length).toBe(4);   // Choose + the market's years
    fireEvent.change(screen.getByLabelText('Number plate'), { target: { value: 'ts09ab1234' } });
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'White' } });
    await waitFor(() => expect(posts.at(-1)).toEqual(['/driver/vehicles/add/', {
      vehicle_type: 'sedan', year: 2025, color: 'White', vehicle_number: 'TS09AB1234', catalogue_entry: 11 }]));
  });

  it('Other opens free text and the vehicle goes for review', async () => {
    await setup('vehicle');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Maruti Suzuki' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText('Make name'), { target: { value: 'Hindustan' } });
    fireEvent.change(screen.getByLabelText('Model name'), { target: { value: 'Ambassador' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2012' } });
    fireEvent.change(screen.getByLabelText('Number plate'), { target: { value: 'TS10CD5678' } });
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'White' } });
    await waitFor(() => expect(posts.at(-1)?.[1]).toMatchObject({ custom: true, brand: 'Hindustan', model: 'Ambassador' }));
  });
});

describe('save and return (11 Nov)', () => {
  it('a 5-digit number or no relationship stays on the page with the error under the field', async () => {
    nav.push.mockClear();
    await setup('contact');
    const name = await screen.findByTestId('contact-0-name');
    fireEvent.change(name, { target: { value: 'Lakshmi' } });
    fireEvent.change(screen.getByTestId('contact-0-phone'), { target: { value: '+91 98765' } });
    await act(async () => { fireEvent.click(screen.getByTestId('save-continue')); });
    await screen.findByText('Enter a 10-digit mobile number.');
    expect(screen.getByText('Choose how you know them.')).toBeTruthy();
    expect(nav.push).not.toHaveBeenCalled();
    expect((screen.getByTestId('contact-0-name') as HTMLInputElement).value).toBe('Lakshmi');
    expect((screen.getByTestId('contact-0-phone') as HTMLInputElement).value).toBe('+91 98765');
    expect(posts.some(([p]) => p === '/driver/personal/')).toBe(false);
  });

  it('a complete contact moves on', async () => {
    nav.push.mockClear();
    await setup('contact');
    fireEvent.change(await screen.findByTestId('contact-0-name'), { target: { value: 'Lakshmi' } });
    fireEvent.change(screen.getByTestId('contact-0-relationship'), { target: { value: 'spouse' } });
    fireEvent.change(screen.getByTestId('contact-0-phone'), { target: { value: '+91 98765 43210' } });
    await act(async () => { fireEvent.click(screen.getByTestId('save-continue')); });
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/driver/setup/identity'));
  });

  it('a half-typed date on the identity step stays on the page', async () => {
    nav.push.mockClear();
    await setup('identity');
    fireEvent.change(await screen.findByTestId('licence-expiry'), { target: { value: '31/12' } });
    await act(async () => { fireEvent.click(screen.getByTestId('save-continue')); });
    await screen.findByText('Enter the date as dd/mm/yyyy.');
    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe('a vehicle that did not load (11 Nov)', () => {
  it('Profile says Try again and setup step 4 shows the error, never an empty "Done"', async () => {
    const api = await import('@/lib/area/api');
    const get = api.areaGet as unknown as ReturnType<typeof vi.fn>;
    const real = get.getMockImplementation()!;
    get.mockImplementation(async (p: string) => { if (p === '/driver/vehicles/') throw new Error('lost'); return real(p); });
    try {
      const { DriverProfile } = await import('./DriverProfile');
      wrap(<DriverProfile />);
      expect(await screen.findByTestId('vehicle-retry')).toBeTruthy();
      cleanup();
      await setup('vehicle');
      await screen.findByText(/couldn't load/i);
      expect(screen.queryByTestId('vehicle-type')).toBeNull();
    } finally { get.mockImplementation(real); }
  });
});

describe('documents', () => {
  it('before a vehicle exists, its documents say Add your vehicle first', async () => {
    const { DriverDocuments } = await import('./DriverDocuments');
    wrap(<DriverDocuments />);
    const box = await screen.findByTestId('vehicle-documents-waiting');
    expect(box.textContent).toContain('Add your vehicle first');
    expect(box.querySelector('a[href="/driver/setup/vehicle"]')).not.toBeNull();
    await act(async () => {});
  });
});
