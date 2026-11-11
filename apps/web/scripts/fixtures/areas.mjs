import { catalogueFixture, requirements } from './requirements.mjs';
// API answers for the signed-in areas gate (check-areas.mjs). TEST DATA ONLY:
// shaped exactly like the backend's responses, filled with the design's
// example values so the pages can be compared with its screenshots. Nothing
// here ships: the sample-data check scans src/ and the browser bundles.
const DAY = 86_400_000;
const at = (daysAgo, hh, mm) => {
  // Times are Hyderabad wall-clock times (UTC+5:30).
  const d = new Date(Date.now() - daysAgo * DAY);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
  return new Date(`${ymd}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+05:30`).toISOString();
};
const ymdAgo = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - n * DAY));
const monday = () => {
  const d = new Date(Date.now());
  const wd = (new Date(`${ymdAgo(0)}T12:00:00Z`).getUTCDay() + 6) % 7;
  return [ymdAgo(wd), ymdAgo(wd - 6)];
};

const trip = (id, o) => ({
  id, currency: 'INR', timezone: 'Asia/Kolkata', payment_method: 'cash', status: 'completed',
  pickup_lat: '17.4504', pickup_long: '78.3810', destination_lat: '17.2403', destination_long: '78.4294',
  vehicle_info: { type: o.type ?? 'mini' }, requested_vehicle_type: o.type ?? 'mini', ...o,
});

const RIDER_TRIPS = [
  trip(101, { destination_address: 'International Airport', pickup_address: 'Current location', estimated_fare: '118', final_fare: '118', completed_at: at(0, 9, 12) }),
  trip(102, { destination_address: 'City Railway Station', pickup_address: 'Home', estimated_fare: '64', final_fare: '64', type: 'auto', completed_at: at(1, 18, 5) }),
  trip(103, { destination_address: 'Central Mall', pickup_address: 'Work', estimated_fare: '152', final_fare: null, type: 'sedan', status: 'cancelled', cancelled_at: at(6, 8, 40) }),
  trip(104, { destination_address: 'Work', pickup_address: 'Home', estimated_fare: '96', final_fare: '96', completed_at: at(8, 9, 2) }),
  trip(105, { destination_address: 'Home', pickup_address: 'Central Mall', estimated_fare: '58', final_fare: '58', type: 'auto', completed_at: at(9, 19, 25) }),
];

const RECEIPT = {
  ...RIDER_TRIPS[0], rider_payable: '118', started_at: at(0, 9, 12), completed_at: at(0, 9, 41), actual_distance_km: '14',
  pickup_address: 'Current location', driver_name: 'Ravi K.', ratings: [],
  vehicle_info: { type: 'mini', color: 'White', vehicle_number: 'TS09AB1234', brand: 'Maruti', model: 'Swift' },
};

const LIVE = {
  ...RECEIPT, id: 201, status: 'accepted', otp: '482913', completed_at: null, started_at: null,
  destination_address: 'International Airport', pickup_address: 'the main entrance',
};

const SETTLED = [
  [0, 18, 40, '96', '14', 'Central Mall', 'Home'], [0, 17, 55, '118', '18', 'Tech Park', 'Central Mall'],
  [0, 16, 10, '142', '21', 'Railway Station', 'Old Town'], [0, 14, 30, '238', '36', 'Airport', 'Tech Park'],
  [0, 13, 5, '226', '34', 'Home', 'Airport'], [0, 11, 20, '88', '13', 'Old Town', 'Lake View'],
];

/** /driver/earnings/history/ (10 Nov v2): a month of days with trips, ledger-shaped. */
function HISTORY(path) {
  const period = (path.match(/period=(\w+)/) ?? [])[1] ?? 'month';
  const today = ymdAgo(0);
  const month = today.slice(0, 8);
  const last = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const heights = [70, 115, 109, 56, 0, 87, 117, 100, 120, 114, 48, 0, 117, 41, 100, 73, 110, 69, 0, 64, 100, 109, 110, 100, 90, 0, 121, 59, 0, 69, 121];
  const bars = Array.from({ length: last }, (_, i) => ({ key: `${month}${String(i + 1).padStart(2, '0')}`, earned: (heights[i] * 12.5).toFixed(2), trips: Math.round(heights[i] / 10) }));
  // A day (11 Nov): today, hour by hour, from SETTLED.
  if (period === 'day') {
    const hours = Array.from({ length: 24 }, (_, h) => {
      const at = SETTLED.filter((r) => r[0] === 0 && r[1] === h);
      return { key: String(h).padStart(2, '0'), earned: at.reduce((t, r) => t + Number(r[3]) - Number(r[4]), 0).toFixed(2), trips: at.length };
    });
    const fares = SETTLED.reduce((t, r) => t + Number(r[3]), 0); const fees = SETTLED.reduce((t, r) => t + Number(r[4]), 0);
    return {
      period, start: today, end: today, timezone: 'Asia/Kolkata', currency: 'INR', today, joined: ymdAgo(40),
      has_prev: true, has_next: false, prev: ymdAgo(1), next: today,
      summary: { trips: SETTLED.length, days_driven: 1, fares: fares.toFixed(2), avg_fare: (fares / SETTLED.length).toFixed(2), commission: fees.toFixed(2),
        daily_fee: '0.00', platform_fee: fees.toFixed(2), tips: '0.00', tip_riders: 0, earned: (fares - fees).toFixed(2), paid_to_bank: '0.00', payouts: 0,
        cash_collected: fares.toFixed(2), unresolved_trips: 0, fee_note: '', tips_enabled: false },
      chart: { unit: 'hour', bars: hours },
    };
  }
  return {
    period, start: `${month}01`, end: `${month}${last}`, timezone: 'Asia/Kolkata', currency: 'INR', today, joined: ymdAgo(40),
    has_prev: true, has_next: false, prev: ymdAgo(35), next: today,
    summary: { trips: 298, days_driven: 26, fares: '33995.50', avg_fare: '114.08', commission: '0.00', daily_fee: '2975.00',
      platform_fee: '2975.00', tips: '0.00', tip_riders: 0, earned: '31020.50', paid_to_bank: '18612.00', payouts: 6,
      cash_collected: '12408.50', unresolved_trips: 0, fee_note: 'Capped at ₹149.00 a day', tips_enabled: false },
    chart: { unit: period === 'year' || period === 'taxyear' ? 'month' : period === 'day' ? 'hour' : 'day', bars },
  };
}

export function fixture(method, path, body) {
  const p = path.replace(/^.*\/api\/v1/, '').split('?')[0];
  const [mon, sun] = monday();
  switch (true) {
    case p === '/auth/profile/':
      return { id: 7, full_name: 'Asha Rao', phone_number: '+919876500210', email: 'asha@example.com', created_at: at(7, 9, 0), roles: ['rider'],
        market_languages: ['en', 'te', 'hi'], market_country: 'IN' };
    case p === '/driver/requirements/':
      return requirements('IN', true);
    case p === '/driver/vehicle-catalogue/':
      return catalogueFixture('IN');
    case p === '/rider/places/':
      return { places: [] };
    case p === '/rider/locations/all/':
      return [
        { id: 1, address_text: '12 Lake View Road', latitude: '17.4849', longitude: '78.4138', label: 'home' },
        { id: 2, address_text: 'Tech Park, Block B', latitude: '17.4504', longitude: '78.3810', label: 'work' },
      ];
    case p === '/ride/ride-history/':
      return { count: 5, results: RIDER_TRIPS };
    case p === '/ride/trip/101/':
      return RECEIPT;
    case p === '/ride/trip/201/':
      return LIVE;
    case /^\/ride\/trip\/\d+\/details\/$/.test(p):
      return { driver_name: 'Ravi K.', driver_rating: '4.8', vehicle_info: LIVE.vehicle_info };
    case p === '/pricing/vehicle-types/':
      return { serviceable: true, zone: { code: 'IN-TG-HYD', name: 'Hyderabad', country: 'IN', currency: 'INR', distance_unit: 'km', timezone: 'Asia/Kolkata' },
        vehicle_types: ['auto', 'mini', 'sedan', 'suv'].map((type) => ({ type, description: type })) };
    case p === '/ride/estimate-fare/': {
      const fares = { auto: '78', mini: '118', sedan: '152', suv: '210' };
      return { estimated_fare: fares[body?.vehicle_type] ?? '118', currency: 'INR',
        quote_id: `test-${body?.vehicle_type}`, quote_expires_at: new Date(Date.now() + 300_000).toISOString() };
    }
    case p === '/ride/maps/directions':
      return { routes: [] };
    case p === '/driver/driver/profile/':
      return { status: 'off', approved: true, total_trips: 312, ratings: '4.8', license_expiry: ymdAgo(-400),
        active_vehicle_details: { vehicle_number: 'TS09AB1234', brand: 'Maruti', model: 'Swift', color: 'white', vehicle_type: { type: 'mini' }, insurance_expiry: ymdAgo(-9) } };
    case p === '/driver/vehicles/':
      return [{ id: 7, insurance_expiry: ymdAgo(-9), permit_expiry: ymdAgo(-300) }];
    case p === '/driver/driver/onboarding/':
      // As the API answers it: the car on file, the catalogue, approval (10 Nov).
      return { approved: true, doc_status: 'approved', vehicle_types: [{ type: 'mini' }, { type: 'sedan' }],
        vehicle: { id: 7, vehicle_number: 'TS09AB1234', brand: 'Maruti', model: 'Swift', color: 'white', is_active: true },
        driver_documents: [
        { key: 'license_front', label: 'Driving licence', status: 'approved', required: true, present: true },
        { key: 'id_check', label: 'ID check', status: 'approved', required: true, present: true },
      ], vehicle_documents: [
        { key: 'insurance_doc', label: 'Vehicle insurance', status: 'approved', required: true, present: true },
        { key: 'rc_doc', label: 'Vehicle registration', status: 'approved', required: true, present: true },
      ] };
    case p === '/driver/earnings/period/': {
      const period = (path.match(/period=(\w+)/) ?? [])[1] ?? 'week';
      const t = { today: ['1420', '213', '1207', '860', 12, ymdAgo(0), ymdAgo(0)], week: ['8700', '1303', '7397', '4100', 64, mon, sun], month: ['20100', '3015', '17085', '9800', 151, ymdAgo(0).slice(0, 8) + '01', ymdAgo(0)] }[period];
      return { period, start: t[5], end: t[6], timezone: 'Asia/Kolkata', currency: 'INR', trips: t[4], gross: t[0], commission: t[1], net: t[2], cash_collected: t[3], unresolved_trips: 0 };
    }
    case p === '/driver/earnings/daily/':
      return { days: ['640', '980', '790', '1180', '1470', '1080', '1257'].map((net, i) => ({ date: ymdAgo(6 - i), trips: 9, gross: net, commission: '0', net })) };
    case p === '/driver/withdrawals/balance/':
      return { available_balance: '397', currency: 'INR', withdrawals_available: true };
    case p === '/driver/withdrawals/history/':
      return [[3, '512', 20, 30], [5, '448', 21, 10], [7, '605', 19, 45], [9, '390', 20, 15], [11, '455', 21, 0]]
        .map(([d, amount, hh, mm], i) => ({ id: i + 1, amount, currency: 'INR', status: 'completed', processed_at: at(d, hh, mm) }));
    case p === '/driver/earnings/history/':
      return HISTORY(path);
    case p === '/driver/earnings/months/':
      return { currency: 'INR', joined: ymdAgo(40).slice(0, 7), months: [
        { month: ymdAgo(0).slice(0, 7), so_far: true, trips: 84, fares: '9412.00', platform_fee: '1043.00', tips: '0.00', earned: '8369.00', paid_to_bank: '2410.00', payouts: 2, cash_collected: '5100.00' },
        { month: ymdAgo(35).slice(0, 7), so_far: false, trips: 298, fares: '33995.50', platform_fee: '2975.00', tips: '0.00', earned: '31020.50', paid_to_bank: '18612.00', payouts: 6, cash_collected: '12408.50' },
      ] };
    case p === '/driver/earnings/':
    {
      // ?q= (11 Nov): a place or a trip number, as the API matches it.
      const q = decodeURIComponent((path.match(/[?&]q=([^&]*)/) ?? [])[1] ?? '').replace(/\+/g, ' ').replace(/^#/, '').toLowerCase();
      const rows = SETTLED.map(([d, hh, mm, fare, com, a, b], i) => ({
        id: i + 1, trip_id_val: 300 + i, amount: fare, commission: com, net_amount: String(Number(fare) - Number(com)), created_at: at(d, hh, mm), method: 'cash',
        pickup_address: a, destination_address: b, ride_class: ['auto', 'mini', 'sedan'][i % 3] }))
        .filter((r) => !q || String(r.trip_id_val) === q || `${r.pickup_address} ${r.destination_address}`.toLowerCase().includes(q));
      return { count: rows.length, results: rows };
    }
    case p === '/ride/driver-history/':
      return { results: SETTLED.map(([, , , , , a, b], i) => trip(300 + i, { pickup_address: a, destination_address: b })) };
    default:
      return null;
  }
}

/** The design's example names, plates and places: none may ship. */
export const SAMPLE = [
  'Asha Rao', 'Ravi K.', 'TS 09 AB 1234', 'TS09AB1234', 'asha@example.com', '12 Lake View Road', 'Tech Park, Block B',
  'City Railway Station', 'International Airport', 'Central Mall', 'Maruti Swift', 'ending 4417', '+91 ••••• ••418',
];
