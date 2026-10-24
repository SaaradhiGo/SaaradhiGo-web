import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact SaaradhiGo',
  description:
    'Get help with a ride, a payment or a driver application. Reach the '
    + 'SaaradhiGo support team.',
};

// NO CONTACT FORM HERE, ON PURPOSE.
//
// A form needs an endpoint that accepts writes from anyone on the internet.
// The backend's support tickets require an authenticated account
// (`/support/tickets/create/`), which is right: a ticket belongs to a person
// and a trip. Adding an unauthenticated one would mean a new public write
// path, spam handling and its own rate limiting -- real work that should be
// decided deliberately, not smuggled in behind a "Contact us" button.
//
// Until then, a signed-in rider raises a ticket from the app (which lands in
// the same queue our team works), and everyone else emails us. Both routes
// reach a person, which is the only thing this page has to achieve.

const routes = [
  {
    heading: 'A problem with a ride you took',
    body: 'Raise it from the SaaradhiGo app — Help & Support — so it arrives attached to the trip. That is the fastest route, because support can see the ride.',
  },
  {
    heading: 'Payments, receipts and refunds',
    body: 'Email us with the trip date and the driver name. Your receipt email has everything we need.',
  },
  {
    heading: 'Driving with us',
    body: 'If your application is stuck or your documents were rejected, email us from the number you applied with.',
  },
  {
    heading: 'A safety concern',
    body: 'If you are in immediate danger, contact the local emergency services first. Then tell us, so we can act on the account.',
  },
];

export default function ContactPage() {
  return (
    <div className="sg-page">
      <h1 className="text-3xl font-bold">Contact us</h1>
      <p className="mt-4 text-ink-muted max-w-2xl">
        We would rather you reached a person than a form. Here is the quickest
        way to get the right one.
      </p>

      <div className="card mt-8">
        <h2 className="text-lg font-semibold">Email</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Support, payments, driver applications and press:
        </p>
        <a
          className="btn-primary inline-block mt-4"
          href="mailto:support@saaradhigo.in?subject=SaaradhiGo%20support%20request"
        >
          support@saaradhigo.in
        </a>
        <p className="mt-3 text-xs text-ink-subtle">
          Include your registered mobile number and, if it is about a trip, the
          date and the driver&apos;s name. It saves a round trip.
        </p>
      </div>

      <section className="mt-10">
        <h2 className="text-xl font-semibold">What to tell us</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {routes.map((r) => (
            <div key={r.heading} className="card">
              <h3 className="font-semibold text-gold-text">{r.heading}</h3>
              <p className="mt-2 text-sm text-ink-muted">{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 card">
        <h2 className="text-lg font-semibold">Are you an operator?</h2>
        <p className="mt-2 text-sm text-ink-muted">
          The operations console is a separate, internal application.
        </p>
        <Link href="/login" className="btn-ghost inline-block mt-3">
          Operator sign-in →
        </Link>
      </section>
    </div>
  );
}
