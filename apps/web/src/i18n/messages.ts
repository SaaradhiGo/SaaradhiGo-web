import type { Locale } from './locales';

/**
 * Every string the public homepage shows, in all five locales.
 *
 * TYPED AND CENTRAL. `Messages` is derived from the English dictionary, so a
 * key added in English and forgotten in Telugu is a compile error rather
 * than an English word surfacing mid-sentence in production.
 *
 * NOT MACHINE-TRANSLATED AT RUNTIME. These are written translations shipped
 * with the build. A runtime translation service would mean every visitor's
 * first paint depends on a third party, and would happily render nonsense
 * into a safety section.
 *
 * WHAT IS DELIBERATELY NOT TRANSLATED: the brand name, the vehicle category
 * identifiers the pricing service uses, and city names as the dispatcher
 * spells them. Translating an API identifier breaks the mapping; translating
 * a brand is not localisation.
 */
const en: {
  nav: Record<'ride' | 'drive' | 'safety' | 'about' | 'help' | 'contact' | 'login' | 'signup' | 'menuOpen' | 'menuClose' | 'language' | 'country', string>;
  hero: Record<'titleTop' | 'titleBottom' | 'subtitle' | 'pickupNow' | 'pickupLabel' | 'pickupPlaceholder' | 'destLabel' | 'destPlaceholder' | 'cta' | 'useLocation' | 'locating' | 'photoPending' | 'photoNeeds' | 'sampleTag', string>;
  validation: Record<'pickupRequired' | 'destRequired' | 'geoDenied' | 'geoUnsupported' | 'searchFailed' | 'searchThrottled', string>;
  rides: Record<'heading' | 'lead' | 'loading' | 'failed' | 'empty', string>;
  rideNames: Record<'auto' | 'mini' | 'sedan' | 'suv', string>;
  rideBlurbs: Record<'auto' | 'mini' | 'sedan' | 'suv', string>;
  steps: Record<'heading' | 's1t' | 's1b' | 's2t' | 's2b' | 's3t' | 's3b', string>;
  drive: Record<'heading' | 'body' | 'cta' | 'photoNeeds', string>;
  safety: Record<'heading' | 'lead' | 'pinT' | 'pinB' | 'trackT' | 'trackB' | 'alertT' | 'alertB', string>;
  apps: Record<'heading' | 'lead' | 'rider' | 'driver' | 'comingSoon', string>;
  closing: Record<'heading' | 'body' | 'cta' | 'support', string>;
  footer: Record<'privacy' | 'terms' | 'rights', string>;
  market: Record<'note', string>;
} = {
  nav: {
    ride: 'Ride',
    drive: 'Drive',
    safety: 'Safety',
    about: 'About',
    help: 'Help',
    contact: 'Contact',
    login: 'Log in',
    signup: 'Sign up',
    menuOpen: 'Open menu',
    menuClose: 'Close menu',
    language: 'Language',
    country: 'Country',
  },
  hero: {
    titleTop: 'Your city.',
    titleBottom: 'Your ride.',
    subtitle: "Wherever you're headed, find a ride that works for you.",
    pickupNow: 'Pickup now',
    pickupLabel: 'Pickup location',
    pickupPlaceholder: 'Enter pickup location',
    destLabel: 'Destination',
    destPlaceholder: 'Where to?',
    cta: 'See ride options',
    useLocation: 'Use my current location',
    locating: 'Finding your location…',
    photoPending: 'Photography pending',
    photoNeeds: 'Licensed photograph: an Indian urban street scene with a passenger and car.',
    sampleTag: 'Sample artwork',
  },
  validation: {
    pickupRequired: 'Enter a pickup location.',
    destRequired: 'Enter a destination.',
    geoDenied: 'We could not read your location. Allow location access, or type a pickup point.',
    geoUnsupported: 'This browser cannot share your location. Type a pickup point instead.',
    searchFailed: 'We could not search just now. Please try again.',
    searchThrottled: 'Too many searches right now. Wait a moment and try again, or sign in to continue.',
  },
  rides: {
    heading: 'Choose your ride',
    lead: 'Every class is priced for your trip before you book.',
    loading: 'Loading ride classes',
    failed: 'We could not load our ride classes just now.',
    empty: 'No ride classes are published yet.',
  },
  rideNames: { auto: 'Auto', mini: 'Mini', sedan: 'Sedan', suv: 'SUV' },
  rideBlurbs: {
    auto: 'A metered three-wheeler for short trips across town.',
    mini: 'A compact car for everyday journeys.',
    sedan: 'More room and boot space for longer drives.',
    suv: 'A larger car for groups travelling together.',
  },
  steps: {
    heading: 'Getting there is simple',
    s1t: 'Enter your destination',
    s1b: 'Choose where you want to go.',
    s2t: 'Choose your ride',
    s2b: 'Compare the available ride options.',
    s3t: 'Confirm and go',
    s3b: 'Review your trip and request your ride.',
  },
  drive: {
    heading: 'Drive with SaaradhiGo',
    body: 'Interested in driving? Learn how to get started with SaaradhiGo.',
    cta: 'Become a driver',
    photoNeeds: 'Licensed photograph: a driver with their vehicle.',
  },
  safety: {
    heading: 'Safety',
    lead: 'Your safety matters. Learn about the safety features and support available during your journey.',
    pinT: 'A PIN starts every ride',
    pinB: 'Your driver cannot start the trip until you give them the four-digit PIN shown on your screen. It is verified on our servers, not in the app.',
    trackT: 'Live trip tracking',
    trackB: "Your driver's position updates on your map for the length of the trip, and the route being travelled is drawn as you go.",
    alertT: 'Alerts reach our operations team',
    alertB: 'A safety alert raised during a ride is delivered to our operations team with the trip and its location attached.',
  },
  apps: {
    heading: "It's easier with the app",
    lead: 'Booking, fares, the ride PIN and live tracking all work in your browser today.',
    rider: 'Rider app',
    driver: 'Driver app',
    comingSoon: 'Coming soon',
  },
  closing: {
    heading: 'Ready to go?',
    body: 'Enter your destination and explore your ride options.',
    cta: 'Book a ride',
    support: 'Contact support',
  },
  footer: {
    privacy: 'Privacy Policy',
    terms: 'Terms of Service',
    rights: 'SaaradhiGo',
  },
  market: {
    note: 'Changing country changes the language and formatting of this site. Ride availability is set by our service areas.',
  },
};

export type Messages = typeof en;

const hi: Messages = {
  nav: {
    ride: 'सवारी',
    drive: 'ड्राइव',
    safety: 'सुरक्षा',
    about: 'हमारे बारे में',
    help: 'सहायता',
    contact: 'संपर्क',
    login: 'लॉग इन',
    signup: 'साइन अप',
    menuOpen: 'मेनू खोलें',
    menuClose: 'मेनू बंद करें',
    language: 'भाषा',
    country: 'देश',
  },
  hero: {
    titleTop: 'आपका शहर।',
    titleBottom: 'आपकी सवारी।',
    subtitle: 'आप जहाँ भी जा रहे हों, अपने लिए सही सवारी चुनें।',
    pickupNow: 'अभी पिकअप',
    pickupLabel: 'पिकअप स्थान',
    pickupPlaceholder: 'पिकअप स्थान दर्ज करें',
    destLabel: 'गंतव्य',
    destPlaceholder: 'कहाँ जाना है?',
    cta: 'सवारी विकल्प देखें',
    useLocation: 'मेरा वर्तमान स्थान उपयोग करें',
    locating: 'आपका स्थान खोजा जा रहा है…',
    photoPending: 'फ़ोटोग्राफ़ी प्रतीक्षित',
    photoNeeds: 'लाइसेंस प्राप्त तस्वीर: यात्री और कार के साथ भारतीय शहरी दृश्य।',
    sampleTag: 'नमूना चित्र',
  },
  validation: {
    pickupRequired: 'पिकअप स्थान दर्ज करें।',
    destRequired: 'गंतव्य दर्ज करें।',
    geoDenied: 'हम आपका स्थान नहीं पढ़ सके। स्थान की अनुमति दें, या पिकअप स्थान टाइप करें।',
    geoUnsupported: 'यह ब्राउज़र आपका स्थान साझा नहीं कर सकता। इसके बजाय पिकअप स्थान टाइप करें।',
    searchFailed: 'अभी खोज नहीं हो सकी। कृपया फिर से प्रयास करें।',
    searchThrottled: 'अभी बहुत अधिक खोजें हो रही हैं। थोड़ी देर बाद प्रयास करें, या जारी रखने के लिए लॉग इन करें।',
  },
  rides: {
    heading: 'अपनी सवारी चुनें',
    lead: 'बुकिंग से पहले हर श्रेणी का किराया आपकी यात्रा के लिए तय होता है।',
    loading: 'सवारी श्रेणियाँ लोड हो रही हैं',
    failed: 'हम अभी सवारी श्रेणियाँ लोड नहीं कर सके।',
    empty: 'अभी कोई सवारी श्रेणी प्रकाशित नहीं है।',
  },
  rideNames: { auto: 'ऑटो', mini: 'मिनी', sedan: 'सेडान', suv: 'एसयूवी' },
  rideBlurbs: {
    auto: 'शहर में छोटी यात्राओं के लिए मीटर वाला तिपहिया।',
    mini: 'रोज़मर्रा की यात्राओं के लिए छोटी कार।',
    sedan: 'लंबी यात्राओं के लिए अधिक जगह और सामान की जगह।',
    suv: 'साथ यात्रा करने वाले समूहों के लिए बड़ी कार।',
  },
  steps: {
    heading: 'वहाँ पहुँचना आसान है',
    s1t: 'अपना गंतव्य दर्ज करें',
    s1b: 'चुनें कि आप कहाँ जाना चाहते हैं।',
    s2t: 'अपनी सवारी चुनें',
    s2b: 'उपलब्ध सवारी विकल्पों की तुलना करें।',
    s3t: 'पुष्टि करें और चलें',
    s3b: 'अपनी यात्रा देखें और सवारी का अनुरोध करें।',
  },
  drive: {
    heading: 'SaaradhiGo के साथ ड्राइव करें',
    body: 'ड्राइविंग में रुचि है? जानें कि SaaradhiGo के साथ शुरुआत कैसे करें।',
    cta: 'ड्राइवर बनें',
    photoNeeds: 'लाइसेंस प्राप्त तस्वीर: अपने वाहन के साथ एक ड्राइवर।',
  },
  safety: {
    heading: 'सुरक्षा',
    lead: 'आपकी सुरक्षा मायने रखती है। यात्रा के दौरान उपलब्ध सुरक्षा सुविधाओं के बारे में जानें।',
    pinT: 'हर सवारी पिन से शुरू होती है',
    pinB: 'जब तक आप अपने ड्राइवर को स्क्रीन पर दिख रहा चार अंकों का पिन नहीं देते, वे यात्रा शुरू नहीं कर सकते। इसकी जाँच हमारे सर्वर पर होती है, ऐप में नहीं।',
    trackT: 'लाइव यात्रा ट्रैकिंग',
    trackB: 'पूरी यात्रा के दौरान आपके मानचित्र पर ड्राइवर की स्थिति अपडेट होती है, और जो रास्ता तय किया जा रहा है वह साथ-साथ खींचा जाता है।',
    alertT: 'अलर्ट हमारी संचालन टीम तक पहुँचते हैं',
    alertB: 'यात्रा के दौरान उठाया गया सुरक्षा अलर्ट यात्रा और उसके स्थान के साथ हमारी संचालन टीम तक पहुँचता है।',
  },
  apps: {
    heading: 'ऐप के साथ यह और आसान है',
    lead: 'बुकिंग, किराया, राइड पिन और लाइव ट्रैकिंग — सब कुछ आज आपके ब्राउज़र में काम करता है।',
    rider: 'राइडर ऐप',
    driver: 'ड्राइवर ऐप',
    comingSoon: 'जल्द आ रहा है',
  },
  closing: {
    heading: 'चलने के लिए तैयार?',
    body: 'अपना गंतव्य दर्ज करें और सवारी विकल्प देखें।',
    cta: 'सवारी बुक करें',
    support: 'सहायता से संपर्क करें',
  },
  footer: { privacy: 'गोपनीयता नीति', terms: 'सेवा की शर्तें', rights: 'SaaradhiGo' },
  market: {
    note: 'देश बदलने से इस साइट की भाषा और प्रारूप बदलते हैं। सवारी की उपलब्धता हमारे सेवा क्षेत्रों से तय होती है।',
  },
};

const te: Messages = {
  nav: {
    ride: 'ప్రయాణం',
    drive: 'డ్రైవ్',
    safety: 'భద్రత',
    about: 'మా గురించి',
    help: 'సహాయం',
    contact: 'సంప్రదించండి',
    login: 'లాగిన్',
    signup: 'సైన్ అప్',
    menuOpen: 'మెనూ తెరవండి',
    menuClose: 'మెనూ మూసివేయండి',
    language: 'భాష',
    country: 'దేశం',
  },
  hero: {
    titleTop: 'మీ నగరం.',
    titleBottom: 'మీ ప్రయాణం.',
    subtitle: 'మీరు ఎక్కడికి వెళ్తున్నా, మీకు సరిపోయే ప్రయాణాన్ని ఎంచుకోండి.',
    pickupNow: 'ఇప్పుడే పికప్',
    pickupLabel: 'పికప్ ప్రదేశం',
    pickupPlaceholder: 'పికప్ ప్రదేశాన్ని నమోదు చేయండి',
    destLabel: 'గమ్యం',
    destPlaceholder: 'ఎక్కడికి?',
    cta: 'ప్రయాణ ఎంపికలు చూడండి',
    useLocation: 'నా ప్రస్తుత ప్రదేశాన్ని ఉపయోగించండి',
    locating: 'మీ ప్రదేశాన్ని కనుగొంటున్నాం…',
    photoPending: 'ఫోటోగ్రఫీ పెండింగ్‌లో ఉంది',
    photoNeeds: 'లైసెన్స్ పొందిన ఫోటో: ప్రయాణికుడు మరియు కారుతో భారతీయ నగర దృశ్యం.',
    sampleTag: 'నమూనా చిత్రం',
  },
  validation: {
    pickupRequired: 'పికప్ ప్రదేశాన్ని నమోదు చేయండి.',
    destRequired: 'గమ్యాన్ని నమోదు చేయండి.',
    geoDenied: 'మీ ప్రదేశాన్ని చదవలేకపోయాం. ప్రదేశ అనుమతి ఇవ్వండి, లేదా పికప్ ప్రదేశాన్ని టైప్ చేయండి.',
    geoUnsupported: 'ఈ బ్రౌజర్ మీ ప్రదేశాన్ని పంచుకోలేదు. బదులుగా పికప్ ప్రదేశాన్ని టైప్ చేయండి.',
    searchFailed: 'ఇప్పుడే వెతకలేకపోయాం. దయచేసి మళ్లీ ప్రయత్నించండి.',
    searchThrottled: 'ప్రస్తుతం చాలా ఎక్కువ శోధనలు జరుగుతున్నాయి. కొద్దిసేపటి తర్వాత ప్రయత్నించండి, లేదా కొనసాగించడానికి లాగిన్ అవ్వండి.',
  },
  rides: {
    heading: 'మీ ప్రయాణాన్ని ఎంచుకోండి',
    lead: 'బుక్ చేసే ముందు ప్రతి తరగతికి మీ ప్రయాణానికి ధర నిర్ణయించబడుతుంది.',
    loading: 'ప్రయాణ తరగతులు లోడ్ అవుతున్నాయి',
    failed: 'ప్రయాణ తరగతులను ఇప్పుడే లోడ్ చేయలేకపోయాం.',
    empty: 'ఇంకా ఏ ప్రయాణ తరగతీ ప్రచురించబడలేదు.',
  },
  rideNames: { auto: 'ఆటో', mini: 'మినీ', sedan: 'సెడాన్', suv: 'ఎస్‌యూవీ' },
  rideBlurbs: {
    auto: 'నగరంలో చిన్న ప్రయాణాలకు మీటర్ ఉన్న ఆటో.',
    mini: 'రోజువారీ ప్రయాణాలకు చిన్న కారు.',
    sedan: 'దూర ప్రయాణాలకు ఎక్కువ స్థలం మరియు సామాను చోటు.',
    suv: 'కలిసి ప్రయాణించే బృందాలకు పెద్ద కారు.',
  },
  steps: {
    heading: 'చేరుకోవడం చాలా సులభం',
    s1t: 'మీ గమ్యాన్ని నమోదు చేయండి',
    s1b: 'మీరు ఎక్కడికి వెళ్లాలనుకుంటున్నారో ఎంచుకోండి.',
    s2t: 'మీ ప్రయాణాన్ని ఎంచుకోండి',
    s2b: 'అందుబాటులో ఉన్న ప్రయాణ ఎంపికలను పోల్చండి.',
    s3t: 'నిర్ధారించి బయలుదేరండి',
    s3b: 'మీ ప్రయాణాన్ని సమీక్షించి ప్రయాణాన్ని అభ్యర్థించండి.',
  },
  drive: {
    heading: 'SaaradhiGoతో డ్రైవ్ చేయండి',
    body: 'డ్రైవింగ్‌పై ఆసక్తి ఉందా? SaaradhiGoతో ఎలా ప్రారంభించాలో తెలుసుకోండి.',
    cta: 'డ్రైవర్ కండి',
    photoNeeds: 'లైసెన్స్ పొందిన ఫోటో: తన వాహనంతో ఒక డ్రైవర్.',
  },
  safety: {
    heading: 'భద్రత',
    lead: 'మీ భద్రత ముఖ్యం. మీ ప్రయాణంలో అందుబాటులో ఉండే భద్రతా సదుపాయాల గురించి తెలుసుకోండి.',
    pinT: 'ప్రతి ప్రయాణం పిన్‌తో మొదలవుతుంది',
    pinB: 'మీ స్క్రీన్‌పై కనిపించే నాలుగు అంకెల పిన్‌ను మీరు ఇచ్చే వరకు డ్రైవర్ ప్రయాణాన్ని ప్రారంభించలేరు. ఇది యాప్‌లో కాదు, మా సర్వర్‌లలో ధృవీకరించబడుతుంది.',
    trackT: 'ప్రత్యక్ష ప్రయాణ ట్రాకింగ్',
    trackB: 'ప్రయాణం పొడవునా మీ మ్యాప్‌లో డ్రైవర్ స్థానం నవీకరించబడుతుంది, మరియు ప్రయాణిస్తున్న మార్గం అప్పటికప్పుడు గీయబడుతుంది.',
    alertT: 'హెచ్చరికలు మా ఆపరేషన్స్ బృందానికి చేరతాయి',
    alertB: 'ప్రయాణంలో లేవనెత్తిన భద్రతా హెచ్చరిక, ప్రయాణం మరియు దాని స్థానంతో కలిపి మా ఆపరేషన్స్ బృందానికి చేరుతుంది.',
  },
  apps: {
    heading: 'యాప్‌తో ఇది మరింత సులభం',
    lead: 'బుకింగ్, ధరలు, రైడ్ పిన్ మరియు ప్రత్యక్ష ట్రాకింగ్ — అన్నీ ఈరోజు మీ బ్రౌజర్‌లో పనిచేస్తాయి.',
    rider: 'ప్రయాణికుల యాప్',
    driver: 'డ్రైవర్ యాప్',
    comingSoon: 'త్వరలో రానుంది',
  },
  closing: {
    heading: 'బయలుదేరడానికి సిద్ధమా?',
    body: 'మీ గమ్యాన్ని నమోదు చేసి ప్రయాణ ఎంపికలను చూడండి.',
    cta: 'ప్రయాణం బుక్ చేయండి',
    support: 'సహాయాన్ని సంప్రదించండి',
  },
  footer: { privacy: 'గోప్యతా విధానం', terms: 'సేవా నిబంధనలు', rights: 'SaaradhiGo' },
  market: {
    note: 'దేశాన్ని మార్చడం ఈ సైట్ భాష మరియు ఫార్మాటింగ్‌ను మారుస్తుంది. ప్రయాణ లభ్యత మా సేవా ప్రాంతాల ద్వారా నిర్ణయించబడుతుంది.',
  },
};

const es: Messages = {
  nav: {
    ride: 'Viajar',
    drive: 'Conducir',
    safety: 'Seguridad',
    about: 'Nosotros',
    help: 'Ayuda',
    contact: 'Contacto',
    login: 'Iniciar sesión',
    signup: 'Registrarse',
    menuOpen: 'Abrir menú',
    menuClose: 'Cerrar menú',
    language: 'Idioma',
    country: 'País',
  },
  hero: {
    titleTop: 'Tu ciudad.',
    titleBottom: 'Tu viaje.',
    subtitle: 'Vayas a donde vayas, encuentra un viaje que se adapte a ti.',
    pickupNow: 'Recogida ahora',
    pickupLabel: 'Lugar de recogida',
    pickupPlaceholder: 'Introduce el lugar de recogida',
    destLabel: 'Destino',
    destPlaceholder: '¿A dónde vas?',
    cta: 'Ver opciones de viaje',
    useLocation: 'Usar mi ubicación actual',
    locating: 'Buscando tu ubicación…',
    photoPending: 'Fotografía pendiente',
    photoNeeds: 'Fotografía con licencia: una escena urbana india con un pasajero y un coche.',
    sampleTag: 'Imagen de muestra',
  },
  validation: {
    pickupRequired: 'Introduce un lugar de recogida.',
    destRequired: 'Introduce un destino.',
    geoDenied: 'No pudimos leer tu ubicación. Permite el acceso a la ubicación o escribe un lugar de recogida.',
    geoUnsupported: 'Este navegador no puede compartir tu ubicación. Escribe un lugar de recogida.',
    searchFailed: 'No pudimos buscar en este momento. Inténtalo de nuevo.',
    searchThrottled: 'Demasiadas búsquedas en este momento. Espera un poco e inténtalo de nuevo, o inicia sesión para continuar.',
  },
  rides: {
    heading: 'Elige tu viaje',
    lead: 'Cada categoría tiene un precio para tu trayecto antes de reservar.',
    loading: 'Cargando categorías de viaje',
    failed: 'No pudimos cargar las categorías de viaje en este momento.',
    empty: 'Todavía no hay categorías de viaje publicadas.',
  },
  rideNames: { auto: 'Auto', mini: 'Mini', sedan: 'Sedán', suv: 'SUV' },
  rideBlurbs: {
    auto: 'Un vehículo de tres ruedas con taxímetro para trayectos cortos.',
    mini: 'Un coche compacto para los viajes del día a día.',
    sedan: 'Más espacio y maletero para trayectos largos.',
    suv: 'Un coche más grande para grupos que viajan juntos.',
  },
  steps: {
    heading: 'Llegar es sencillo',
    s1t: 'Introduce tu destino',
    s1b: 'Elige a dónde quieres ir.',
    s2t: 'Elige tu viaje',
    s2b: 'Compara las opciones de viaje disponibles.',
    s3t: 'Confirma y listo',
    s3b: 'Revisa tu trayecto y solicita tu viaje.',
  },
  drive: {
    heading: 'Conduce con SaaradhiGo',
    body: '¿Te interesa conducir? Descubre cómo empezar con SaaradhiGo.',
    cta: 'Hazte conductor',
    photoNeeds: 'Fotografía con licencia: un conductor con su vehículo.',
  },
  safety: {
    heading: 'Seguridad',
    lead: 'Tu seguridad importa. Conoce las funciones de seguridad y el apoyo disponible durante tu viaje.',
    pinT: 'Un PIN inicia cada viaje',
    pinB: 'Tu conductor no puede iniciar el trayecto hasta que le des el PIN de cuatro dígitos que aparece en tu pantalla. Se verifica en nuestros servidores, no en la aplicación.',
    trackT: 'Seguimiento del viaje en directo',
    trackB: 'La posición de tu conductor se actualiza en tu mapa durante todo el trayecto, y la ruta recorrida se dibuja sobre la marcha.',
    alertT: 'Las alertas llegan a nuestro equipo de operaciones',
    alertB: 'Una alerta de seguridad durante un viaje llega a nuestro equipo de operaciones junto con el trayecto y su ubicación.',
  },
  apps: {
    heading: 'Es más fácil con la aplicación',
    lead: 'Las reservas, las tarifas, el PIN del viaje y el seguimiento en directo funcionan hoy en tu navegador.',
    rider: 'Aplicación para pasajeros',
    driver: 'Aplicación para conductores',
    comingSoon: 'Próximamente',
  },
  closing: {
    heading: '¿Listo para salir?',
    body: 'Introduce tu destino y explora las opciones de viaje.',
    cta: 'Reservar un viaje',
    support: 'Contactar con soporte',
  },
  footer: { privacy: 'Política de privacidad', terms: 'Términos del servicio', rights: 'SaaradhiGo' },
  market: {
    note: 'Cambiar de país cambia el idioma y el formato de este sitio. La disponibilidad de viajes la definen nuestras zonas de servicio.',
  },
};

export const MESSAGES: Record<Locale, Messages> = {
  'en-IN': en,
  'en-US': en,
  'te-IN': te,
  'hi-IN': hi,
  'es-US': es,
};
