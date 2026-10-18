import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy policy — SaaradhiGo',
  description:
    'What personal data SaaradhiGo collects, why, how long it is kept, and '
    + 'the rights you have over it.',
};

// DRAFT, AND SAID SO ON THE PAGE.
//
// Every statement below describes what the platform actually does -- the data
// it stores, the third parties it sends it to, and the rights the backend
// already implements (`/auth/me/export/` and `/auth/me/delete/`). It is
// written from the system, not from a template.
//
// It has NOT been reviewed by a lawyer, and the DPDP Act has requirements
// (notice form, consent manager, grievance officer, retention schedules) that
// a developer should not sign off. Play Store requires a privacy policy URL,
// so this exists as the honest draft to review -- not as a finished notice to
// publish unread.

const sections = [
  {
    h: 'Who we are',
    p: [
      'SaaradhiGo is a ride-hailing platform operating a controlled pilot in India. In this policy, "we" means the company operating SaaradhiGo, and "you" means a rider, a driver, or anyone else whose data we hold.',
    ],
  },
  {
    h: 'What we collect, and why',
    p: [
      'Your mobile number, because it is how you sign in and how a driver reaches you about a trip.',
      'Your name and email address, if you give them, so we can address you and send receipts.',
      'Location, while you are using the service. For riders, to find your pickup and show the route. For drivers, continuously while you are online, because dispatch cannot work without knowing who is nearby.',
      'Trip records: where a trip started and ended, when, what it cost, and how it was paid.',
      'For drivers, identity and vehicle documents — licence, registration, insurance — because we are required to verify who is driving, and bank details so we can pay you.',
      'Payment records. Card and UPI details are handled by our payment provider; we store the result of a payment, not your card number.',
      'Support messages and ratings you submit.',
    ],
  },
  {
    h: 'Who we share it with',
    p: [
      'Our payment provider, to take payments and make payouts.',
      'Cloud providers that host the service and store documents, under contract.',
      'Mapping and messaging providers, to show routes and send one-time codes.',
      'Law enforcement or a regulator, where we are legally required to.',
      'The other party to a trip sees limited details — a rider sees the driver and vehicle; a driver sees the pickup, destination and first name. Neither sees the other’s full record.',
      'We do not sell your personal data.',
    ],
  },
  {
    h: 'How long we keep it',
    p: [
      'Trip, payment and tax records are kept as long as the law requires us to keep financial records.',
      'Driver verification documents are kept while you drive with us, and for the period we must retain them afterwards.',
      'An account you delete is removed or anonymised, except where a record must be kept for the reasons above.',
      'A specific retention schedule is part of the legal review noted at the top of this page.',
    ],
  },
  {
    h: 'Your rights',
    p: [
      'You can ask for a copy of the personal data we hold about you. The app and the API support this directly.',
      'You can ask us to delete your account.',
      'You can ask us to correct anything that is wrong — most of it you can edit yourself in the app.',
      'You can withdraw consent for things that are not essential to providing a ride.',
      'To exercise any of these, email support@saaradhigo.in from your registered address or number.',
    ],
  },
  {
    h: 'Security',
    p: [
      'Connections use TLS. Identity documents are stored privately and are not publicly reachable. Access to operational systems is restricted to staff who need it, and privileged actions are logged.',
      'No system is perfectly secure. If we discover a breach affecting you, we will tell you and the regulator as required.',
    ],
  },
  {
    h: 'Children',
    p: [
      'SaaradhiGo is not for children. You must be 18 or older to hold an account.',
    ],
  },
  {
    h: 'Changes and contact',
    p: [
      'If we change this policy we will post the new version here and, for significant changes, tell you in the app.',
      'Questions about this policy: support@saaradhigo.in',
    ],
  },
];

export default function PrivacyPage() {
  return (
    <article className="max-w-3xl">
      <h1 className="text-3xl font-bold">Privacy policy</h1>

      <p
        className="mt-5 text-sm text-amber-200 bg-amber-900/30 border border-amber-800/40 rounded-lg p-3"
        role="note"
      >
        <strong>Draft, pending legal review.</strong> This describes what the
        platform actually does with your data today. It has not yet been
        reviewed by a lawyer against the Digital Personal Data Protection Act,
        and must be before the service opens to the public.
      </p>

      {sections.map((s) => (
        <section key={s.h} className="mt-8">
          <h2 className="text-xl font-semibold text-brand">{s.h}</h2>
          {s.p.map((para) => (
            <p key={para.slice(0, 40)} className="mt-3 text-sm text-white/75 leading-relaxed">
              {para}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
