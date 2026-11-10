// What /driver/requirements/ and /driver/vehicle-catalogue/ answer (10 Nov), per market, shaped
// like the backend's responses. TEST DATA ONLY.
const IN_ITEMS = {
  profile_photo: 'personal', legal_name: 'personal', date_of_birth: 'personal', address: 'personal',
  permanent_address: 'personal', address_proof: 'personal', emergency_contact: 'personal',
  driving_licence: 'identity', aadhaar: 'identity', pan: 'identity', police_verification: 'identity',
  vehicle: 'vehicle', vehicle_photos: 'vehicle', rc: 'vehicle', insurance: 'vehicle', permit: 'vehicle',
  fitness: 'vehicle', puc: 'vehicle', payout_method: 'payouts',
};
const US_ITEMS = {
  profile_photo: 'personal', legal_name: 'personal', date_of_birth: 'personal', address: 'personal',
  permanent_address: 'personal', emergency_contact: 'personal', driving_licence: 'identity',
  background_check: 'identity', vehicle: 'vehicle', vehicle_photos: 'vehicle', registration: 'vehicle',
  insurance: 'vehicle', inspection: 'vehicle', payout_method: 'payouts',
};
const LABELS = {
  profile_photo: 'Profile photo', legal_name: 'Full name as on your licence', date_of_birth: 'Date of birth',
  address: 'Current address', permanent_address: 'Permanent address', address_proof: 'Address proof',
  emergency_contact: 'Emergency contact', driving_licence: 'Driving licence', aadhaar: 'Aadhaar', pan: 'PAN',
  police_verification: 'Police verification', background_check: 'Background check', vehicle: 'Vehicle details',
  vehicle_photos: 'Vehicle photos', rc: 'Registration Certificate (RC)', registration: 'Vehicle registration',
  insurance: 'Vehicle insurance', permit: 'Commercial permit', fitness: 'Fitness certificate',
  puc: 'Pollution Under Control (PUC)', inspection: 'Vehicle inspection', payout_method: 'Payout method',
};
const OPTIONAL = new Set(['permanent_address']);
const NOT_BLOCKING = new Set(['permanent_address', 'pan', 'payout_method']);

/** The market's requirements for a driver; `approved` is a complete driver, else nothing is in yet. */
export function requirements(country, approved) {
  const keys = country === 'US' ? US_ITEMS : IN_ITEMS;
  const items = Object.entries(keys).map(([key, section]) => ({
    key, section, label: LABELS[key], help: '', need: OPTIONAL.has(key) ? 'optional' : 'required',
    blocks_online: !NOT_BLOCKING.has(key), status: approved ? (section === 'personal' && key !== 'profile_photo' ? 'done' : 'approved') : 'missing',
    reason: !approved && section === 'vehicle' && key !== 'vehicle' ? 'Add your vehicle first.' : null, expires: null,
  }));
  const required = items.filter((i) => i.need === 'required');
  return {
    config: {
      country, state: '', min_driver_age: country === 'US' ? 21 : 18, max_vehicle_age_years: 15,
      languages: country === 'US' ? ['en', 'es'] : ['en', 'te', 'hi'],
      items: Object.fromEntries(items.map((i) => [i.key, { need: i.need, blocks_online: i.blocks_online }])),
    },
    checklist: {
      market: { country, state: '' }, items, approved,
      done: approved ? required.length : 1, total: required.length,
      blocking: approved ? [] : items.filter((i) => i.blocks_online && i.need === 'required').map((i) => i.key),
    },
    personal: { full_name: 'Asha Rao', name_pending: null, photo: null, photo_pending: null, dob: approved ? '1990-01-01' : null,
      address: approved ? { line1: '12 Lake View Road', line2: '', city: 'Hyderabad', state_code: 'TG', postal_code: '500034' } : null,
      permanent_address: null, emergency_contacts: [] },
    identity: { license_number: approved ? 'TS0920200001234' : '', license_state: '', license_expiry: null, aadhaar_masked: approved ? 'XXXX XXXX 9012' : null,
      pan_masked: null, police_verification_status: approved ? 'verified' : 'not_submitted', background_check_status: 'not_started' },
    payout_method: country === 'US' ? { kind: 'stripe', stripe_status: 'not_started', held_until: null }
      : approved ? { kind: 'upi', upi_masked: '••kaxis', held_until: null, bank: null } : { kind: null, held_until: null, bank: null },
    states: country === 'US' ? [{ code: 'TX', name: 'Texas' }] : [{ code: 'TG', name: 'Telangana' }, { code: 'AP', name: 'Andhra Pradesh' }],
    relationships: [{ code: 'spouse', label: 'Spouse or partner' }, { code: 'parent', label: 'Parent' }],
    vehicle_types: ['auto', 'hatchback', 'sedan', 'suv'], vehicle_years: [2026, 2025, 2024, 2023, 2022, 2021], upload_kinds: {},
  };
}

export function catalogueFixture(country) {
  return country === 'US'
    ? { type: 'sedan', colours: ['White', 'Black'], makes: [{ make: 'Toyota', models: [{ id: 501, model: 'Camry' }] }] }
    : { type: 'sedan', colours: ['White', 'Black'], makes: [{ make: 'Maruti Suzuki', models: [{ id: 11, model: 'Dzire' }] }] };
}
