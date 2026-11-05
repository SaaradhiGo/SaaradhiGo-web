import type { Language } from './locales';

/** Homepage copy added with the design-system pass; English is the fallback. */
export type HomeCopy = {
  eyebrow: string;
  titleTop: string;
  titleBottom: string;
  subtitle: string;
  panelTitle: string;
  cta: string;
  mapPickup: string;
  mapDrop: string;
  promiseLabel: string;
  promises: { eyebrow: string; promise: string; detail: string }[];
  ridesEyebrow: string;
  ridesHeading: string;
  ridesHeadingEm: string;
  ridesLead: string;
  from: string;
  bandEyebrow: string;
  bandHeading: string;
  bandHeadingEm: string;
};

const en: HomeCopy = {
  eyebrow: 'Now in Hyderabad',
  titleTop: 'Know the fare',
  titleBottom: 'before you get in.',
  subtitle: 'Set your pickup, choose a ride, see the price up front.',
  panelTitle: 'Book a ride',
  cta: 'See fares',
  mapPickup: 'Pickup',
  mapDrop: 'Destination',
  promiseLabel: 'What SaaradhiGo promises',
  promises: [
    { eyebrow: 'Fare locked', promise: 'The price you see is the price you pay.', detail: 'No surprises after you book.' },
    { eyebrow: 'Verified Saaradhis', promise: 'Every driver, checked and rated.', detail: 'Identity-verified before a first trip, rated after every ride.' },
    { eyebrow: 'Safe every mile', promise: 'A PIN, a live map, a safety button.', detail: 'Ride PIN, live tracking and a safety button on every ride.' },
  ],
  ridesEyebrow: 'Ways to ride',
  ridesHeading: 'A Saaradhi for',
  ridesHeadingEm: 'every journey.',
  ridesLead: 'Every class shows its fare before you book.',
  from: 'from',
  bandEyebrow: 'Safety',
  bandHeading: 'Safe from the first PIN',
  bandHeadingEm: 'to the last stop.',
};

const hi: HomeCopy = {
  eyebrow: 'अब हैदराबाद में',
  titleTop: 'किराया जानें',
  titleBottom: 'बैठने से पहले।',
  subtitle: 'पिकअप चुनें, सवारी चुनें, कीमत पहले देखें।',
  panelTitle: 'सवारी बुक करें',
  cta: 'किराया देखें',
  mapPickup: 'पिकअप',
  mapDrop: 'गंतव्य',
  promiseLabel: 'SaaradhiGo का वादा',
  promises: [
    { eyebrow: 'तय किराया', promise: 'जो कीमत दिखे, वही चुकानी है।', detail: 'बुक करने के बाद कोई अचरज नहीं।' },
    { eyebrow: 'सत्यापित सारथी', promise: 'हर ड्राइवर जाँचा हुआ और रेटेड।', detail: 'पहली यात्रा से पहले पहचान सत्यापित, हर सवारी के बाद रेटिंग।' },
    { eyebrow: 'हर मील सुरक्षित', promise: 'PIN, लाइव मैप, सुरक्षा बटन।', detail: 'हर सवारी में राइड PIN, लाइव ट्रैकिंग और सुरक्षा बटन।' },
  ],
  ridesEyebrow: 'सवारी के तरीके',
  ridesHeading: 'हर सफ़र के लिए',
  ridesHeadingEm: 'एक सारथी।',
  ridesLead: 'हर श्रेणी बुक करने से पहले अपना किराया दिखाती है।',
  from: 'से शुरू',
  bandEyebrow: 'सुरक्षा',
  bandHeading: 'पहले PIN से',
  bandHeadingEm: 'आख़िरी पड़ाव तक सुरक्षित।',
};

const te: HomeCopy = {
  eyebrow: 'ఇప్పుడు హైదరాబాద్‌లో',
  titleTop: 'ధర తెలుసుకోండి',
  titleBottom: 'ఎక్కే ముందే.',
  subtitle: 'పికప్ ఎంచుకోండి, రైడ్ ఎంచుకోండి, ధరను ముందే చూడండి.',
  panelTitle: 'రైడ్ బుక్ చేయండి',
  cta: 'ధరలు చూడండి',
  mapPickup: 'పికప్',
  mapDrop: 'గమ్యం',
  promiseLabel: 'SaaradhiGo హామీలు',
  promises: [
    { eyebrow: 'స్థిరమైన ధర', promise: 'మీరు చూసిన ధరే మీరు చెల్లించేది.', detail: 'బుక్ చేసిన తర్వాత ఆశ్చర్యాలు ఉండవు.' },
    { eyebrow: 'ధృవీకరించిన సారథులు', promise: 'ప్రతి డ్రైవర్ తనిఖీ, రేటింగ్ పొందినవారు.', detail: 'మొదటి ట్రిప్ ముందే గుర్తింపు ధృవీకరణ, ప్రతి రైడ్ తర్వాత రేటింగ్.' },
    { eyebrow: 'ప్రతి మైలు సురక్షితం', promise: 'PIN, లైవ్ మ్యాప్, భద్రతా బటన్.', detail: 'ప్రతి రైడ్‌లో రైడ్ PIN, లైవ్ ట్రాకింగ్, భద్రతా బటన్.' },
  ],
  ridesEyebrow: 'ప్రయాణ మార్గాలు',
  ridesHeading: 'ప్రతి ప్రయాణానికి',
  ridesHeadingEm: 'ఒక సారథి.',
  ridesLead: 'బుక్ చేసే ముందే ప్రతి రకం తన ధరను చూపిస్తుంది.',
  from: 'నుండి',
  bandEyebrow: 'భద్రత',
  bandHeading: 'మొదటి PIN నుండి',
  bandHeadingEm: 'చివరి స్టాప్ వరకు సురక్షితం.',
};

const es: HomeCopy = {
  eyebrow: 'Ahora en Hyderabad',
  titleTop: 'Conoce la tarifa',
  titleBottom: 'antes de subir.',
  subtitle: 'Indica tu recogida, elige un viaje y ve el precio de antemano.',
  panelTitle: 'Reserva un viaje',
  cta: 'Ver tarifas',
  mapPickup: 'Recogida',
  mapDrop: 'Destino',
  promiseLabel: 'Lo que promete SaaradhiGo',
  promises: [
    { eyebrow: 'Tarifa fija', promise: 'El precio que ves es el que pagas.', detail: 'Sin sorpresas después de reservar.' },
    { eyebrow: 'Saaradhis verificados', promise: 'Cada conductor, revisado y calificado.', detail: 'Identidad verificada antes del primer viaje, calificado tras cada uno.' },
    { eyebrow: 'Seguro cada milla', promise: 'Un PIN, un mapa en vivo, un botón de seguridad.', detail: 'PIN del viaje, seguimiento en vivo y botón de seguridad en cada viaje.' },
  ],
  ridesEyebrow: 'Formas de viajar',
  ridesHeading: 'Un Saaradhi para',
  ridesHeadingEm: 'cada trayecto.',
  ridesLead: 'Cada clase muestra su tarifa antes de reservar.',
  from: 'desde',
  bandEyebrow: 'Seguridad',
  bandHeading: 'Seguro desde el primer PIN',
  bandHeadingEm: 'hasta la última parada.',
};

export const HOME_COPY: Record<Language, HomeCopy> = { en, hi, te, es };
