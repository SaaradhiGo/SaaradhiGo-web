import { useLocale } from './LocaleProvider';
import type { Language } from './locales';
import { translateCopy } from './website';

/**
 * Copy for the public pages, word for word from the approved design
 * (design/website-2026-11-07, 2026-11-07). Nothing here that the reference
 * pages do not say.
 *
 * MARKETING RULES (owner, 2026-11-07): no numbers (no currency, fares,
 * earnings, percentages, codes or PINs), no language names, no founder, no
 * city or country specifics. "Ride code", never "PIN". The layout gate
 * (scripts/check-layout.mjs) fails the build if any of these appear.
 */
export type SiteCopy = {
  footer: { line: string; lineShort: string; privacy: string; terms: string; contact: string };
  home: {
    titleTop: string;
    titleBottom: string;
    lead: string;
    leadPhone: string;
    rideNow: string;
    schedule: string;
    tripType: string;
    pickup: string;
    pickupPlaceholder: string;
    pickupPlaceholderPhone: string;
    useLocation: string;
    dest: string;
    destPlaceholder: string;
    seeFares: string;
    tickLocked: string;
    tickSafety: string;
    pinDrop: string;
    pinPickup: string;
    cardTitle: string;
    cardBody: string;
    cardLocked: string;
    phoneMapNote: string;
    sidesLabel: string;
    sidesHeading: string;
    sidesHeadingPhone: string;
    rideLabel: string;
    rideTitle: string;
    rideList: string[];
    rideCta: string;
    mockChoose: string;
    mockClasses: string[];
    mockBook: string;
    driveLabel: string;
    driveTitle: string;
    driveList: string[];
    driveCta: string;
    mockOnline: string;
    mockRequest: string;
    mockFare: string;
    mockCommission: string;
    mockEarn: string;
    mockDecline: string;
    mockAccept: string;
    forRiders: string;
    forRidersBody: string;
    forDrivers: string;
    forDriversBody: string;
    safetyLabel: string;
    safetyHeading: string;
    safetyMore: string;
    safety: { title: string; body: string }[];
    safetyPhone: { title: string; body: string }[];
    appsHeading: string;
    appsBody: string;
    riderApp: string;
    driverApp: string;
  };
  ride: {
    title: string;
    lead: string;
    steps: { title: string; body: string }[];
    cta: string;
    ticketLabel: string;
    ticketChip: string;
    ticketTitle: string;
    ticketPickup: string;
    ticketDest: string;
    lockedTitle: string;
    locked: string[];
  };
  drive: {
    label: string;
    title: string;
    features: { title: string; body: string }[];
    needTitle: string;
    needs: string[];
    needNote: string;
    start: string;
    signIn: string;
    photoLabel: string;
    photoNote: string;
    requestLabel: string;
    fare: string;
    commission: string;
    earn: string;
    accept: string;
    requestNote: string;
  };
  safety: {
    title: string;
    lead: string;
    cards: { title: string; body: string }[];
    sos: string;
    checked: string;
    emergencyTitle: string;
    emergencyBody: string;
    report: string;
  };
  about: {
    label: string;
    title: string;
    body: string;
    logoAlt: string;
    cards: { title: string; body: string }[];
  };
  help: {
    title: string;
    lead: string;
    searchLabel: string;
    searchPlaceholder: string;
    topics: { title: string; body: string; href: string }[];
    faqTitle: string;
    faqs: { q: string; a: string }[];
    noMatch: string;
    contactTitle: string;
    contactBody: string;
    contactCta: string;
  };
  auth: {
    asideTitle: string;
    asideList: string[];
    signUpTitle: string;
    haveOne: string;
    logIn: string;
    signUpWith: string;
    email: string;
    mobile: string;
    fullName: string;
    mobileNumber: string;
    mobileHelp: string;
    mobileLabelPhone: string;
    password: string;
    passwordHelp: string;
    confirm: string;
    confirmShort: string;
    create: string;
    /** {terms} and {privacy} are the two links, in every language. */
    agree: string;
    terms: string;
    privacy: string;
    signInTitle: string;
    newHere: string;
    createOne: string;
  };
};

const en: SiteCopy = {
  footer: {
    line: 'Fair rides for riders and drivers. The fare is agreed before the trip starts.',
    lineShort: 'Fair rides for riders and drivers.',
    privacy: 'Privacy',
    terms: 'Terms',
    contact: 'Contact',
  },
  home: {
    titleTop: 'Fair for riders.',
    titleBottom: 'Fair for drivers.',
    lead: 'See your fare before you book. It stays the same when you arrive.',
    leadPhone: 'The fare you book is the fare you pay. Drivers see their earning before they accept.',
    rideNow: 'Ride now',
    schedule: 'Schedule',
    tripType: 'Trip type',
    pickup: 'Pickup',
    pickupPlaceholder: 'Pickup location',
    pickupPlaceholderPhone: 'Pickup: use my location',
    useLocation: 'Use my location',
    dest: 'Destination',
    destPlaceholder: 'Where to?',
    seeFares: 'See fares',
    tickLocked: 'Fare locked at booking',
    tickSafety: 'Safety on every trip',
    pinDrop: 'Drop',
    pinPickup: 'Pickup',
    cardTitle: 'Your driver is on the way',
    cardBody: 'Track the car live on the map',
    cardLocked: "Fare locked. It won't change.",
    phoneMapNote: 'Driver on the way · fare locked',
    sidesLabel: 'One platform, two sides',
    sidesHeading: 'Honest for the rider. Honest for the driver.',
    sidesHeadingPhone: 'Good for both sides of the ride',
    rideLabel: 'Ride',
    rideTitle: 'Know the fare before you go',
    rideList: [
      'Every ride option priced up front',
      'The fare you book is the fare you pay',
      'Driver and vehicle shown before pickup',
    ],
    rideCta: 'How riding works',
    mockChoose: 'Choose a ride',
    mockClasses: ['Auto', 'Mini', 'Sedan'],
    mockBook: 'Book Auto',
    driveLabel: 'Drive',
    driveTitle: 'Know your pay before you accept',
    driveList: [
      'Your earning shown on every request',
      'Commission shown openly, every trip',
      'Go online whenever it suits you',
    ],
    driveCta: 'Become a Saaradhi',
    mockOnline: 'Online',
    mockRequest: 'New request',
    mockFare: 'Trip fare',
    mockCommission: 'Commission',
    mockEarn: 'You earn',
    mockDecline: 'Decline',
    mockAccept: 'Accept',
    forRiders: 'For riders',
    forRidersBody: 'Every option priced up front. The fare you book is the fare you pay. Know who is coming before pickup.',
    forDrivers: 'For drivers',
    forDriversBody: 'Your earning and the commission on every request, before you accept. Drive when it suits you.',
    safetyLabel: 'Safety',
    safetyHeading: 'Safe from booking to arrival',
    safetyMore: 'How safety works →',
    safety: [
      { title: 'Your code starts the ride', body: 'The trip begins only with the code you share in person.' },
      { title: 'Share your trip live', body: 'Family and friends can follow your ride on a map.' },
      { title: 'SOS reaches a person', body: 'Our team sees your trip and location right away.' },
    ],
    safetyPhone: [
      { title: 'Your code starts the ride', body: 'The trip begins only with the code you share in person.' },
      { title: 'Every trip live on the map', body: 'Share it with family or friends in one tap.' },
      { title: 'Help, one press away', body: 'SOS alerts our team with your trip and location.' },
    ],
    appsHeading: 'Get the SaaradhiGo app',
    appsBody: 'One app to ride. One app to drive.',
    riderApp: 'Rider app',
    driverApp: 'Driver app',
  },
  ride: {
    title: 'How a ride works',
    lead: 'You agree the fare before the trip starts. That is the fare you pay.',
    steps: [
      { title: 'Set pickup and destination', body: 'Type both or use your location. We check the area first.' },
      { title: 'Compare every class', body: 'Auto, Mini, Sedan, SUV, each with its own price.' },
      { title: 'Book, and the fare locks', body: 'You get a fare ticket. It will not go up.' },
      { title: 'Meet your Saaradhi, share your ride code', body: 'Name, car and number plate shown before they arrive.' },
      { title: 'Pay what the ticket said', body: 'No extra charges added at the end.' },
    ],
    cta: 'Book a ride',
    ticketLabel: 'Your fare ticket',
    ticketChip: 'Your ride',
    ticketTitle: 'One price, agreed before the trip',
    ticketPickup: 'Your pickup',
    ticketDest: 'Your destination',
    lockedTitle: 'What "locked" means',
    locked: [
      'The quote you book is held for 5 minutes. Book within that and you pay exactly it.',
      'Move the pickup or wait too long, and we show the new fare before you confirm.',
      'If the trip itself changes (a new drop, tolls), the receipt lists each change and why.',
    ],
  },
  drive: {
    label: 'Become a Saaradhi',
    title: "Drive when it suits you. Know every trip's pay first.",
    features: [
      { title: 'Your earning on every request', body: 'Not just the fare: what you keep, before you tap Accept.' },
      { title: 'Commission shown, every trip', body: 'Fare, commission and your share, line by line.' },
      { title: 'Withdraw your earnings', body: 'From the app, to your own account.' },
    ],
    needTitle: 'To apply you need',
    needs: ['Driving licence', 'Vehicle registration', 'Vehicle insurance', 'ID check'],
    needNote: 'The exact documents depend on local rules where you drive.',
    start: 'Start driving',
    signIn: 'Driver sign in',
    photoLabel: 'Photo',
    photoNote: 'A real SaaradhiGo driver beside their car, photographed with their consent.',
    requestLabel: 'New ride request',
    fare: 'Trip fare',
    commission: 'Commission',
    earn: 'You earn',
    accept: 'Accept',
    requestNote: 'You see all three before you decide.',
  },
  safety: {
    title: 'Safety on every ride',
    lead: 'Four things are built into every SaaradhiGo trip, from the moment you book to the moment you arrive.',
    cards: [
      { title: 'Your code starts the ride', body: 'Share your ride code with the driver in person. It is checked on our servers, so the trip cannot start without you.' },
      { title: 'Every trip is live', body: "Your driver's position and route show on your map for the whole journey. Share it with family in one tap." },
      { title: 'SOS reaches a person', body: 'Press and hold SOS during a ride. Our operations team gets an alert with your trip, driver and live location.' },
      { title: 'Every driver is checked', body: "Our team reviews each driver's licence, vehicle registration and insurance before their first trip." },
    ],
    sos: 'Hold for SOS',
    checked: 'Documents checked',
    emergencyTitle: 'In an emergency, call your local emergency number first',
    emergencyBody: 'Then press SOS in the app, so our team can see your trip and help you and the emergency services.',
    report: 'Report a safety issue',
  },
  about: {
    label: 'About SaaradhiGo',
    title: 'Saaradhi means the charioteer: the one who drives you, steadily and honestly.',
    body: 'We started SaaradhiGo because a ride should not end in an argument about the price, and a driver should not work without knowing their pay. So we show every fare before you choose, lock the one you book, and show drivers what they will earn before they accept.',
    logoAlt: 'SaaradhiGo logo: a charioteer driving a horse-drawn chariot, the road rising into a sail, a location pin, in a gold ring',
    cards: [
      { title: 'The fare, agreed first', body: 'Rider and driver see the same price before the trip, and settle on that number.' },
      { title: 'Fair to drivers', body: 'Earnings and commission are shown on every request, so no one works blind.' },
      { title: 'Built for people, everywhere', body: 'We start in India and grow city by city, keeping the same fair rules wherever we go.' },
    ],
  },
  help: {
    title: 'How can we help?',
    lead: 'Find an answer, or reach a person.',
    searchLabel: 'Search help',
    searchPlaceholder: 'Search: cancel, payment, lost item…',
    topics: [
      { title: 'Riding', body: 'Booking, fares, cancelling', href: '/ride' },
      { title: 'Driving', body: 'Applying, documents, earnings', href: '/drive' },
      { title: 'Payments', body: 'Paying, receipts, refunds', href: '#faqs' },
      { title: 'Safety', body: 'Ride code, SOS, reporting', href: '/safety' },
    ],
    faqTitle: 'Top questions',
    faqs: [
      { q: 'Why is my fare locked?', a: 'So the fare you book is the fare you pay. If the trip itself changes, the receipt lists each change and why.' },
      { q: 'What is the ride code?', a: 'A code on your screen. Your driver cannot start the trip until you give it to them in person.' },
      { q: 'Can I cancel, and does it cost anything?', a: 'You can cancel from the trip screen at any point before the trip starts.' },
      { q: 'My pickup is outside the area', a: 'We tell you before you pick a car.' },
      { q: 'How do I pay?', a: 'Trips are settled in cash with the driver today.' },
      { q: 'How do I apply to drive?', a: 'Apply online with your licence, vehicle registration and insurance. They are reviewed before your first trip.' },
      { q: 'I left something in the car', a: 'Contact support with your trip details and we will help.' },
      { q: 'What happens when I press SOS?', a: 'It reaches our operations team with the trip attached. In an emergency, call your local emergency number first.' },
    ],
    noMatch: 'No questions match that. Try another word, or contact support.',
    contactTitle: 'Still stuck? Talk to a person.',
    contactBody: 'Real people on our support team. Have your trip details handy.',
    contactCta: 'Contact support',
  },
  auth: {
    asideTitle: 'One account for every ride.',
    asideList: ['Every fare before you choose', 'Your receipts and past trips', 'Support that knows your trip'],
    signUpTitle: 'Create your account',
    haveOne: 'Have one?',
    logIn: 'Log in',
    signUpWith: 'Sign up with',
    email: 'Email',
    mobile: 'Mobile',
    fullName: 'Full name',
    mobileNumber: 'Mobile number',
    mobileHelp: 'We text a code to confirm it.',
    mobileLabelPhone: 'Mobile number · we text a code',
    password: 'Password',
    passwordHelp: 'At least 10 characters.',
    confirm: 'Confirm password',
    confirmShort: 'Confirm',
    create: 'Create account',
    agree: 'By creating an account you agree to the {terms} and {privacy}.',
    terms: 'Terms',
    privacy: 'Privacy Policy',
    signInTitle: 'Log in',
    newHere: 'New here?',
    createOne: 'Create an account',
  },
};

/**
 * Telugu, Hindi and Spanish come from the translation files (design/i18n,
 * 2026-11-07; src/i18n/website.ts), looked up by the English above. A string
 * the files do not cover stays in English (AUDIT §28.10).
 */
export const SITE: Record<Language, SiteCopy> = {
  en,
  te: translateCopy(en, 'te'),
  hi: translateCopy(en, 'hi'),
  es: translateCopy(en, 'es'),
};

export function useSite(): SiteCopy {
  const { language } = useLocale();
  return SITE[language] ?? en;
}
