import type { Locale } from './locales';

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
  /** Set only where the page carries a photograph. */
  photoAlt?: string;
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
  drive: PageCopy & { faq: Section[] };
  safety: PageCopy;
  about: PageCopy;
  help: PageCopy & { groups: { h: string; items: string[] }[] };
  contact: ContactCopy;
};

const en: PagesCopy = {
  ride: {
    title: 'Riding with SaaradhiGo',
    metaDescription:
      'How booking works on SaaradhiGo: set a pickup and destination, compare fares across vehicle classes, and track your trip with a ride PIN.',
    photoAlt: 'A silver saloon car parked on a driveway.',
    lead: 'You agree the fare before the trip starts, and that is the fare you pay. Here is what happens from the moment you open the booking page.',
    sections: [
      {
        h: 'Set where you are and where you are going',
        p: 'Type a pickup and a destination, or use your current location. We check that your pickup falls inside a service area before going further, so you find out immediately rather than after choosing a car.',
      },
      {
        h: 'Compare every class before you choose',
        p: 'Each vehicle class is priced for your exact trip and shown together, so you are comparing rather than discovering the price afterwards. A class we cannot price says so instead of showing a guess.',
      },
      {
        h: 'Request, then share your PIN',
        p: 'Once you request a ride we look for a nearby driver. When one accepts you see their name and vehicle number, and a four-digit PIN. The driver cannot start the trip until you give it to them.',
      },
      {
        h: 'Follow the trip as it happens',
        p: 'Your driver’s position updates on the map for the length of the journey and the route is drawn as you travel. You can cancel from the same screen while the trip has not started.',
      },
      {
        h: 'Pay at the end',
        p: 'Trips are settled in cash with the driver today. Your trip history is on your account.',
      },
    ],
    cta: 'Book a ride',
  },
  drive: {
    title: 'Drive with SaaradhiGo',
    metaDescription:
      'Apply to drive with SaaradhiGo. Upload your licence, registration and insurance, and start accepting trips once your documents are approved.',
    lead: 'Drive when it suits you, and see what a trip pays before you accept it.',
    sections: [
      {
        h: 'See the fare before you accept',
        p: 'Every offer shows the fare it carries. You decide with the number in front of you rather than after the trip is yours.',
      },
      {
        h: 'Work the hours you choose',
        p: 'Go online when you want to drive and offline when you do not. There is no shift to sign up for.',
      },
      {
        h: 'Track your earnings in the app',
        p: 'Completed trips and their fares are listed in the driver app, so your own record and ours agree.',
      },
    ],
    faq: [
      {
        h: 'What do I need to apply?',
        p: 'A driving licence, the vehicle registration, and valid insurance for the vehicle you will drive. You upload them during the application.',
      },
      {
        h: 'How long does approval take?',
        p: 'Your documents are reviewed by our team before your first trip. We will tell you if something is missing or unreadable rather than leaving the application silent.',
      },
      {
        h: 'What will I earn?',
        p: 'That depends on your city, the hours you drive and the fares of the trips you accept, so we do not publish a figure. Each offer shows its own fare before you accept.',
      },
      {
        h: 'Which vehicles can I drive?',
        p: 'Auto, Mini, Sedan and SUV are the classes we price today. Your vehicle is matched to a class during onboarding.',
      },
    ],
    cta: 'Apply to drive',
    cta2: 'Driver sign in',
  },
  safety: {
    title: 'Safety at SaaradhiGo',
    metaDescription:
      'The safety features running on SaaradhiGo today: a server-verified ride PIN, live trip tracking, and safety alerts that reach our operations team.',
    lead: 'These are features running on the platform today. We have deliberately not listed anything that is planned but not built.',
    sections: [
      {
        h: 'A PIN starts every ride',
        p: 'When a driver accepts your trip you are shown a four-digit PIN. The driver has to enter it to begin, and it is checked on our servers rather than inside the app, so the trip cannot be started without you.',
      },
      {
        h: 'The trip is tracked while it runs',
        p: 'Your driver’s position updates on your map for the length of the journey, and the road being travelled is drawn as you go. If the car is not moving the way you expect, you can see it.',
      },
      {
        h: 'An alert reaches a person',
        p: 'A safety alert raised during a ride is delivered to our operations team with the trip and its location attached. Someone sees it with the context already there.',
      },
      {
        h: 'What we do not claim',
        p: 'We do not run a staffed round-the-clock emergency desk, we have no emergency-services partnership, we do not record rides, and we do not provide insurance cover. If you are in immediate danger, contact local emergency services first.',
      },
    ],
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
    groups: [
      {
        h: 'Booking a ride',
        items: [
          'Set your pickup and destination on the booking page, then compare the fare for each vehicle class before you choose.',
          'If your pickup is outside a service area we will tell you before you pick a car.',
          'You can cancel from the trip screen at any point before the trip starts.',
        ],
      },
      {
        h: 'During your trip',
        items: [
          'Give your driver the four-digit PIN shown on your screen. They cannot start the trip without it.',
          'Your driver’s position updates on the map while the trip runs.',
          'Trips are settled in cash with the driver today.',
        ],
      },
      {
        h: 'Your account',
        items: [
          'Create an account with your email address, and confirm it from the message we send.',
          'If you cannot sign in, use the password reset link on the sign-in page.',
          'Your past trips are listed under My trips.',
        ],
      },
      {
        h: 'Driving with us',
        items: [
          'Apply online with your licence, vehicle registration and insurance.',
          'Your documents are reviewed before your first trip.',
          'Each trip offer shows its fare before you accept it.',
        ],
      },
      {
        h: 'Safety',
        items: [
          'Every ride starts with a PIN that is verified on our servers.',
          'A safety alert raised during a ride reaches our operations team with the trip attached.',
          'If you are in immediate danger, contact local emergency services first.',
        ],
      },
    ],
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
    photoAlt: 'एक चाँदी रंग की सेडान कार ड्राइववे पर खड़ी है।',
    lead: 'यात्रा शुरू होने से पहले किराया तय हो जाता है, और वही किराया आप देते हैं। बुकिंग पेज खोलने के बाद क्या होता है, यह रहा।',
    sections: [
      { h: 'बताएं आप कहाँ हैं और कहाँ जाना है', p: 'पिकअप और गंतव्य टाइप करें, या अपना वर्तमान स्थान उपयोग करें। आगे बढ़ने से पहले हम जाँचते हैं कि आपका पिकअप सेवा क्षेत्र में है या नहीं, ताकि आपको कार चुनने के बाद नहीं, तुरंत पता चले।' },
      { h: 'चुनने से पहले हर श्रेणी की तुलना करें', p: 'हर श्रेणी का किराया आपकी यात्रा के लिए तय होकर एक साथ दिखता है, ताकि आप तुलना करें, न कि बाद में कीमत जानें। जिस श्रेणी का किराया हम नहीं निकाल सकते, वह अनुमान दिखाने के बजाय यही बताती है।' },
      { h: 'अनुरोध करें, फिर अपना पिन दें', p: 'अनुरोध के बाद हम पास का ड्राइवर खोजते हैं। स्वीकार करने पर आपको उनका नाम, वाहन नंबर और चार अंकों का पिन दिखता है। जब तक आप पिन नहीं देते, ड्राइवर यात्रा शुरू नहीं कर सकता।' },
      { h: 'यात्रा को साथ-साथ देखें', p: 'पूरी यात्रा के दौरान ड्राइवर की स्थिति मानचित्र पर अपडेट होती है और रास्ता खींचा जाता है। यात्रा शुरू होने से पहले आप उसी स्क्रीन से रद्द कर सकते हैं।' },
      { h: 'अंत में भुगतान करें', p: 'फ़िलहाल यात्राएँ ड्राइवर को नकद में चुकाई जाती हैं। आपकी यात्रा का इतिहास आपके खाते में है।' },
    ],
    cta: 'सवारी बुक करें',
  },
  drive: {
    title: 'SaaradhiGo के साथ ड्राइव करें',
    metaDescription: 'SaaradhiGo के साथ ड्राइव करने के लिए आवेदन करें। लाइसेंस, पंजीकरण और बीमा अपलोड करें, और दस्तावेज़ स्वीकृत होते ही यात्राएँ लेना शुरू करें।',
    lead: 'जब सुविधा हो तब ड्राइव करें, और स्वीकार करने से पहले देखें कि यात्रा से कितना मिलेगा।',
    sections: [
      { h: 'स्वीकार करने से पहले किराया देखें', p: 'हर ऑफ़र उसका किराया दिखाता है। आप संख्या सामने रखकर निर्णय लेते हैं, न कि यात्रा लेने के बाद।' },
      { h: 'अपने चुने हुए घंटे', p: 'जब ड्राइव करना हो तब ऑनलाइन जाएँ, जब न हो तब ऑफ़लाइन। किसी शिफ़्ट के लिए साइन अप नहीं करना पड़ता।' },
      { h: 'ऐप में अपनी कमाई देखें', p: 'पूरी हुई यात्राएँ और उनके किराए ड्राइवर ऐप में दर्ज रहते हैं, ताकि आपका और हमारा हिसाब एक रहे।' },
    ],
    faq: [
      { h: 'आवेदन के लिए क्या चाहिए?', p: 'ड्राइविंग लाइसेंस, वाहन पंजीकरण, और जिस वाहन से चलाएँगे उसका वैध बीमा। आवेदन के दौरान इन्हें अपलोड करते हैं।' },
      { h: 'स्वीकृति में कितना समय लगता है?', p: 'पहली यात्रा से पहले हमारी टीम आपके दस्तावेज़ देखती है। कुछ छूट गया या पढ़ा न जा सके तो हम बताएँगे, आवेदन को चुप नहीं छोड़ेंगे।' },
      { h: 'कितनी कमाई होगी?', p: 'यह आपके शहर, ड्राइव के घंटों और स्वीकार की गई यात्राओं के किराए पर निर्भर करता है, इसलिए हम कोई आँकड़ा प्रकाशित नहीं करते। हर ऑफ़र स्वीकार करने से पहले अपना किराया दिखाता है।' },
      { h: 'कौन से वाहन चला सकते हैं?', p: 'आज हम ऑटो, मिनी, सेडान और एसयूवी श्रेणियों का किराया तय करते हैं। ऑनबोर्डिंग के दौरान आपका वाहन एक श्रेणी से जोड़ा जाता है।' },
    ],
    cta: 'ड्राइवर बनें',
    cta2: 'ड्राइवर साइन इन',
  },
  safety: {
    title: 'SaaradhiGo पर सुरक्षा',
    metaDescription: 'SaaradhiGo पर आज चल रही सुरक्षा सुविधाएँ: सर्वर पर जाँचा जाने वाला राइड पिन, लाइव ट्रिप ट्रैकिंग, और संचालन टीम तक पहुँचने वाले सुरक्षा अलर्ट।',
    lead: 'ये सुविधाएँ आज प्लेटफ़ॉर्म पर चल रही हैं। जो योजना में है पर बना नहीं, उसे हमने जानबूझकर नहीं गिनाया।',
    sections: [
      { h: 'हर सवारी पिन से शुरू होती है', p: 'ड्राइवर के स्वीकार करते ही आपको चार अंकों का पिन दिखता है। शुरू करने के लिए ड्राइवर को वह डालना पड़ता है, और उसकी जाँच ऐप में नहीं, हमारे सर्वर पर होती है — यानी आपके बिना यात्रा शुरू नहीं हो सकती।' },
      { h: 'यात्रा के दौरान ट्रैकिंग', p: 'पूरी यात्रा में ड्राइवर की स्थिति आपके मानचित्र पर अपडेट होती है और जो रास्ता तय हो रहा है वह खींचा जाता है। अगर गाड़ी अपेक्षा से अलग चल रही हो, आप देख सकते हैं।' },
      { h: 'अलर्ट किसी व्यक्ति तक पहुँचता है', p: 'यात्रा के दौरान उठाया गया सुरक्षा अलर्ट यात्रा और उसके स्थान के साथ हमारी संचालन टीम तक पहुँचता है। कोई व्यक्ति उसे पूरे संदर्भ के साथ देखता है।' },
      { h: 'हम क्या दावा नहीं करते', p: 'हम चौबीसों घंटे स्टाफ़ वाला आपातकालीन डेस्क नहीं चलाते, आपातकालीन सेवाओं से हमारी कोई साझेदारी नहीं है, हम यात्राएँ रिकॉर्ड नहीं करते, और हम बीमा कवर नहीं देते। तत्काल ख़तरे में पहले स्थानीय आपातकालीन सेवाओं से संपर्क करें।' },
    ],
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
    groups: [
      { h: 'सवारी बुक करना', items: ['बुकिंग पेज पर पिकअप और गंतव्य चुनें, फिर चुनने से पहले हर श्रेणी के किराए की तुलना करें।', 'यदि आपका पिकअप सेवा क्षेत्र से बाहर है तो कार चुनने से पहले हम बता देंगे।', 'यात्रा शुरू होने से पहले किसी भी समय आप ट्रिप स्क्रीन से रद्द कर सकते हैं।'] },
      { h: 'यात्रा के दौरान', items: ['स्क्रीन पर दिख रहा चार अंकों का पिन ड्राइवर को दें। उसके बिना वे यात्रा शुरू नहीं कर सकते।', 'यात्रा चलते समय ड्राइवर की स्थिति मानचित्र पर अपडेट होती है।', 'फ़िलहाल यात्राएँ ड्राइवर को नकद में चुकाई जाती हैं।'] },
      { h: 'आपका खाता', items: ['अपने ईमेल पते से खाता बनाएँ, और भेजे गए संदेश से उसकी पुष्टि करें।', 'साइन इन न कर पाएँ तो साइन-इन पेज पर पासवर्ड रीसेट लिंक का उपयोग करें।', 'आपकी पिछली यात्राएँ "मेरी यात्राएँ" में हैं।'] },
      { h: 'हमारे साथ ड्राइविंग', items: ['लाइसेंस, वाहन पंजीकरण और बीमा के साथ ऑनलाइन आवेदन करें।', 'पहली यात्रा से पहले आपके दस्तावेज़ देखे जाते हैं।', 'हर ट्रिप ऑफ़र स्वीकार करने से पहले अपना किराया दिखाता है।'] },
      { h: 'सुरक्षा', items: ['हर सवारी एक पिन से शुरू होती है जिसकी जाँच हमारे सर्वर पर होती है।', 'यात्रा के दौरान उठाया गया सुरक्षा अलर्ट यात्रा के साथ हमारी संचालन टीम तक पहुँचता है।', 'तत्काल ख़तरे में पहले स्थानीय आपातकालीन सेवाओं से संपर्क करें।'] },
    ],
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
    photoAlt: 'డ్రైవ్‌వేలో నిలిపిన వెండి రంగు సెడాన్ కారు.',
    lead: 'ప్రయాణం మొదలయ్యే ముందే ధర ఖరారవుతుంది, అదే మీరు చెల్లిస్తారు. బుకింగ్ పేజీ తెరిచిన క్షణం నుంచి ఏం జరుగుతుందో ఇది.',
    sections: [
      { h: 'మీరు ఎక్కడ ఉన్నారో, ఎక్కడికి వెళ్తున్నారో చెప్పండి', p: 'పికప్ మరియు గమ్యాన్ని టైప్ చేయండి, లేదా మీ ప్రస్తుత ప్రదేశాన్ని ఉపయోగించండి. ముందుకు వెళ్లే ముందు మీ పికప్ సేవా ప్రాంతంలో ఉందా అని తనిఖీ చేస్తాం, తద్వారా కారు ఎంచుకున్న తర్వాత కాకుండా వెంటనే తెలుస్తుంది.' },
      { h: 'ఎంచుకునే ముందు ప్రతి తరగతిని పోల్చండి', p: 'ప్రతి తరగతికి మీ ప్రయాణానికి ధర నిర్ణయించి కలిపి చూపిస్తాం, తద్వారా మీరు పోల్చుకుంటారు, తర్వాత ధర తెలుసుకోరు. ధర నిర్ణయించలేని తరగతి ఊహను చూపకుండా అదే చెబుతుంది.' },
      { h: 'అభ్యర్థించండి, ఆపై పిన్ ఇవ్వండి', p: 'అభ్యర్థించిన తర్వాత దగ్గరలోని డ్రైవర్‌ను వెతుకుతాం. ఒకరు అంగీకరించగానే వారి పేరు, వాహన నంబర్ మరియు నాలుగు అంకెల పిన్ కనిపిస్తాయి. మీరు పిన్ ఇచ్చే వరకు డ్రైవర్ ప్రయాణాన్ని మొదలుపెట్టలేరు.' },
      { h: 'ప్రయాణాన్ని అప్పటికప్పుడు చూడండి', p: 'ప్రయాణం పొడవునా డ్రైవర్ స్థానం మ్యాప్‌లో నవీకరించబడుతుంది, మార్గం గీయబడుతుంది. ప్రయాణం మొదలవ్వని వరకు అదే స్క్రీన్ నుంచి రద్దు చేయవచ్చు.' },
      { h: 'చివర్లో చెల్లించండి', p: 'ప్రస్తుతం ప్రయాణాలు డ్రైవర్‌కు నగదు రూపంలో చెల్లించబడతాయి. మీ ప్రయాణ చరిత్ర మీ ఖాతాలో ఉంటుంది.' },
    ],
    cta: 'ప్రయాణం బుక్ చేయండి',
  },
  drive: {
    title: 'SaaradhiGoతో డ్రైవ్ చేయండి',
    metaDescription: 'SaaradhiGoతో డ్రైవ్ చేయడానికి దరఖాస్తు చేయండి. లైసెన్స్, రిజిస్ట్రేషన్, బీమా అప్‌లోడ్ చేసి, పత్రాలు ఆమోదం పొందగానే ప్రయాణాలు స్వీకరించడం మొదలుపెట్టండి.',
    lead: 'మీకు అనుకూలమైనప్పుడు డ్రైవ్ చేయండి, స్వీకరించే ముందు ప్రయాణం ఎంత ఇస్తుందో చూడండి.',
    sections: [
      { h: 'స్వీకరించే ముందు ధర చూడండి', p: 'ప్రతి ఆఫర్ దాని ధరను చూపుతుంది. సంఖ్య మీ ముందు ఉండగానే మీరు నిర్ణయించుకుంటారు, ప్రయాణం మీదైన తర్వాత కాదు.' },
      { h: 'మీరు ఎంచుకున్న గంటలు', p: 'డ్రైవ్ చేయాలనుకున్నప్పుడు ఆన్‌లైన్‌కి వెళ్లండి, అనుకోనప్పుడు ఆఫ్‌లైన్. సైన్ అప్ చేయాల్సిన షిఫ్ట్ ఏదీ లేదు.' },
      { h: 'యాప్‌లో మీ ఆదాయాన్ని చూడండి', p: 'పూర్తయిన ప్రయాణాలు, వాటి ధరలు డ్రైవర్ యాప్‌లో నమోదవుతాయి, తద్వారా మీ లెక్క, మా లెక్క ఒకటే ఉంటాయి.' },
    ],
    faq: [
      { h: 'దరఖాస్తుకు ఏమి కావాలి?', p: 'డ్రైవింగ్ లైసెన్స్, వాహన రిజిస్ట్రేషన్, మీరు నడిపే వాహనానికి చెల్లుబాటు అయ్యే బీమా. దరఖాస్తు సమయంలో వీటిని అప్‌లోడ్ చేస్తారు.' },
      { h: 'ఆమోదానికి ఎంత సమయం పడుతుంది?', p: 'మీ మొదటి ప్రయాణానికి ముందు మా బృందం మీ పత్రాలను పరిశీలిస్తుంది. ఏదైనా తక్కువైనా, చదవలేకపోయినా చెబుతాం — దరఖాస్తును మౌనంగా వదిలేయం.' },
      { h: 'నేను ఎంత సంపాదిస్తాను?', p: 'అది మీ నగరం, మీరు డ్రైవ్ చేసే గంటలు, మీరు స్వీకరించే ప్రయాణాల ధరలపై ఆధారపడుతుంది, కాబట్టి మేము ఏ అంకెనూ ప్రచురించం. ప్రతి ఆఫర్ స్వీకరించే ముందు దాని ధరను చూపుతుంది.' },
      { h: 'ఏ వాహనాలు నడపవచ్చు?', p: 'ఈరోజు మేము ఆటో, మినీ, సెడాన్, ఎస్‌యూవీ తరగతులకు ధర నిర్ణయిస్తాం. ఆన్‌బోర్డింగ్ సమయంలో మీ వాహనం ఒక తరగతికి జత చేయబడుతుంది.' },
    ],
    cta: 'డ్రైవర్ కండి',
    cta2: 'డ్రైవర్ సైన్ ఇన్',
  },
  safety: {
    title: 'SaaradhiGoలో భద్రత',
    metaDescription: 'SaaradhiGoలో ఈరోజు పనిచేస్తున్న భద్రతా సదుపాయాలు: సర్వర్‌లో ధృవీకరించే రైడ్ పిన్, ప్రత్యక్ష ప్రయాణ ట్రాకింగ్, ఆపరేషన్స్ బృందానికి చేరే భద్రతా హెచ్చరికలు.',
    lead: 'ఇవి ఈరోజు ప్లాట్‌ఫామ్‌లో పనిచేస్తున్న సదుపాయాలు. ప్రణాళికలో ఉండి ఇంకా నిర్మించనిదాన్ని ఉద్దేశపూర్వకంగా చేర్చలేదు.',
    sections: [
      { h: 'ప్రతి ప్రయాణం పిన్‌తో మొదలవుతుంది', p: 'డ్రైవర్ అంగీకరించగానే మీకు నాలుగు అంకెల పిన్ కనిపిస్తుంది. మొదలుపెట్టడానికి డ్రైవర్ దాన్ని నమోదు చేయాలి, అది యాప్‌లో కాదు మా సర్వర్‌లలో తనిఖీ అవుతుంది — అంటే మీరు లేకుండా ప్రయాణం మొదలవ్వదు.' },
      { h: 'ప్రయాణం జరుగుతుండగా ట్రాకింగ్', p: 'ప్రయాణం పొడవునా డ్రైవర్ స్థానం మీ మ్యాప్‌లో నవీకరించబడుతుంది, ప్రయాణిస్తున్న రహదారి గీయబడుతుంది. కారు మీరు ఊహించిన విధంగా వెళ్లకపోతే మీరు చూడగలరు.' },
      { h: 'హెచ్చరిక ఒక వ్యక్తికి చేరుతుంది', p: 'ప్రయాణంలో లేవనెత్తిన భద్రతా హెచ్చరిక, ప్రయాణం మరియు దాని స్థానంతో కలిపి మా ఆపరేషన్స్ బృందానికి చేరుతుంది. ఒక వ్యక్తి దాన్ని పూర్తి సందర్భంతో చూస్తారు.' },
      { h: 'మేము చెప్పని విషయాలు', p: 'మేము ఇరవై నాలుగు గంటల సిబ్బందితో కూడిన అత్యవసర డెస్క్ నడపం, అత్యవసర సేవలతో మాకు భాగస్వామ్యం లేదు, ప్రయాణాలను రికార్డ్ చేయం, బీమా కవర్ ఇవ్వం. తక్షణ ప్రమాదంలో ముందుగా స్థానిక అత్యవసర సేవలను సంప్రదించండి.' },
    ],
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
    groups: [
      { h: 'ప్రయాణం బుక్ చేయడం', items: ['బుకింగ్ పేజీలో పికప్, గమ్యం ఎంచుకోండి, ఎంచుకునే ముందు ప్రతి తరగతి ధరను పోల్చండి.', 'మీ పికప్ సేవా ప్రాంతం వెలుపల ఉంటే కారు ఎంచుకునే ముందే చెబుతాం.', 'ప్రయాణం మొదలవ్వని ఎప్పుడైనా ట్రిప్ స్క్రీన్ నుంచి రద్దు చేయవచ్చు.'] },
      { h: 'మీ ప్రయాణంలో', items: ['స్క్రీన్‌పై కనిపించే నాలుగు అంకెల పిన్‌ను డ్రైవర్‌కు ఇవ్వండి. అది లేకుండా వారు ప్రయాణాన్ని మొదలుపెట్టలేరు.', 'ప్రయాణం సాగుతుండగా డ్రైవర్ స్థానం మ్యాప్‌లో నవీకరించబడుతుంది.', 'ప్రస్తుతం ప్రయాణాలు డ్రైవర్‌కు నగదు రూపంలో చెల్లించబడతాయి.'] },
      { h: 'మీ ఖాతా', items: ['మీ ఇమెయిల్ చిరునామాతో ఖాతా సృష్టించి, మేము పంపే సందేశం ద్వారా దాన్ని ధృవీకరించండి.', 'సైన్ ఇన్ చేయలేకపోతే సైన్-ఇన్ పేజీలోని పాస్‌వర్డ్ రీసెట్ లింక్ ఉపయోగించండి.', 'మీ గత ప్రయాణాలు "నా ప్రయాణాలు"లో ఉంటాయి.'] },
      { h: 'మాతో డ్రైవింగ్', items: ['లైసెన్స్, వాహన రిజిస్ట్రేషన్, బీమాతో ఆన్‌లైన్‌లో దరఖాస్తు చేయండి.', 'మీ మొదటి ప్రయాణానికి ముందు మీ పత్రాలు పరిశీలించబడతాయి.', 'ప్రతి ట్రిప్ ఆఫర్ స్వీకరించే ముందు దాని ధరను చూపుతుంది.'] },
      { h: 'భద్రత', items: ['ప్రతి ప్రయాణం మా సర్వర్‌లలో ధృవీకరించే పిన్‌తో మొదలవుతుంది.', 'ప్రయాణంలో లేవనెత్తిన భద్రతా హెచ్చరిక ప్రయాణంతో కలిపి మా ఆపరేషన్స్ బృందానికి చేరుతుంది.', 'తక్షణ ప్రమాదంలో ముందుగా స్థానిక అత్యవసర సేవలను సంప్రదించండి.'] },
    ],
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
    photoAlt: 'Un coche sedán plateado aparcado en una entrada.',
    lead: 'La tarifa se acuerda antes de empezar el viaje, y esa es la que pagas. Esto es lo que ocurre desde que abres la página de reserva.',
    sections: [
      { h: 'Indica dónde estás y a dónde vas', p: 'Escribe la recogida y el destino, o usa tu ubicación actual. Comprobamos que la recogida esté dentro de una zona de servicio antes de seguir, para que lo sepas de inmediato y no después de elegir coche.' },
      { h: 'Compara cada categoría antes de elegir', p: 'Cada categoría se tarifica para tu trayecto exacto y se muestra junta, de modo que comparas en lugar de descubrir el precio después. Una categoría que no podemos tarificar lo dice en vez de mostrar una estimación.' },
      { h: 'Solicita y comparte tu PIN', p: 'Al solicitar el viaje buscamos un conductor cercano. Cuando alguien acepta ves su nombre, la matrícula y un PIN de cuatro dígitos. El conductor no puede empezar el viaje hasta que se lo des.' },
      { h: 'Sigue el viaje mientras ocurre', p: 'La posición del conductor se actualiza en el mapa durante todo el trayecto y la ruta se dibuja a medida que avanzas. Puedes cancelar desde la misma pantalla mientras el viaje no haya comenzado.' },
      { h: 'Paga al final', p: 'Hoy los viajes se liquidan en efectivo con el conductor. Tu historial está en tu cuenta.' },
    ],
    cta: 'Reservar un viaje',
  },
  drive: {
    title: 'Conduce con SaaradhiGo',
    metaDescription: 'Solicita conducir con SaaradhiGo. Sube tu permiso, el registro del vehículo y el seguro, y empieza a aceptar viajes cuando se aprueben.',
    lead: 'Conduce cuando te venga bien y mira lo que paga un viaje antes de aceptarlo.',
    sections: [
      { h: 'Mira la tarifa antes de aceptar', p: 'Cada oferta muestra la tarifa que lleva. Decides con la cifra delante, no después de que el viaje ya sea tuyo.' },
      { h: 'Las horas que tú elijas', p: 'Conéctate cuando quieras conducir y desconéctate cuando no. No hay turnos a los que apuntarse.' },
      { h: 'Controla tus ingresos en la aplicación', p: 'Los viajes completados y sus tarifas quedan registrados en la aplicación del conductor, para que tu cuenta y la nuestra coincidan.' },
    ],
    faq: [
      { h: '¿Qué necesito para solicitarlo?', p: 'Un permiso de conducir, el registro del vehículo y un seguro válido para el vehículo que vayas a conducir. Se suben durante la solicitud.' },
      { h: '¿Cuánto tarda la aprobación?', p: 'Nuestro equipo revisa tus documentos antes de tu primer viaje. Te avisaremos si falta algo o no se lee bien, en lugar de dejar la solicitud en silencio.' },
      { h: '¿Cuánto voy a ganar?', p: 'Depende de tu ciudad, de las horas que conduzcas y de las tarifas de los viajes que aceptes, así que no publicamos una cifra. Cada oferta muestra su tarifa antes de aceptarla.' },
      { h: '¿Qué vehículos puedo conducir?', p: 'Hoy tarificamos las categorías Auto, Mini, Sedán y SUV. Tu vehículo se asigna a una categoría durante el alta.' },
    ],
    cta: 'Hazte conductor',
    cta2: 'Acceso para conductores',
  },
  safety: {
    title: 'Seguridad en SaaradhiGo',
    metaDescription: 'Las funciones de seguridad activas hoy en SaaradhiGo: un PIN verificado en el servidor, seguimiento del viaje en directo y alertas que llegan a operaciones.',
    lead: 'Estas funciones están activas hoy en la plataforma. Hemos dejado fuera a propósito todo lo que está planeado pero no construido.',
    sections: [
      { h: 'Un PIN inicia cada viaje', p: 'Cuando un conductor acepta tu viaje ves un PIN de cuatro dígitos. El conductor tiene que introducirlo para empezar, y se comprueba en nuestros servidores y no dentro de la aplicación, así que el viaje no puede comenzar sin ti.' },
      { h: 'El viaje se sigue mientras ocurre', p: 'La posición del conductor se actualiza en tu mapa durante todo el trayecto y la vía recorrida se dibuja sobre la marcha. Si el coche no va como esperas, puedes verlo.' },
      { h: 'Una alerta llega a una persona', p: 'Una alerta de seguridad durante un viaje llega a nuestro equipo de operaciones con el trayecto y su ubicación. Alguien la ve con el contexto ya incluido.' },
      { h: 'Lo que no afirmamos', p: 'No tenemos una central de emergencias atendida las veinticuatro horas, no tenemos acuerdos con servicios de emergencia, no grabamos los viajes y no ofrecemos cobertura de seguro. Si estás en peligro inmediato, contacta primero con los servicios de emergencia locales.' },
    ],
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
    groups: [
      { h: 'Reservar un viaje', items: ['Indica recogida y destino en la página de reserva y compara la tarifa de cada categoría antes de elegir.', 'Si tu recogida está fuera de una zona de servicio te lo diremos antes de que elijas coche.', 'Puedes cancelar desde la pantalla del viaje en cualquier momento antes de que empiece.'] },
      { h: 'Durante tu viaje', items: ['Dale al conductor el PIN de cuatro dígitos que aparece en tu pantalla. Sin él no puede empezar.', 'La posición del conductor se actualiza en el mapa mientras dura el viaje.', 'Hoy los viajes se liquidan en efectivo con el conductor.'] },
      { h: 'Tu cuenta', items: ['Crea una cuenta con tu correo y confírmala desde el mensaje que te enviamos.', 'Si no puedes iniciar sesión, usa el enlace de restablecer contraseña.', 'Tus viajes anteriores están en Mis viajes.'] },
      { h: 'Conducir con nosotros', items: ['Solicítalo en línea con tu permiso, el registro del vehículo y el seguro.', 'Revisamos tus documentos antes de tu primer viaje.', 'Cada oferta muestra su tarifa antes de aceptarla.'] },
      { h: 'Seguridad', items: ['Cada viaje empieza con un PIN que se verifica en nuestros servidores.', 'Una alerta de seguridad durante un viaje llega a nuestro equipo de operaciones con el trayecto.', 'Si estás en peligro inmediato, contacta primero con los servicios de emergencia locales.'] },
    ],
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

export const PAGES: Record<Locale, PagesCopy> = {
  'en-IN': en,
  'en-US': en,
  'hi-IN': hi,
  'te-IN': te,
  'es-US': es,
};
