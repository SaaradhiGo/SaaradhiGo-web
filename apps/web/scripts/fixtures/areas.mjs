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

export function fixture(method, path, body) {
  const p = path.replace(/^.*\/api\/v1/, '').split('?')[0];
  const [mon, sun] = monday();
  switch (true) {
    case p === '/auth/profile/':
      return { id: 7, full_name: 'Asha Rao', phone_number: '+919876500210', email: 'asha@example.com', created_at: at(7, 9, 0), roles: ['rider'] };
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
      return { estimated_fare: fares[body?.vehicle_type] ?? '118', currency: 'INR' };
    }
    case p === '/ride/maps/directions':
      return { routes: [] };
    case p === '/driver/driver/profile/':
      return { status: 'off', approved: true, total_trips: 312, ratings: '4.8', license_expiry: ymdAgo(-400),
        active_vehicle_details: { vehicle_number: 'TS09AB1234', brand: 'Maruti', model: 'Swift', color: 'white', vehicle_type: { type: 'mini' }, insurance_expiry: ymdAgo(-9) } };
    case p === '/driver/vehicles/':
      return [{ id: 7, insurance_expiry: ymdAgo(-9), permit_expiry: ymdAgo(-300) }];
    case p === '/driver/driver/onboarding/':
      return { driver_documents: [
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
    case p === '/driver/earnings/':
      return { count: SETTLED.length, results: SETTLED.map(([d, hh, mm, fare, com], i) => ({
        id: i + 1, trip_id_val: 300 + i, amount: fare, commission: com, net_amount: String(Number(fare) - Number(com)), created_at: at(d, hh, mm), method: 'cash' })) };
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
