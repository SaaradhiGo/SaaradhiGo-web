import { catalogueFixture, requirements } from './requirements.mjs';

// What the API answers for an account with no rows yet (measured on QA,
// 2026-11-08, for a brand-new driver and rider): zeros, seven empty days and
// empty lists -- never 404, 500 or null. Paths it does not know fall through.
export function emptyAccount(method, url) {
  const p = url.replace(/^.*\/api\/v1/, '').split('?')[0];
  const q = new URL(url).searchParams;
  const today = new Date();
  const day = (n) => new Date(today.getTime() - n * 86400000).toISOString().slice(0, 10);
  switch (true) {
    case p === '/driver/earnings/period/':
      return {
        period: q.get('period') ?? 'week', start: day(6), end: day(0), timezone: 'Asia/Kolkata', currency: 'INR',
        trips: 0, gross: '0.00', commission: '0.00', net: '0.00', cash_collected: '0.00', unresolved_trips: 0,
      };
    case p === '/driver/earnings/daily/':
      return {
        days: [6, 5, 4, 3, 2, 1, 0].map((n) => ({ date: day(n), trips: 0, gross: '0.00', commission: '0.00', net: '0.00' })),
        currency: 'INR', timezone: 'Asia/Kolkata',
      };
    case p === '/driver/earnings/summary/':
      return { today_net: '0.00', today_earned: '0.00', today_trips: 0, total_net: '0.00', currency: 'INR', commission_percent: '0.00' };
    case p === '/driver/withdrawals/balance/':
      return { available_balance: 0.0, currency: 'INR', withdrawals_available: false, minimum_withdrawal: 500.0 };
    case p === '/driver/withdrawals/history/':
    case p === '/driver/earnings/':
    case p === '/ride/driver-history/':
    case p === '/ride/ride-history/':
      return { count: 0, next: null, previous: null, results: [] };
    case p === '/rider/places/':
      return { places: [] };
    case p === '/driver/vehicles/':
    case p === '/rider/locations/all/':
      return [];
    case p === '/driver/driver/profile/':
      return { status: 'off', approved: false, doc_status: 'pending', total_trips: 0, ratings: '0.00', active_vehicle_details: null };
    case p === '/driver/driver/onboarding/':
      return {
        approved: false, doc_status: 'pending',
        driver_documents: [{ key: 'license', label: 'Driving licence', required: true, present: false, status: null }],
        vehicle_documents: [],
      };
    case p === '/auth/profile/':
      return { id: 60, full_name: 'New Account', phone_number: '+919000110801', email: null, created_at: new Date().toISOString(), roles: ['driver'],
        market_languages: ['en', 'te', 'hi'], market_country: 'IN' };
    case p === '/driver/requirements/':
      return requirements('IN', false);
    case p === '/driver/vehicle-catalogue/':
      return catalogueFixture('IN');
    default:
      return undefined;
  }
}

// A driver who has not finished setting up (owner, 10 Nov; Srinu's QA account): no vehicle,
// no home city, not approved. Everything else answers as for a new account.
export function incompleteAccount(method, url) {
  const p = url.replace(/^.*\/api\/v1/, '').split('?')[0];
  if (p === '/auth/profile/') {
    return { id: 32, full_name: 'Srinu', phone_number: '+919000110168', email: null, created_at: '2026-10-25T21:57:58Z', roles: ['driver'],
      market_languages: ['en', 'te', 'hi'], market_country: 'IN' };
  }
  if (p === '/driver/driver/onboarding/') {
    return {
      country: 'IN', approved: false, doc_status: 'pending', vehicle: null, vehicle_documents: [],
      vehicle_types: [{ type: 'sedan', description: '' }, { type: 'auto', description: '' }],
      driver_documents: [
        { key: 'license_front', label: 'Driving licence (front)', required: true, present: false, status: 'missing', recordable: true, upload_kind: 'license_doc', target: 'driver' },
      ],
    };
  }
  return emptyAccount(method, url);
}

// A new driver in the USA (10 Nov): English and Spanish, background check, Stripe payouts, no
// Aadhaar, PAN or IFSC.
export function usAccount(method, url) {
  const p = url.replace(/^.*\/api\/v1/, '').split('?')[0];
  if (p === '/auth/profile/') {
    return { id: 70, full_name: 'Maria Lopez', phone_number: '+15125550170', email: null, created_at: '2026-11-01T15:00:00Z', roles: ['driver'],
      market_languages: ['en', 'es'], market_country: 'US' };
  }
  if (p === '/driver/requirements/') return requirements('US', false);
  if (p === '/driver/vehicle-catalogue/') return catalogueFixture('US');
  if (p === '/driver/withdrawals/balance/') return { available_balance: 0.0, currency: 'USD', withdrawals_available: false, minimum_withdrawal: null };
  const out = emptyAccount(method, url);
  return out && typeof out === 'object' && 'currency' in out ? { ...out, currency: 'USD', timezone: 'America/Chicago' } : out;
}
