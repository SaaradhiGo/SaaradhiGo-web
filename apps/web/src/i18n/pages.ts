import type { Language } from './locales';

/**
 * Body copy for the public pages beyond the homepage.
 *
 * Kept apart from `messages.ts` so the chrome dictionary stays small and a
 * page's prose can be reviewed on its own.
 *
 * EVERY CLAIM HERE WAS CHECKED AGAINST THE CODE. The safety page in
 * particular: the PIN comparison is `str(trip.otp) != str(otp_input)` in the
 * trip consumer, so it really is verified on the server; the driver's
 * position really does broadcast over the trip socket; an SOS really does
 * reach the operations console through `raise_sos` and `dispatch_sos`.
 *
 * What is NOT claimed anywhere, because none of it exists: a staffed
 * round-the-clock desk, an emergency-services partnership, insurance cover,
 * ride audio or video recording, or a background-check programme. A safety
 * page is the worst possible place to round a plan up into a promise.
 */

type Section = { h: string; p: string };
type PageCopy = {
  title: string;
  metaDescription: string;
  lead: string;
  sections: Section[];
  cta?: string;
  /** A secondary action, where the page offers one. */
  cta2?: string;
};

type ContactCopy = PageCopy & {
  emailHeading: string;
  emailBody: string;
  emailHint: string;
  routes: Section[];
  operatorHeading: string;
  operatorBody: string;
  operatorCta: string;
};

export type PagesCopy = {
  ride: PageCopy;
  drive: PageCopy & { needHeading: string; needs: string[] };
  safety: PageCopy & { emergency: string };
  about: PageCopy;
  help: PageCopy & {
    searchLabel: string;
    searchPlaceholder: string;
    noMatch: string;
    faqs: Section[];
    contactHeading: string;
    contactBody: string;
    contactCta: string;
  };
  contact: ContactCopy;
};

const en: PagesCopy = {
  ride: {
    title: 'Riding with SaaradhiGo',
    metaDescription:
      'How booking works on SaaradhiGo: set a pickup and destination, compare fares across vehicle classes, and track your trip with a ride PIN.',
    lead: 'You agree the fare before the trip starts, and that is the fare you pay.',
    sections: [
      { h: 'Set pickup and destination', p: 'Type both places, or use your location.' },
      { h: 'Compare every class', p: 'Each class is priced for your trip.' },
      { h: 'Request and share your PIN', p: 'Only your PIN lets the driver start.' },
      { h: 'Follow the trip live', p: 'See your driver on the map.' },
      { h: 'Pay at the end', p: 'Pay the driver in cash today.' },
    ],
    cta: 'Book a ride',
  },
  drive: {
    title: 'Drive with SaaradhiGo',
    metaDescription:
      'Apply to drive with SaaradhiGo. Upload your licence, registration and insurance, and start accepting trips once your documents are approved.',
    lead: 'Drive when it suits you, and see what a trip pays before you accept it.',
    sections: [
      { h: 'See the fare before you accept', p: 'Every offer shows its fare, so you decide with the number in front of you.' },
      { h: 'Commission shown on every trip', p: 'Each completed trip lists the fare, the commission and what you keep.' },
      { h: 'Paid to UPI or your bank', p: 'Withdraw your earnings from the app to UPI or a bank account.' },
    ],
    needHeading: 'What you need to apply',
    needs: ['A driving licence', 'Your vehicle registration', 'Valid insurance for the vehicle', 'An Auto, Mini, Sedan or SUV'],
    cta: 'Start driving',
    cta2: 'Driver sign in',
  },
  safety: {
    title: 'Safety at SaaradhiGo',
    metaDescription:
      'The safety features running on SaaradhiGo today: a server-verified ride PIN, live trip tracking, and safety alerts that reach our operations team.',
    lead: 'These run on every ride today. Nothing here is planned but unbuilt.',
    sections: [
      { h: 'A PIN starts every ride', p: 'Your driver enters your six-digit PIN to begin. It is checked on our servers, so the trip cannot start without you.' },
      { h: 'Every trip is tracked live', p: 'Your driver’s position and the road travelled show on your map for the whole journey.' },
      { h: 'SOS reaches a person', p: 'An SOS raised during a ride reaches our operations team with the trip and its location attached.' },
      { h: 'Drivers are verified', p: 'Each driver’s licence, registration and insurance are reviewed by our team before their first trip.' },
    ],
    emergency: 'In immediate danger, contact local emergency services first. We do not run a staffed emergency desk, record rides or provide insurance cover.',
  },
  about: {
    title: 'About SaaradhiGo',
    metaDescription:
      'SaaradhiGo is a ride-hailing service built for Indian cities, where the fare is agreed before the trip begins.',
    lead: 'SaaradhiGo is a ride-hailing service built for Indian cities.',
    sections: [
      {
        h: 'The fare is agreed before you travel',
        p: 'Pricing a trip after it has happened puts the rider in a weak position and the driver in an argument. We price the trip first, show it to both sides, and settle on that number.',
      },
      {
        h: 'Built for the cities we actually serve',
        p: 'We started in Telangana and Andhra Pradesh rather than everywhere at once. Vehicle classes, pricing and the way the app behaves follow how people travel in those cities.',
      },
      {
        h: 'Riders and drivers, not just riders',
        p: 'A driver who cannot see what a trip pays before accepting it is being asked to work blind. The same fare is shown to both sides of every trip.',
      },
      {
        h: 'Where we are',
        p: 'We are early. The web booking experience works today, the mobile apps are not published yet, and we would rather say that plainly than imply a larger company than we are.',
      },
    ],
    cta: 'Book a ride',
  },
  help: {
    title: 'Help',
    metaDescription:
      'Get help with a SaaradhiGo ride, your account, payments, safety, or driving with us.',
    lead: 'Find the answer, or reach a person who can help.',
    sections: [],
    searchLabel: 'Search help',
    searchPlaceholder: 'Search the questions',
    noMatch: 'No question matches that. Contact us and a person will help.',
    faqs: [
      { h: 'How do I book a ride?', p: 'Set your pickup and destination on the booking page, then compare the fare for each class before you choose.' },
      { h: 'What if my pickup is outside the service area?', p: 'We tell you before you pick a car.' },
      { h: 'Can I cancel?', p: 'Yes, from the trip screen at any point before the trip starts.' },
      { h: 'What is the ride PIN?', p: 'A six-digit code on your screen. Your driver cannot start the trip until you give it to them.' },
      { h: 'How do I pay?', p: 'Trips are settled in cash with the driver today.' },
      { h: 'How do I create an account?', p: 'Sign up with your email address or mobile number, and confirm it with the code we send.' },
      { h: 'I cannot sign in', p: 'Use the password reset link on the sign-in page.' },
      { h: 'Where are my past trips?', p: 'Under My trips, once you are signed in.' },
      { h: 'How do I apply to drive?', p: 'Apply online with your licence, vehicle registration and insurance. They are reviewed before your first trip.' },
      { h: 'What happens when I raise an SOS?', p: 'It reaches our operations team with the trip attached. In immediate danger, contact local emergency services first.' },
    ],
    contactHeading: 'Still need help?',
    contactBody: 'Write to us and a person will reply.',
    contactCta: 'Contact us',
  },
  contact: {
    title: 'Contact us',
    metaDescription:
      'Get help with a ride, a payment or a driver application. Reach the SaaradhiGo support team.',
    lead: 'We would rather you reached a person than a form. Here is the quickest way to get the right one.',
    sections: [],
    emailHeading: 'Email',
    emailBody: 'Support, payments and driver applications:',
    emailHint: 'Include your registered mobile number and, if it is about a trip, the date and the driver’s name. It saves a round trip.',
    routes: [
      {
        h: 'A problem with a ride you took',
        p: 'Raise it from your account, under Help, so it arrives attached to the trip. That is the fastest route, because support can see the ride.',
      },
      {
        h: 'Payments and receipts',
        p: 'Email us with the trip date and the driver name. Your trip history has both.',
      },
      {
        h: 'Driving with us',
        p: 'If your application is stuck or a document was rejected, email us from the address you applied with.',
      },
      {
        h: 'A safety concern',
        p: 'If you are in immediate danger, contact the local emergency services first. Then tell us, so we can act on the account.',
      },
    ],
    operatorHeading: 'Are you an operator?',
    operatorBody: 'The operations console is a separate, internal application.',
    operatorCta: 'Operator sign-in',
  },
};

const hi: PagesCopy = {
  ride: {
    title: 'SaaradhiGo के साथ सवारी',
    metaDescription: 'SaaradhiGo पर बुकिंग कैसे काम करती है: पिकअप और गंतव्य चुनें, श्रेणियों के किराए की तुलना करें, और राइड पिन के साथ अपनी यात्रा ट्रैक करें।',
    lead: 'यात्रा शुरू होने से पहले किराया तय हो जाता है, और वही किराया आप देते हैं।',
    sections: [
      { h: 'पिकअप और गंतव्य चुनें', p: 'दोनों जगहें लिखें, या अपनी मौजूदा लोकेशन चुनें।' },
      { h: 'हर श्रेणी की तुलना करें', p: 'हर श्रेणी का किराया आपकी यात्रा के लिए।' },
      { h: 'अनुरोध करें, पिन बताएँ', p: 'आपके पिन से ही ड्राइवर शुरू कर सकता है।' },
      { h: 'यात्रा लाइव देखें', p: 'पहुँचने तक ड्राइवर को मैप पर देखें।' },
      { h: 'अंत में भुगतान करें', p: 'फ़िलहाल ड्राइवर को नकद भुगतान करें।' },
    ],
    cta: 'सवारी बुक करें',
  },
  drive: {
    title: 'SaaradhiGo के साथ ड्राइव करें',
    metaDescription: 'SaaradhiGo के साथ ड्राइव करने के लिए आवेदन करें। लाइसेंस, पंजीकरण और बीमा अपलोड करें, और दस्तावेज़ स्वीकृत होते ही यात्राएँ लेना शुरू करें।',
    lead: 'जब सुविधा हो तब ड्राइव करें, और स्वीकार करने से पहले देखें कि यात्रा से कितना मिलेगा।',
    sections: [
      { h: 'स्वीकार करने से पहले किराया देखें', p: 'हर ऑफ़र अपना किराया दिखाता है, ताकि आप रकम सामने देखकर तय करें।' },
      { h: 'हर यात्रा पर कमीशन दिखता है', p: 'हर पूरी यात्रा में किराया, कमीशन और आपकी कमाई अलग-अलग दिखती है।' },
      { h: 'UPI या बैंक में भुगतान', p: 'ऐप से अपनी कमाई UPI या बैंक खाते में निकालें।' },
    ],
    needHeading: 'आवेदन के लिए क्या चाहिए',
    needs: ['ड्राइविंग लाइसेंस', 'वाहन का पंजीकरण', 'वाहन का वैध बीमा', 'ऑटो, मिनी, सेडान या SUV'],
    cta: 'ड्राइविंग शुरू करें',
    cta2: 'ड्राइवर साइन इन',
  },
  safety: {
    title: 'SaaradhiGo पर सुरक्षा',
    metaDescription: 'SaaradhiGo पर आज चल रही सुरक्षा सुविधाएँ: सर्वर पर जाँचा जाने वाला राइड पिन, लाइव ट्रिप ट्रैकिंग, और संचालन टीम तक पहुँचने वाले सुरक्षा अलर्ट।',
    lead: 'ये आज हर यात्रा पर चलती हैं। योजना में पर अधूरी कोई चीज़ यहाँ नहीं है।',
    sections: [
      { h: 'हर यात्रा पिन से शुरू होती है', p: 'ड्राइवर शुरू करने के लिए आपका छह अंकों का पिन डालता है। इसकी जाँच हमारे सर्वर पर होती है, इसलिए आपके बिना यात्रा शुरू नहीं हो सकती।' },
      { h: 'हर यात्रा लाइव ट्रैक होती है', p: 'पूरी यात्रा के दौरान ड्राइवर की स्थिति और तय किया गया रास्ता आपके मैप पर दिखता है।' },
      { h: 'SOS एक व्यक्ति तक पहुँचता है', p: 'यात्रा के दौरान भेजा गया SOS यात्रा और उसकी लोकेशन के साथ हमारी ऑपरेशंस टीम तक पहुँचता है।' },
      { h: 'ड्राइवर सत्यापित होते हैं', p: 'पहली यात्रा से पहले हमारी टीम हर ड्राइवर का लाइसेंस, पंजीकरण और बीमा जाँचती है।' },
    ],
    emergency: 'तत्काल खतरे में पहले स्थानीय आपातकालीन सेवाओं से संपर्क करें। हम कोई आपातकालीन डेस्क नहीं चलाते, यात्राएँ रिकॉर्ड नहीं करते और बीमा नहीं देते।',
  },
  about: {
    title: 'SaaradhiGo के बारे में',
    metaDescription: 'SaaradhiGo भारतीय शहरों के लिए बनी राइड-हेलिंग सेवा है, जहाँ यात्रा शुरू होने से पहले किराया तय हो जाता है।',
    lead: 'SaaradhiGo भारतीय शहरों के लिए बनी एक राइड-हेलिंग सेवा है।',
    sections: [
      { h: 'यात्रा से पहले किराया तय', p: 'यात्रा के बाद कीमत तय करना सवार को कमज़ोर स्थिति में और ड्राइवर को बहस में डालता है। हम पहले किराया तय करते हैं, दोनों को दिखाते हैं, और उसी पर हिसाब होता है।' },
      { h: 'उन्हीं शहरों के लिए जहाँ हम हैं', p: 'हमने हर जगह एक साथ नहीं, तेलंगाना और आंध्र प्रदेश से शुरुआत की। वाहन श्रेणियाँ, क़ीमतें और ऐप का व्यवहार इन्हीं शहरों की यात्रा के तरीक़ों पर आधारित हैं।' },
      { h: 'सवार और ड्राइवर, दोनों', p: 'जिस ड्राइवर को स्वीकार करने से पहले किराया न दिखे, उससे अंधेरे में काम कराया जा रहा है। हर यात्रा का वही किराया दोनों पक्षों को दिखता है।' },
      { h: 'हम कहाँ हैं', p: 'हम शुरुआती दौर में हैं। वेब पर बुकिंग आज काम करती है, मोबाइल ऐप अभी प्रकाशित नहीं हैं, और हम ख़ुद को बड़ा दिखाने के बजाय यह साफ़ कहना बेहतर समझते हैं।' },
    ],
    cta: 'सवारी बुक करें',
  },
  help: {
    title: 'सहायता',
    metaDescription: 'SaaradhiGo की सवारी, खाते, भुगतान, सुरक्षा या ड्राइविंग से जुड़ी सहायता पाएँ।',
    lead: 'उत्तर खोजें, या किसी व्यक्ति तक पहुँचें जो मदद कर सके।',
    sections: [],
    searchLabel: 'सहायता खोजें',
    searchPlaceholder: 'सवाल खोजें',
    noMatch: 'इससे मेल खाता कोई सवाल नहीं मिला। हमसे संपर्क करें, कोई व्यक्ति मदद करेगा।',
    faqs: [
      { h: 'सवारी कैसे बुक करें?', p: 'बुकिंग पेज पर पिकअप और गंतव्य चुनें, फिर चुनने से पहले हर श्रेणी का किराया देखें।' },
      { h: 'अगर मेरा पिकअप सेवा क्षेत्र से बाहर हो?', p: 'कार चुनने से पहले ही हम आपको बता देते हैं।' },
      { h: 'क्या मैं रद्द कर सकता हूँ?', p: 'हाँ, यात्रा शुरू होने से पहले कभी भी ट्रिप स्क्रीन से।' },
      { h: 'राइड पिन क्या है?', p: 'आपकी स्क्रीन पर छह अंकों का कोड। जब तक आप इसे नहीं देते, ड्राइवर यात्रा शुरू नहीं कर सकता।' },
      { h: 'भुगतान कैसे करें?', p: 'फ़िलहाल यात्रा का भुगतान ड्राइवर को नकद होता है।' },
      { h: 'खाता कैसे बनाएँ?', p: 'अपने ईमेल या मोबाइल नंबर से साइन अप करें और हमारे भेजे कोड से पुष्टि करें।' },
      { h: 'मैं साइन इन नहीं कर पा रहा', p: 'साइन-इन पेज पर पासवर्ड रीसेट लिंक का उपयोग करें।' },
      { h: 'मेरी पिछली यात्राएँ कहाँ हैं?', p: 'साइन इन करने के बाद "मेरी यात्राएँ" में।' },
      { h: 'ड्राइव करने के लिए आवेदन कैसे करें?', p: 'लाइसेंस, वाहन पंजीकरण और बीमा के साथ ऑनलाइन आवेदन करें। पहली यात्रा से पहले इनकी जाँच होती है।' },
      { h: 'SOS भेजने पर क्या होता है?', p: 'यह यात्रा के साथ हमारी ऑपरेशंस टीम तक पहुँचता है। तत्काल खतरे में पहले स्थानीय आपातकालीन सेवाओं से संपर्क करें।' },
    ],
    contactHeading: 'अब भी मदद चाहिए?',
    contactBody: 'हमें लिखें, कोई व्यक्ति जवाब देगा।',
    contactCta: 'संपर्क करें',
  },
  contact: {
    title: 'संपर्क करें',
    metaDescription: 'किसी यात्रा, भुगतान या ड्राइवर आवेदन में सहायता पाने के लिई SaaradhiGo सहायता टीम तक पहुँचें।',
    lead: 'हम चाहते हैं कि आप किसी प्रपत्र तक नहीं, किसी व्यक्ति तक पहुँचें। सही व्यक्ति तक पहुँचने का सबसे तेज़ तरीका यह है।',
    sections: [],
    emailHeading: 'ईमेल',
    emailBody: 'सहायता, भुगतान और ड्राइवर आवेदन:',
    emailHint: 'अपना पंजीकृत मोबाइल नंबर लिखें, और यदि बात यात्रा की है तो तारीख़ और ड्राइवर का नाम भी। इससे समय बचता है।',
    routes: [
      { h: 'पिछली यात्रा से जुड़ी समस्या', p: 'अपने खाते में सहायता से इसे दर्ज करें, ताकि यह यात्रा के साथ जुड़कर पहुँचे। यह सबसे तेज़ रास्ता है, क्योंकि टीम यात्रा देख सकती है।' },
      { h: 'भुगतान और रसीदें', p: 'यात्रा की तारीख़ और ड्राइवर का नाम लिखकर ईमेल करें। दोनों आपके यात्रा इतिहास में हैं।' },
      { h: 'हमारे साथ ड्राइविंग', p: 'आवेदन अटक गया हो या कोई दस्तावेज़ अस्वीकृत हुआ हो, तो जिस पते से आवेदन किया था उसी से ईमेल करें।' },
      { h: 'सुरक्षा से जुड़ी चिंता', p: 'तत्काल ख़तरे में पहले स्थानीय आपातकालीन सेवाओं से संपर्क करें। उसके बाद हमें बताएं, ताकि हम खाते पर कार्रवाई कर सकें।' },
    ],
    operatorHeading: 'क्या आप ऑपरेटर हैं?',
    operatorBody: 'ऑपरेशंस कंसोल अलग, आंतरिक अनुप्रयोग है।',
    operatorCta: 'ऑपरेटर साइन इन',
  },
};

const te: PagesCopy = {
  ride: {
    title: 'SaaradhiGoతో ప్రయాణం',
    metaDescription: 'SaaradhiGoలో బుకింగ్ ఎలా పనిచేస్తుంది: పికప్ మరియు గమ్యం ఎంచుకోండి, తరగతుల ధరలను పోల్చండి, రైడ్ పిన్‌తో మీ ప్రయాణాన్ని ట్రాక్ చేయండి.',
    lead: 'ప్రయాణం మొదలయ్యే ముందే ధర ఖరారవుతుంది, అదే మీరు చెల్లిస్తారు.',
    sections: [
      { h: 'పికప్, గమ్యం ఎంచుకోండి', p: 'రెండు చోట్లనూ టైప్ చేయండి, లేదా మీ ప్రస్తుత ప్రదేశం వాడండి.' },
      { h: 'ప్రతి తరగతిని పోల్చండి', p: 'ప్రతి తరగతికి మీ ప్రయాణానికే ధర నిర్ణయిస్తాం.' },
      { h: 'అభ్యర్థించి, పిన్ ఇవ్వండి', p: 'మీ పిన్‌తోనే డ్రైవర్ మొదలుపెడతారు.' },
      { h: 'ప్రయాణాన్ని ప్రత్యక్షంగా చూడండి', p: 'డ్రైవర్‌ను మ్యాప్‌లో చూడండి.' },
      { h: 'చివర్లో చెల్లించండి', p: 'ప్రస్తుతం డ్రైవర్‌కు నగదుగా చెల్లించండి.' },
    ],
    cta: 'ప్రయాణం బుక్ చేయండి',
  },
  drive: {
    title: 'SaaradhiGoతో డ్రైవ్ చేయండి',
    metaDescription: 'SaaradhiGoతో డ్రైవ్ చేయడానికి దరఖాస్తు చేయండి. లైసెన్స్, రిజిస్ట్రేషన్, బీమా అప్‌లోడ్ చేసి, పత్రాలు ఆమోదం పొందగానే ప్రయాణాలు స్వీకరించడం మొదలుపెట్టండి.',
    lead: 'మీకు అనుకూలమైనప్పుడు డ్రైవ్ చేయండి, స్వీకరించే ముందు ప్రయాణం ఎంత ఇస్తుందో చూడండి.',
    sections: [
      { h: 'స్వీకరించే ముందు ధర చూడండి', p: 'ప్రతి ఆఫర్ దాని ధరను చూపుతుంది, సంఖ్య మీ ముందుండగానే నిర్ణయించుకోండి.' },
      { h: 'ప్రతి ప్రయాణంలో కమిషన్ కనిపిస్తుంది', p: 'పూర్తైన ప్రతి ప్రయాణంలో ధర, కమిషన్, మీకు మిగిలేది చూపిస్తాం.' },
      { h: 'UPI లేదా బ్యాంకుకు చెల్లింపు', p: 'యాప్ నుంచి మీ ఆదాయాన్ని UPI లేదా బ్యాంక్ ఖాతాకు తీసుకోండి.' },
    ],
    needHeading: 'దరఖాస్తుకు కావలసినవి',
    needs: ['డ్రైవింగ్ లైసెన్స్', 'వాహన రిజిస్ట్రేషన్', 'వాహనానికి చెల్లుబాటు అయ్యే బీమా', 'ఆటో, మినీ, సెడాన్ లేదా SUV'],
    cta: 'డ్రైవింగ్ మొదలుపెట్టండి',
    cta2: 'డ్రైవర్ సైన్ ఇన్',
  },
  safety: {
    title: 'SaaradhiGoలో భద్రత',
    metaDescription: 'SaaradhiGoలో ఈరోజు పనిచేస్తున్న భద్రతా సదుపాయాలు: సర్వర్‌లో ధృవీకరించే రైడ్ పిన్, ప్రత్యక్ష ప్రయాణ ట్రాకింగ్, ఆపరేషన్స్ బృందానికి చేరే భద్రతా హెచ్చరికలు.',
    lead: 'ఇవి ఈరోజు ప్రతి ప్రయాణంలో పనిచేస్తాయి. ప్రణాళికలో ఉండి నిర్మించనిది ఇక్కడ లేదు.',
    sections: [
      { h: 'ప్రతి ప్రయాణం పిన్‌తో మొదలవుతుంది', p: 'మొదలుపెట్టడానికి డ్రైవర్ మీ ఆరు అంకెల పిన్ నమోదు చేయాలి. అది మా సర్వర్‌లలో తనిఖీ అవుతుంది, కాబట్టి మీరు లేకుండా ప్రయాణం మొదలవ్వదు.' },
      { h: 'ప్రతి ప్రయాణం ప్రత్యక్షంగా ట్రాక్ అవుతుంది', p: 'ప్రయాణం పొడవునా డ్రైవర్ స్థానం, ప్రయాణించిన దారి మీ మ్యాప్‌లో కనిపిస్తాయి.' },
      { h: 'SOS ఒక వ్యక్తికి చేరుతుంది', p: 'ప్రయాణంలో పంపిన SOS ప్రయాణం, దాని స్థానంతో కలిపి మా ఆపరేషన్స్ బృందానికి చేరుతుంది.' },
      { h: 'డ్రైవర్లు ధృవీకరించబడతారు', p: 'మొదటి ప్రయాణానికి ముందు ప్రతి డ్రైవర్ లైసెన్స్, రిజిస్ట్రేషన్, బీమాను మా బృందం పరిశీలిస్తుంది.' },
    ],
    emergency: 'తక్షణ ప్రమాదంలో ముందుగా స్థానిక అత్యవసర సేవలను సంప్రదించండి. మేము అత్యవసర డెస్క్ నడపం, ప్రయాణాలను రికార్డ్ చేయం, బీమా ఇవ్వం.',
  },
  about: {
    title: 'SaaradhiGo గురించి',
    metaDescription: 'SaaradhiGo భారతీయ నగరాల కోసం నిర్మించిన రైడ్-హెయిలింగ్ సేవ, ఇక్కడ ప్రయాణం మొదలయ్యే ముందే ధర ఖరారవుతుంది.',
    lead: 'SaaradhiGo భారతీయ నగరాల కోసం నిర్మించిన రైడ్-హెయిలింగ్ సేవ.',
    sections: [
      { h: 'ప్రయాణానికి ముందే ధర ఖరారు', p: 'ప్రయాణం జరిగాక ధర నిర్ణయించడం ప్రయాణికుడిని బలహీన స్థితిలో, డ్రైవర్‌ను వాదనలో పెడుతుంది. మేము ముందే ధర నిర్ణయించి, ఇద్దరికీ చూపించి, దానిపైనే లెక్క చేస్తాం.' },
      { h: 'మేము నిజంగా సేవలందించే నగరాల కోసం', p: 'అన్నిచోట్లా ఒకేసారి కాకుండా తెలంగాణ, ఆంధ్రప్రదేశ్‌తో మొదలుపెట్టాం. వాహన తరగతులు, ధరలు, యాప్ ప్రవర్తన ఆ నగరాల్లో ప్రజలు ప్రయాణించే తీరును అనుసరిస్తాయి.' },
      { h: 'ప్రయాణికులు, డ్రైవర్లు — ఇద్దరూ', p: 'స్వీకరించే ముందు ప్రయాణం ఎంత ఇస్తుందో చూడలేని డ్రైవర్‌ను చీకటిలో పని చేయమని అడుగుతున్నట్టే. ప్రతి ప్రయాణపు అదే ధర ఇద్దరికీ కనిపిస్తుంది.' },
      { h: 'మేము ఎక్కడ ఉన్నాం', p: 'మేము ప్రారంభ దశలో ఉన్నాం. వెబ్ బుకింగ్ ఈరోజు పనిచేస్తుంది, మొబైల్ యాప్‌లు ఇంకా ప్రచురించలేదు, మమ్మల్ని పెద్దగా చూపించుకోవడం కంటే దీన్ని స్పష్టంగా చెప్పడమే మేలని భావిస్తాం.' },
    ],
    cta: 'ప్రయాణం బుక్ చేయండి',
  },
  help: {
    title: 'సహాయం',
    metaDescription: 'SaaradhiGo ప్రయాణం, ఖాతా, చెల్లింపులు, భద్రత లేదా మాతో డ్రైవింగ్ గురించి సహాయం పొందండి.',
    lead: 'సమాధానం కనుగొనండి, లేదా సహాయం చేయగల వ్యక్తిని సంప్రదించండి.',
    sections: [],
    searchLabel: 'సహాయంలో వెతకండి',
    searchPlaceholder: 'ప్రశ్నలలో వెతకండి',
    noMatch: 'దీనికి సరిపోయే ప్రశ్న లేదు. మమ్మల్ని సంప్రదించండి, ఒక వ్యక్తి సహాయం చేస్తారు.',
    faqs: [
      { h: 'ప్రయాణం ఎలా బుక్ చేయాలి?', p: 'బుకింగ్ పేజీలో పికప్, గమ్యం ఎంచుకోండి, ఆపై ఎంచుకునే ముందు ప్రతి తరగతి ధరను పోల్చండి.' },
      { h: 'నా పికప్ సేవా ప్రాంతం వెలుపల ఉంటే?', p: 'కారు ఎంచుకునే ముందే మీకు చెబుతాం.' },
      { h: 'నేను రద్దు చేయవచ్చా?', p: 'అవును, ప్రయాణం మొదలవ్వక ముందు ఎప్పుడైనా ట్రిప్ స్క్రీన్ నుంచి.' },
      { h: 'రైడ్ పిన్ అంటే ఏమిటి?', p: 'మీ స్క్రీన్‌పై ఆరు అంకెల కోడ్. మీరు ఇచ్చే వరకు డ్రైవర్ ప్రయాణం మొదలుపెట్టలేరు.' },
      { h: 'ఎలా చెల్లించాలి?', p: 'ప్రస్తుతం ప్రయాణాలు డ్రైవర్‌కు నగదుగా చెల్లించబడతాయి.' },
      { h: 'ఖాతా ఎలా సృష్టించాలి?', p: 'మీ ఇమెయిల్ లేదా మొబైల్ నంబర్‌తో సైన్ అప్ చేసి, మేము పంపే కోడ్‌తో ధృవీకరించండి.' },
      { h: 'నేను సైన్ ఇన్ చేయలేకపోతున్నాను', p: 'సైన్-ఇన్ పేజీలోని పాస్‌వర్డ్ రీసెట్ లింక్ ఉపయోగించండి.' },
      { h: 'నా గత ప్రయాణాలు ఎక్కడ?', p: 'సైన్ ఇన్ అయ్యాక "నా ప్రయాణాలు"లో.' },
      { h: 'డ్రైవ్ చేయడానికి ఎలా దరఖాస్తు చేయాలి?', p: 'లైసెన్స్, వాహన రిజిస్ట్రేషన్, బీమాతో ఆన్‌లైన్‌లో దరఖాస్తు చేయండి. మొదటి ప్రయాణానికి ముందు వాటిని పరిశీలిస్తాం.' },
      { h: 'SOS పంపితే ఏమవుతుంది?', p: 'అది ప్రయాణంతో కలిపి మా ఆపరేషన్స్ బృందానికి చేరుతుంది. తక్షణ ప్రమాదంలో ముందుగా స్థానిక అత్యవసర సేవలను సంప్రదించండి.' },
    ],
    contactHeading: 'ఇంకా సహాయం కావాలా?',
    contactBody: 'మాకు రాయండి, ఒక వ్యక్తి జవాబిస్తారు.',
    contactCta: 'మమ్మల్ని సంప్రదించండి',
  },
  contact: {
    title: 'మమ్మని సంప్రదించండి',
    metaDescription: 'ప్రయాణం, చెల్లింపు లేదా డ్రైవర్ దరఖాస్తు గురించి సహాయం కోసం SaaradhiGo సహాయ బృందాన్ని సంప్రదించండి.',
    lead: 'మీరు ప్రపత్రం నింపడం కంటే మనిషితో మాట్లాడాలని మేము కోరుకుంటాము. సరియైన వ్యక్తిని చేరుకోవడానికి వేగవంతమైన దారి ఇది.',
    sections: [],
    emailHeading: 'ఈమెయిల్',
    emailBody: 'సహాయం, చెల్లింపులు మరియు డ్రైవర్ దరఖాస్తులు:',
    emailHint: 'మీ నమోదిత మొబైల్ నంబరు, ప్రయాణం గురించినాయితే తేదీ మరియు డ్రైవర్ పేరు జత చేయండి. ఇది సమయం ఆదా చేస్తుంది.',
    routes: [
      { h: 'మీరు చేసిన ప్రయాణంలో సమస్య', p: 'మీ ఖాతాలో సహాయం నుంచి దాన్ని నమోదు చేయండి, అప్పుడు అది ప్రయాణంతో కలిపి చేరుతుంది. బృందం ప్రయాణాన్ని చూడగలదు కాబట్టి ఇదే వేగవంతమైన మార్గం.' },
      { h: 'చెల్లింపులు, రసీదులు', p: 'ప్రయాణ తేదీ, డ్రైవర్ పేరుతో ఈమెయిల్ చేయండి. రెండూ మీ ప్రయాణ చరిత్రలో ఉంటాయి.' },
      { h: 'మాతో డ్రైవింగ్', p: 'దరఖాస్తు ఆగిపోయినా, పత్రం తిరస్కరింపబడినా, దరఖాస్తు చేసిన చిరునామా నుంచి ఈమెయిల్ చేయండి.' },
      { h: 'భద్రతా సమస్య', p: 'తక్షణ ప్రమాదంలో ముందుగా స్థానిక అత్యవసర సేవలను సంప్రదించండి. ఆ తర్వాత మాకు చెప్పండి, ఖాతాపై చర్య తీసుకోగలం.' },
    ],
    operatorHeading: 'మీరు ఆపరేటరా?',
    operatorBody: 'ఆపరేషన్స్ కన్సోల్ వేరు, అంతర్గత అప్లికేషన్.',
    operatorCta: 'ఆపరేటర్ సైన్ ఇన్',
  },
};

const es: PagesCopy = {
  ride: {
    title: 'Viajar con SaaradhiGo',
    metaDescription: 'Cómo funcionan las reservas en SaaradhiGo: indica recogida y destino, compara tarifas entre categorías y sigue tu viaje con un PIN.',
    lead: 'La tarifa se acuerda antes de empezar el viaje, y esa es la que pagas.',
    sections: [
      { h: 'Elige recogida y destino', p: 'Escribe los dos lugares o usa tu ubicación.' },
      { h: 'Compara todas las clases', p: 'Cada clase tiene precio para tu viaje exacto.' },
      { h: 'Solicita y comparte tu PIN', p: 'Solo tu PIN permite empezar el viaje.' },
      { h: 'Sigue el viaje en directo', p: 'Ve a tu conductor en el mapa.' },
      { h: 'Paga al final', p: 'Hoy se paga al conductor en efectivo.' },
    ],
    cta: 'Reservar un viaje',
  },
  drive: {
    title: 'Conduce con SaaradhiGo',
    metaDescription: 'Solicita conducir con SaaradhiGo. Sube tu permiso, el registro del vehículo y el seguro, y empieza a aceptar viajes cuando se aprueben.',
    lead: 'Conduce cuando te venga bien y mira lo que paga un viaje antes de aceptarlo.',
    sections: [
      { h: 'Ve la tarifa antes de aceptar', p: 'Cada oferta muestra su tarifa, así decides con la cifra delante.' },
      { h: 'La comisión, en cada viaje', p: 'Cada viaje completado muestra la tarifa, la comisión y lo que te queda.' },
      { h: 'Cobra por UPI o en tu banco', p: 'Retira tus ganancias desde la aplicación a UPI o a una cuenta bancaria.' },
    ],
    needHeading: 'Qué necesitas para solicitarlo',
    needs: ['Un permiso de conducir', 'El registro del vehículo', 'Un seguro vigente del vehículo', 'Un Auto, Mini, Sedán o SUV'],
    cta: 'Empieza a conducir',
    cta2: 'Acceso para conductores',
  },
  safety: {
    title: 'Seguridad en SaaradhiGo',
    metaDescription: 'Las funciones de seguridad activas hoy en SaaradhiGo: un PIN verificado en el servidor, seguimiento del viaje en directo y alertas que llegan a operaciones.',
    lead: 'Esto funciona hoy en cada viaje. Aquí no hay nada planeado y sin construir.',
    sections: [
      { h: 'Un PIN inicia cada viaje', p: 'Tu conductor introduce tu PIN de seis dígitos para empezar. Se comprueba en nuestros servidores, así que el viaje no puede empezar sin ti.' },
      { h: 'Cada viaje se sigue en directo', p: 'La posición de tu conductor y el camino recorrido se ven en tu mapa durante todo el trayecto.' },
      { h: 'El SOS llega a una persona', p: 'Un SOS enviado durante un viaje llega a nuestro equipo de operaciones con el viaje y su ubicación.' },
      { h: 'Conductores verificados', p: 'Nuestro equipo revisa el permiso, el registro y el seguro de cada conductor antes de su primer viaje.' },
    ],
    emergency: 'Ante un peligro inmediato, contacta primero con los servicios de emergencia locales. No tenemos un centro de emergencias atendido, no grabamos los viajes ni ofrecemos seguro.',
  },
  about: {
    title: 'Sobre SaaradhiGo',
    metaDescription: 'SaaradhiGo es un servicio de transporte con conductor creado para ciudades de la India, donde la tarifa se acuerda antes de empezar el viaje.',
    lead: 'SaaradhiGo es un servicio de transporte con conductor creado para ciudades de la India.',
    sections: [
      { h: 'La tarifa se acuerda antes de viajar', p: 'Poner precio a un viaje después de hacerlo deja al pasajero en desventaja y al conductor en una discusión. Nosotros tarificamos primero, lo mostramos a ambas partes y liquidamos con esa cifra.' },
      { h: 'Hecho para las ciudades en las que operamos', p: 'Empezamos en Telangana y Andhra Pradesh, no en todas partes a la vez. Las categorías, los precios y el comportamiento de la aplicación siguen cómo se viaja en esas ciudades.' },
      { h: 'Pasajeros y conductores', p: 'Un conductor que no puede ver lo que paga un viaje antes de aceptarlo está trabajando a ciegas. La misma tarifa se muestra a ambas partes.' },
      { h: 'Dónde estamos', p: 'Estamos empezando. La reserva web funciona hoy, las aplicaciones móviles aún no están publicadas, y preferimos decirlo claramente antes que aparentar una empresa más grande.' },
    ],
    cta: 'Reservar un viaje',
  },
  help: {
    title: 'Ayuda',
    metaDescription: 'Obtén ayuda con un viaje de SaaradhiGo, tu cuenta, los pagos, la seguridad o conducir con nosotros.',
    lead: 'Encuentra la respuesta o contacta con una persona que pueda ayudarte.',
    sections: [],
    searchLabel: 'Buscar en la ayuda',
    searchPlaceholder: 'Busca entre las preguntas',
    noMatch: 'Ninguna pregunta coincide. Escríbenos y te ayudará una persona.',
    faqs: [
      { h: '¿Cómo reservo un viaje?', p: 'Elige recogida y destino en la página de reserva y compara la tarifa de cada clase antes de elegir.' },
      { h: '¿Y si mi recogida está fuera de la zona de servicio?', p: 'Te lo decimos antes de que elijas un coche.' },
      { h: '¿Puedo cancelar?', p: 'Sí, desde la pantalla del viaje en cualquier momento antes de que empiece.' },
      { h: '¿Qué es el PIN del viaje?', p: 'Un código de seis dígitos en tu pantalla. Tu conductor no puede empezar el viaje hasta que se lo des.' },
      { h: '¿Cómo pago?', p: 'Hoy los viajes se pagan al conductor en efectivo.' },
      { h: '¿Cómo creo una cuenta?', p: 'Regístrate con tu correo o tu número de móvil y confírmalo con el código que te enviamos.' },
      { h: 'No puedo iniciar sesión', p: 'Usa el enlace para restablecer la contraseña en la página de inicio de sesión.' },
      { h: '¿Dónde están mis viajes anteriores?', p: 'En Mis viajes, después de iniciar sesión.' },
      { h: '¿Cómo solicito conducir?', p: 'Solicítalo en línea con tu permiso, el registro del vehículo y el seguro. Se revisan antes de tu primer viaje.' },
      { h: '¿Qué pasa al enviar un SOS?', p: 'Llega a nuestro equipo de operaciones con el viaje adjunto. Ante un peligro inmediato, contacta primero con los servicios de emergencia locales.' },
    ],
    contactHeading: '¿Aún necesitas ayuda?',
    contactBody: 'Escríbenos y te responderá una persona.',
    contactCta: 'Contáctanos',
  },
  contact: {
    title: 'Contacto',
    metaDescription:
      'Obtén ayuda con un viaje, un pago o una solicitud de conductor. Contacta con el equipo de SaaradhiGo.',
    lead: 'Preferimos que hables con una persona antes que con un formulario. Esta es la forma más rápida de dar con la adecuada.',
    sections: [],
    emailHeading: 'Correo',
    emailBody: 'Soporte, pagos y solicitudes de conductor:',
    emailHint: 'Incluye tu número de móvil registrado y, si es sobre un viaje, la fecha y el nombre del conductor. Ahorra una ida y vuelta.',
    routes: [
      { h: 'Un problema con un viaje que hiciste', p: 'Plántealo desde tu cuenta, en Ayuda, para que llegue asociado al viaje. Es la vía más rápida, porque soporte puede ver el trayecto.' },
      { h: 'Pagos y recibos', p: 'Escríbenos con la fecha del viaje y el nombre del conductor. Tu historial tiene ambos datos.' },
      { h: 'Conducir con nosotros', p: 'Si tu solicitud está parada o se rechazó un documento, escríbenos desde la dirección con la que la presentaste.' },
      { h: 'Un problema de seguridad', p: 'Si estás en peligro inmediato, contacta primero con los servicios de emergencia locales. Después cuéntanoslo, para que podamos actuar sobre la cuenta.' },
    ],
    operatorHeading: '¿Eres operador?',
    operatorBody: 'La consola de operaciones es una aplicación interna aparte.',
    operatorCta: 'Acceso de operador',
  },
};

export const PAGES: Record<Language, PagesCopy> = { en, hi, te, es };
