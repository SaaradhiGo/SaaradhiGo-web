/**
 * Driver profile and onboarding for real drivers (10 Nov): India and the USA show different
 * fields, documents and languages; the Ready page shows progress and what blocks going online;
 * make and model come from the catalogue and "Other" is sent for review; before a vehicle exists,
 * its documents say "Add your vehicle first".
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';

vi.mock('next/navigation', () => ({
  usePathname: () => '/driver/profile',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const item = (key: string, section: string, status = 'missing', blocks = true) =>
  ({ key, section, label: key, help: '', need: 'required', blocks_online: blocks, status, reason: null, expires: null });
const IN_ITEMS = ['profile_photo', 'legal_name', 'date_of_birth', 'address', 'address_proof', 'emergency_contact',
  'driving_licence', 'aadhaar', 'pan', 'police_verification', 'vehicle', 'vehicle_photos', 'rc', 'insurance', 'permit',
  'fitness', 'puc', 'payout_method'];
const US_ITEMS = ['profile_photo', 'legal_name', 'date_of_birth', 'address', 'emergency_contact', 'driving_licence',
  'background_check', 'vehicle', 'vehicle_photos', 'registration', 'insurance', 'inspection', 'payout_method'];

function market(country: 'IN' | 'US') {
  const keys = country === 'IN' ? IN_ITEMS : US_ITEMS;
  const items = keys.map((k) => item(k, k.startsWith('vehicle') || ['rc', 'insurance', 'permit', 'fitness', 'puc', 'registration', 'inspection'].includes(k) ? 'vehicle'
    : ['driving_licence', 'aadhaar', 'pan', 'police_verification', 'background_check'].includes(k) ? 'identity'
      : k === 'payout_method' ? 'payouts' : 'personal', k === 'legal_name' || k === 'payout_method' ? 'done' : 'missing'));
  return {
    config: { country, state: '', items: Object.fromEntries(keys.map((k) => [k, { need: 'required', blocks_online: true }])),
      min_driver_age: country === 'IN' ? 18 : 21, max_vehicle_age_years: 15, languages: country === 'IN' ? ['en', 'te', 'hi'] : ['en', 'es'] },
    checklist: { market: { country, state: '' }, items, done: 2, total: keys.length, blocking: ['profile_photo', 'address'], approved: false },
    personal: { full_name: 'Srinu', name_pending: null, photo: null, photo_pending: null, dob: null, address: null, permanent_address: null, emergency_contacts: [] },
    identity: { license_number: '', license_state: '', license_expiry: null, aadhaar_masked: null, pan_masked: null, police_verification_status: 'not_submitted', background_check_status: 'not_started' },
    payout_method: country === 'IN' ? { kind: null, held_until: null, bank: null } : { kind: 'stripe', stripe_status: 'not_started', held_until: null },
    states: country === 'IN' ? [{ code: 'TG', name: 'Telangana' }] : [{ code: 'TX', name: 'Texas' }],
    relationships: [{ code: 'spouse', label: 'Spouse or partner' }],
    vehicle_types: ['sedan', 'suv'], vehicle_years: [2026, 2025, 2012], upload_kinds: {},
  };
}

let country: 'IN' | 'US' = 'IN';
const posts: [string, unknown][] = [];
vi.mock('@/lib/area/api', () => ({
  areaToken: async () => 'tok',
  areaGet: vi.fn(async (p: string) => {
    if (p === '/driver/requirements/') return market(country);
    if (p === '/auth/profile/') return { id: 32, full_name: 'Srinu', market_languages: country === 'IN' ? ['en', 'te', 'hi'] : ['en', 'es'] };
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

describe('per market', () => {
  it('India asks for Aadhaar, PAN and IFSC and offers en, te, hi', async () => {
    const { DriverProfile } = await import('./DriverProfile');
    const { container } = wrap(<DriverProfile />);
    await screen.findByLabelText('Last 4 digits of your Aadhaar');
    expect(screen.getByLabelText('PAN')).toBeTruthy();
    expect(screen.getByLabelText('IFSC')).toBeTruthy();
    expect(screen.queryByText('Set up payouts')).toBeNull();
    await waitFor(() => expect(Array.from(container.querySelectorAll('select[aria-label="Language"] option')).map((o) => o.getAttribute('value'))).toEqual(['en', 'te', 'hi']));
  });

  it('the USA never shows Aadhaar, PAN or IFSC, offers en and es, and starts Stripe', async () => {
    country = 'US';
    const { DriverProfile } = await import('./DriverProfile');
    const { container } = wrap(<DriverProfile />);
    await screen.findByText('Set up payouts');
    expect(screen.queryByLabelText('Last 4 digits of your Aadhaar')).toBeNull();
    expect(screen.queryByLabelText('PAN')).toBeNull();
    expect(screen.queryByLabelText('IFSC')).toBeNull();
    expect(screen.getByLabelText('Issuing state')).toBeTruthy();
    await waitFor(() => expect(Array.from(container.querySelectorAll('select[aria-label="Language"] option')).map((o) => o.getAttribute('value'))).toEqual(['en', 'es']));
  });
});

describe('Get ready to drive', () => {
  it('shows progress and what keeps the driver offline', async () => {
    const { DriverReady } = await import('./DriverReady');
    wrap(<DriverReady />);
    expect((await screen.findByTestId('ready-progress')).textContent).toContain(`2 of ${IN_ITEMS.length} done`);
    expect(screen.getByTestId('ready-progress').textContent).toContain('profile_photo, address');
    expect(document.querySelector('[data-item="aadhaar"] [data-status="missing"]')).not.toBeNull();
  });
});

describe('vehicle', () => {
  it('make and model come from the catalogue; Other is sent for review', async () => {
    const { VehicleSection } = await import('./profile/VehicleSection');
    const { ReqContext } = await import('./profile/shared');
    const load = { state: 'ok' as const, data: market('IN') as never, retry: () => {} };
    wrap(<ReqContext.Provider value={load}><VehicleSection /></ReqContext.Provider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Add vehicle' }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Maruti Suzuki' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'Maruti Suzuki' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2025' } });
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'White' } });
    fireEvent.change(screen.getByLabelText('Number plate'), { target: { value: 'ts09ab1234' } });
    expect(screen.getByLabelText('Year').querySelectorAll('option').length).toBe(4);   // Choose + the market's years
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts.at(-1)).toEqual(['/driver/vehicles/add/', {
      vehicle_type: 'sedan', year: 2025, color: 'White', vehicle_number: 'TS09AB1234', catalogue_entry: 11 }]));
  });

  it('Other opens free text and the vehicle goes for review', async () => {
    const { VehicleSection } = await import('./profile/VehicleSection');
    const { ReqContext } = await import('./profile/shared');
    const load = { state: 'ok' as const, data: market('IN') as never, retry: () => {} };
    wrap(<ReqContext.Provider value={load}><VehicleSection /></ReqContext.Provider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Add vehicle' }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Maruti Suzuki' })).toBeTruthy());
    fireEvent.change(screen.getAllByLabelText('Make')[0], { target: { value: 'other' } });
    fireEvent.change(screen.getAllByLabelText('Make')[1], { target: { value: 'Hindustan' } });
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'Ambassador' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '2012' } });
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'White' } });
    fireEvent.change(screen.getByLabelText('Number plate'), { target: { value: 'TS10CD5678' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(posts.at(-1)?.[1]).toMatchObject({ custom: true, brand: 'Hindustan', model: 'Ambassador' }));
  });
});

describe('documents', () => {
  it('before a vehicle exists, its documents say Add your vehicle first', async () => {
    const { DriverDocuments } = await import('./DriverDocuments');
    wrap(<DriverDocuments />);
    const box = await screen.findByTestId('vehicle-documents-waiting');
    expect(box.textContent).toContain('Add your vehicle first');
    expect(box.querySelector('a[href="/driver/profile#vehicle"]')).not.toBeNull();
    await act(async () => {});
  });
});
