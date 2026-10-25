import type { Metadata } from 'next';
import { SUPPORT_EMAIL } from '@/lib/support';

export const metadata: Metadata = {
  title: 'Terms of service — SaaradhiGo',
  description: 'The terms on which you use SaaradhiGo as a rider or a driver.',
  alternates: { canonical: '/terms' },
};

// Same standing as the privacy page: written from how the platform actually
// behaves, and explicitly a draft. Terms allocate liability, and that is a
// decision for the business and its lawyers, not something to be inferred
// from source code.

const sections = [
  {
    h: 'What SaaradhiGo is',
    p: [
      'SaaradhiGo connects riders with independent drivers. We operate the platform, verify drivers, set the fare structure and handle payments. We do not own the vehicles and we do not employ the drivers.',
    ],
  },
  {
    h: 'Your account',
    p: [
      'You must be 18 or older and give accurate information. Your mobile number identifies your account; keep access to it secure, because anyone who can receive your one-time codes can sign in as you.',
      'One account per person. We may suspend an account we believe is being used fraudulently, shared, or used to harass someone.',
    ],
  },
  {
    h: 'Rides, fares and cancellation',
    p: [
      'The fare shown before you book is an estimate based on distance, time and the applicable rate. The final fare may differ if the route or the trip changes.',
      'You can cancel. Cancelling after a driver is on the way may incur a cancellation fee, which is shown to you.',
      'Payment is due at the end of the trip, in cash or online. An unpaid fare may block further bookings until it is settled.',
    ],
  },
  {
    h: 'If you drive with us',
    p: [
      'You are an independent contractor, not an employee. You choose when to go online.',
      'You must hold a valid licence, keep your vehicle registration and insurance current, and keep the documents on your account up to date. We may suspend you if they lapse.',
      'Commission is deducted per trip at the rate shown in the driver app. Earnings are paid to the bank account on your account.',
      'Accepting a trip and not completing it, manipulating fares, or carrying someone other than the matched rider may end your access.',
    ],
  },
  {
    h: 'Conduct and safety',
    p: [
      'Treat the other person in the vehicle with respect. Harassment, discrimination, intoxication at the wheel, and weapons are grounds for immediate removal.',
      'Trips are recorded on the platform — the route, the times, and the fare. Safety reports are investigated.',
    ],
  },
  {
    h: 'Our responsibility, and its limits',
    p: [
      'We provide the platform as it is. We work to keep it available, but we do not promise it will be uninterrupted or error-free.',
      'Because drivers are independent, we are not responsible for how a driver drives. We are responsible for operating the platform honestly: charging what we said we would charge, paying what we said we would pay, and acting on safety reports.',
      'The precise limitation of liability is part of the legal review noted at the top of this page.',
    ],
  },
  {
    h: 'Ending it',
    p: [
      'You can stop using SaaradhiGo and ask us to delete your account at any time.',
      'We may end your access for a breach of these terms, for fraud, or where we must for legal reasons. Money already owed to you is still owed.',
    ],
  },
  {
    h: 'Law and contact',
    p: [
      'These terms are governed by the laws of India.',
      `Questions: ${SUPPORT_EMAIL}`,
    ],
  },
];

export default function TermsPage() {
  return (
    <article className="sg-page max-w-3xl">
      <h1 className="text-3xl font-bold">Terms of service</h1>

      <p
        className="mt-5 alert alert-info"
        role="note"
      >
        <strong>Draft, pending legal review.</strong> This reflects how the
        platform actually operates. It is not a reviewed contract, and must be
        checked by a lawyer before the service opens to the public.
      </p>

      {sections.map((s) => (
        <section key={s.h} className="mt-8">
          <h2 className="text-xl font-semibold text-gold-text">{s.h}</h2>
          {s.p.map((para) => (
            <p key={para.slice(0, 40)} className="mt-3 text-sm text-ink-muted leading-relaxed">
              {para}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
