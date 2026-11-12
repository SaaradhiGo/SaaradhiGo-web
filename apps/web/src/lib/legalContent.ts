/**
 * The policy pages reviewers check (13 Nov): rider and driver terms, privacy, refunds and
 * cancellations, text messages, grievance redressal, cookies.
 *
 * Each page is written from what the platform actually does (the code), in plain language, for the
 * market on screen and its operating company. A line whose value is not configured (an address, a
 * CIN, a grievance officer) is left out: `null` lines are dropped. Nothing here is a placeholder.
 * The legal-review status lives in the internal docs, never on the page.
 */
import type { Market } from '@/i18n/locales';
import type { LegalEntity } from './legal';
import { POLICY_PAGES as P } from './legal';

export type Section = { h: string; p: (string | null | undefined | false)[] };
export type Doc = { title: string; lead: string; updated: string; sections: Section[] };
export type Ctx = { market: Market; entity: LegalEntity; supportEmail: string };

/** The date these texts were last changed, written the market's way. */
export function updatedOn(market: Market) {
  return market === 'US' ? '11/13/2026' : '13/11/2026';
}

function contactLine(c: Ctx) {
  const e = c.entity;
  const ways = [e.support_email || c.supportEmail, e.support_phone].filter(Boolean).join(' or ');
  return `Write to ${ways}, or raise a ticket from your account in the app.`;
}

function who(c: Ctx) {
  return `SaaradhiGo is operated by ${c.entity.legal_name}${c.entity.registered_address ? `, ${c.entity.registered_address}` : ''}.`;
}

// ---------------------------------------------------------------------------------------- terms

export function riderTerms(c: Ctx): Doc {
  const india = c.market === 'IN';
  return {
    title: 'Rider terms',
    lead: 'The terms on which you book and take rides with SaaradhiGo.',
    updated: updatedOn(c.market),
    sections: [
      { h: 'Who we are', p: [
        `${who(c)} In these terms "we" means ${c.entity.legal_name}, and "you" means the rider.`,
        'SaaradhiGo is a platform that connects riders with independent drivers. We verify drivers, set the fare rules and take payments. We do not own the vehicles and the drivers are not our employees.',
        india ? 'In India we act as an aggregator under the Motor Vehicles Aggregator Guidelines 2025.' : null,
      ] },
      { h: 'Your account', p: [
        'You must be 18 or older and give accurate details. You sign in with your mobile number and a one-time code, so keep access to your phone secure.',
        'One account per person. We may suspend an account that is used for fraud, shared, or used to harass anyone.',
      ] },
      { h: 'Booking and the fare', p: [
        'Before you book you see the fare for each vehicle class. It is worked out from a base fare, the distance and the time of the trip, within the limits set for the city; see Fares for how.',
        'If the trip changes (a new destination, a long wait, a different route you ask for) the final fare can differ, and the receipt shows each line.',
        `You pay at the end of the trip${india ? ' in cash, or online by UPI, card or netbanking where that is available in your city' : ' by card'}. A fare left unpaid can stop new bookings until it is settled.`,
      ] },
      { h: 'Cancelling', p: [
        'You can cancel at any time. Cancelling soon after booking is free; after that a cancellation fee may apply, and the app tells you before you confirm. The current rules for your city are on the Refunds and cancellations page.',
      ] },
      { h: 'Safety and conduct', p: [
        'Your pickup PIN must be given to the driver to start the trip. SOS in the app alerts our safety team and, if you have added them, your trusted contacts.',
        'Treat the driver and the vehicle with respect. Harassment, discrimination, violence, damage and carrying anything illegal end your access.',
        'Calls between you and the driver go through a masked number where the city supports it, so neither sees the other\'s number.',
      ] },
      { h: 'Our responsibility', p: [
        'We operate the platform honestly: we charge what we said we would, we pay drivers what we said we would, and we act on safety reports. We work to keep the service available but cannot promise it will never be interrupted.',
        'Nothing in these terms limits a right you have under consumer protection law.',
      ] },
      { h: 'Ending your account', p: [
        'You can stop using SaaradhiGo and delete your account from the app at any time. We may end access for a breach of these terms, for fraud, or where the law requires it.',
      ] },
      { h: 'Law and contact', p: [
        india ? 'These terms are governed by the laws of India.' : 'These terms are governed by the laws of the state where your trip takes place and the federal laws of the United States.',
        india ? `Complaints follow the process on the Grievance redressal page (${P.grievance}).` : null,
        contactLine(c),
      ] },
    ],
  };
}

export function driverTerms(c: Ctx): Doc {
  const india = c.market === 'IN';
  return {
    title: 'Driver terms',
    lead: 'The terms on which you drive with SaaradhiGo.',
    updated: updatedOn(c.market),
    sections: [
      { h: 'Who we are', p: [
        `${who(c)} In these terms "we" means ${c.entity.legal_name}, and "you" means the driver.`,
        'You are an independent driver, not our employee. You decide when to go online and which trips to accept.',
      ] },
      { h: 'Getting approved', p: [
        india
          ? 'Before your first trip we check the documents the app asks for (driving licence, vehicle registration, insurance and police verification) and that they are yours. The app shows one checklist of what is still needed.'
          : 'Before your first trip we check the documents the app asks for (driving licence, vehicle registration and insurance) and that they are yours. The app shows one checklist of what is still needed.',
        'Keep your documents current. The app reminds you before a document expires, and an expired document stops you going online until a new one is approved.',
      ] },
      { h: 'Trips', p: [
        'Start a trip only with the rider\'s pickup PIN, follow the route shown unless the rider asks otherwise, and end the trip in the app.',
        india ? 'The app takes you offline after 12 hours of driving so you can rest.' : null,
        'Carrying someone other than the matched rider, cancelling to take a trip off the platform, or manipulating fares ends your access.',
      ] },
      { h: 'Earnings and fees', p: [
        'Each trip shows its fare and what you earn. Our fee is set out in the app before it applies: either a share of the fare or a fixed fee per trip or per day, depending on your city and vehicle. A change to the fee is shown to you in advance and applies only to trips after it starts.',
        india
          ? 'Your balance is paid to your bank account or UPI ID on the payout schedule shown in the app. "Withdraw now", where offered, shows the transfer fee before you confirm.'
          : 'Your balance is paid through your Stripe payout account on the schedule shown in the app.',
        'Monthly statements are on the driver site and in the app.',
      ] },
      { h: 'Safety and conduct', p: [
        'Treat riders with respect. Harassment, discrimination, unsafe driving, driving under the influence and weapons end your access at once.',
        'SOS in the driver app alerts our safety team. Trips are recorded: the route, times and fare.',
      ] },
      { h: 'Ending it', p: [
        'You can stop driving and delete your account at any time. We may suspend or end access for a breach of these terms, for fraud, for a safety report under investigation, or where the law requires. Money already earned is still paid.',
      ] },
      { h: 'Law and contact', p: [
        india ? 'These terms are governed by the laws of India.' : 'These terms are governed by the laws of the state where you drive and the federal laws of the United States.',
        contactLine(c),
      ] },
    ],
  };
}

// --------------------------------------------------------------------------------------- privacy

export function privacy(c: Ctx): Doc {
  const india = c.market === 'IN';
  const e = c.entity;
  const shared: Section = { h: 'What we collect, and why', p: [
    'Your mobile number, to sign you in and so a driver can reach you about a trip.',
    'Your name and email address, if you give them, to address you and send receipts.',
    'Location while you use the app. For riders, to find your pickup and show the route. For drivers, continuously while online, because dispatch needs to know who is nearby.',
    'Trip records: where a trip started and ended, when, what it cost and how it was paid.',
    'For drivers: identity and vehicle documents, a photo of you, and bank or payout details so we can pay you.',
    'Payment results. Card, UPI and bank details are handled by our payment provider; we keep the result of a payment, not your card number.',
    'Support messages, ratings and safety reports you send, and error reports from the app so we can fix crashes.',
  ] };
  const sharing: Section = { h: 'Who we share it with', p: [
    `Payment providers (${india ? 'Razorpay' : 'Stripe'}) to take payments and pay drivers.`,
    `Messaging providers (${india ? 'MSG91' : 'Twilio'} for text messages, Amazon Web Services for email) to send codes, trip messages and receipts.`,
    'Cloud hosting and storage, mapping and error-reporting providers, under contract and only for running the service.',
    'The other person on a trip sees only what the trip needs: a rider sees the driver\'s first name, photo, vehicle and location; a driver sees the rider\'s first name, pickup and destination.',
    'Police or a regulator where the law requires it, or to protect someone in danger.',
    'We do not sell your personal data, and we do not share mobile numbers with anyone for their marketing.',
  ] };
  const keep: Section = { h: 'How long we keep it', p: [
    'Trip, payment and tax records for as long as the law requires financial records to be kept.',
    'Driver documents while you drive with us, and afterwards for as long as we must keep them.',
    'When you delete your account, your personal data is deleted or anonymised, except what we must keep for the reasons above.',
  ] };
  const security: Section = { h: 'Security', p: [
    'Connections are encrypted. Identity documents are stored privately. Staff access is limited to those who need it, and every privileged action is logged.',
    india ? 'If a breach affects you, we will tell you and the Data Protection Board as the law requires.' : 'If a breach affects you, we will tell you as the law of your state requires.',
  ] };
  if (india) {
    return {
      title: 'Privacy policy',
      lead: 'What personal data SaaradhiGo collects in India, why, and the rights you have under the Digital Personal Data Protection Act, 2023.',
      updated: updatedOn(c.market),
      sections: [
        { h: 'Who is responsible', p: [
          `${who(c)} It is the Data Fiduciary for the personal data described here.`,
        ] },
        shared,
        { h: 'Your consent', p: [
          'We process your data to provide the rides you ask for, on the basis of your consent and the uses the Act allows. Marketing messages are sent only if you tick the box for them, and you can withdraw that at any time in the app.',
          'Withdrawing consent does not affect what was done before, and stops anything that is not needed to provide a ride you have booked.',
        ] },
        sharing, keep,
        { h: 'Your rights', p: [
          'You can ask for a summary of the personal data we hold about you and how it is used, and download a copy from the app.',
          'You can correct, complete or update it; most of it you can edit in the app.',
          'You can ask us to erase it, by deleting your account in the app or writing to us.',
          'You can nominate someone to exercise these rights if you die or cannot act.',
          `You can raise a grievance with our Grievance Officer (see ${P.grievance}), and if you are not satisfied, complain to the Data Protection Board of India.`,
        ] },
        security,
        { h: 'Children', p: ['SaaradhiGo is not for anyone under 18.'] },
        { h: 'Contact', p: [
          e.grievance_officer_name ? `Grievance Officer: ${e.grievance_officer_name}${e.grievance_officer_email ? `, ${e.grievance_officer_email}` : ''}${e.grievance_officer_phone ? `, ${e.grievance_officer_phone}` : ''}.` : null,
          contactLine(c),
          'If we change this policy we will post the new version here and tell you in the app before a significant change applies.',
        ] },
      ],
    };
  }
  return {
    title: 'Privacy policy',
    lead: 'What personal information SaaradhiGo collects in the United States, why, and your choices, including the rights California residents have.',
    updated: updatedOn(c.market),
    sections: [
      { h: 'Who is responsible', p: [who(c)] },
      shared,
      { h: 'Sensitive information', p: [
        'Precise location and, for drivers, government ID and photos used for checks are sensitive. We use them only to provide and secure rides, to verify drivers and to meet legal duties, never to infer anything else about you.',
      ] },
      sharing, keep,
      { h: 'Your choices', p: [
        'You can see, download, correct and delete your information from the app, or by writing to us.',
        'You can turn off marketing messages at any time: reply STOP to a text, or switch them off in the app. Trip and sign-in messages continue while you use the service.',
      ] },
      { h: 'California residents', p: [
        'Under the California Consumer Privacy Act, as amended, you have the right to know what personal information we collect, use and disclose; to delete it; to correct it; and to limit the use of sensitive personal information.',
        'We do not sell personal information and do not share it for cross-context behavioral advertising, so there is nothing to opt out of; if that ever changed we would add a "Do Not Sell or Share" link first.',
        'We will not treat you differently for using these rights. You can use them yourself or through an authorized agent; we verify requests by confirming control of the account\'s phone number or email.',
        'In the last 12 months we collected the categories listed above, from you and your device, for the purposes listed above, and disclosed them only to the service providers listed above.',
      ] },
      security,
      { h: 'Children', p: ['SaaradhiGo is not for anyone under 18.'] },
      { h: 'Contact', p: [
        contactLine(c),
        'If we change this policy we will post the new version here and tell you in the app before a significant change applies.',
      ] },
    ],
  };
}

// -------------------------------------------------------------------------------------- refunds

export function refunds(c: Ctx, cancellation: string | null): Doc {
  const india = c.market === 'IN';
  return {
    title: 'Refunds and cancellations',
    lead: 'When a cancellation fee applies, and how money comes back to you.',
    updated: updatedOn(c.market),
    sections: [
      { h: 'Cancelling a ride', p: [
        cancellation ?? 'Cancelling is free in cities where no cancellation fee is set.',
        'The app shows whether a fee applies before you confirm a cancellation. If the driver cancels, you pay no cancellation fee.',
        'The same rule applies to a driver who cancels late.',
      ] },
      { h: 'If you were charged wrongly', p: [
        'Raise it from the trip in your account within 30 days of the trip, or write to us quoting the receipt number. We check the trip record (route, times and fare) and tell you the outcome.',
        'If a refund is due it goes back to the way you paid, or, if you choose, to SaaradhiGo credits you can use on your next ride.',
      ] },
      { h: 'How long a refund takes', p: [
        india
          ? 'A refund to UPI, card or netbanking is started the day it is approved; banks usually show it within 5 to 7 working days. Credits are added at once.'
          : 'A refund to your card is started the day it is approved; card issuers usually show it within 5 to 10 business days. Credits are added at once.',
        'A trip paid in cash is refunded as credits or, on request, to a bank account or UPI ID you give us.',
      ] },
      { h: 'Contact', p: [contactLine(c)] },
    ],
  };
}

/** "Free for 5 minutes after booking; after that 10% of the fare, at most ₹100." */
export function cancellationLine(policy: { percent: string; cap_minor: number | null; free_seconds: number } | null,
  currency: string): string | null {
  if (!policy) return null;
  const pct = Number(policy.percent);
  const mins = Math.round((policy.free_seconds || 0) / 60);
  const symbol = currency === 'USD' ? '$' : '₹';
  const cap = policy.cap_minor != null ? `, at most ${symbol}${(policy.cap_minor / 100).toFixed(policy.cap_minor % 100 ? 2 : 0)}` : '';
  const free = mins > 0 ? `Cancelling is free for ${mins} minute${mins === 1 ? '' : 's'} after booking. After that the fee is` : 'The cancellation fee is';
  return `${free} ${pct}% of the fare${cap}.`;
}

// -------------------------------------------------------------------------------- text messages

export function textMessages(c: Ctx): Doc {
  const india = c.market === 'IN';
  return {
    title: 'Text messages',
    lead: 'The text messages SaaradhiGo sends, how often, and how to stop them.',
    updated: updatedOn(c.market),
    sections: [
      { h: 'What we send', p: [
        'One-time sign-in codes, when you sign in or confirm your number.',
        'Trip messages you or your trusted contacts asked for: a shared trip link, an SOS alert, and a note when someone adds you as a trusted contact.',
        'For drivers: account and payout notices, such as a missing payout detail or a change of payout account.',
        'Offers and news, only if you ticked the box for them. They are never a condition of using SaaradhiGo.',
      ] },
      { h: 'How often', p: [
        'A sign-in code each time you sign in. Trip messages only when a trip triggers them. Marketing messages: message frequency varies, and only while you are opted in.',
      ] },
      { h: 'Costs', p: ['Msg & data rates may apply.'] },
      { h: 'Stopping messages', p: [
        india
          ? 'To stop offers and news, switch them off in the app\'s settings or write to us. Sign-in codes and trip messages stop when you stop using the service. We send promotional messages only as the TRAI rules allow and never to a number on the National Do Not Call registry without your consent.'
          : 'Reply STOP to any message to stop all text messages from us; you will get one message confirming it. Reply START to receive them again, and HELP for help. You can also switch marketing messages off in the app.',
        india ? null : 'Carriers are not liable for delayed or undelivered messages.',
      ] },
      { h: 'Your number', p: [
        'We never sell or share mobile numbers with anyone for their marketing. Numbers are passed only to the messaging provider that delivers our own messages.',
        `See the privacy policy (${P.privacy}) for how we handle personal data.`,
      ] },
      { h: 'Help', p: [contactLine(c)] },
    ],
  };
}

// ------------------------------------------------------------------------------------ grievance

export function grievance(c: Ctx): Doc {
  const e = c.entity;
  const officer = e.grievance_officer_name
    ? [e.grievance_officer_name, e.grievance_officer_email, e.grievance_officer_phone].filter(Boolean).join(', ')
    : null;
  return {
    title: 'Grievance redressal',
    lead: 'How to raise a complaint about a ride, a payment, your data or anything else, and how fast we answer.',
    updated: updatedOn('IN'),
    sections: [
      { h: 'Start with support', p: [
        'Most problems are fastest from the trip itself: open it in your account and ask for help there. It reaches our support team with the trip attached.',
        contactLine(c),
      ] },
      { h: 'Grievance Officer', p: [
        officer ? `Our Grievance Officer is ${officer}.` : null,
        e.registered_address ? `Post: ${e.legal_name}, ${e.registered_address}.` : null,
        'Write to the Grievance Officer if support has not resolved your complaint, or about your personal data.',
      ] },
      { h: 'How fast we answer', p: [
        'We acknowledge a grievance within 24 hours and resolve it within 15 days of receiving it. If we need more information we tell you what and why.',
        'A safety complaint is handled at once by our safety team; use SOS in the app if you are in danger.',
      ] },
      { h: 'If you are not satisfied', p: [
        'For personal data, you can complain to the Data Protection Board of India. For a consumer dispute, you can approach the National Consumer Helpline (1915) or the consumer commission.',
      ] },
    ],
  };
}

// --------------------------------------------------------------------------------------- cookies

export function cookies(c: Ctx): Doc {
  return {
    title: 'Cookie notice',
    lead: 'The cookies and browser storage this website uses. None of them track you across other websites.',
    updated: updatedOn(c.market),
    sections: [
      { h: 'Needed to work', p: [
        'Signed-in session: a secure cookie that keeps you signed in and says whether you are using the rider or driver area. It is removed when you sign out.',
        'Sign-in area (sg-area): which sign-in page to show you after your session ends. One year.',
        'Payment providers (Razorpay in India, Stripe in the USA) set their own cookies on their checkout to prevent fraud.',
      ] },
      { h: 'Your choices', p: [
        'Language (sg-language), country (sg-market) and theme (sg-theme): remember what you chose. One year.',
        'Account country (sg-account-market): the country of your account, to show the right company details. Until you sign out.',
      ] },
      { h: 'No advertising cookies', p: [
        'We do not use advertising or cross-site tracking cookies, and we do not sell what these cookies hold. Error reports from the site help us fix faults and carry no advertising identifier.',
        'You can delete cookies in your browser settings; the site still works, but you will be signed out and your choices forgotten.',
      ] },
      { h: 'Contact', p: [contactLine(c)] },
    ],
  };
}
