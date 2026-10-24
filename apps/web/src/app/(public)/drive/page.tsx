import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Drive with SaaradhiGo',
  description:
    'Earn per trip with SaaradhiGo. Transparent commission, daily earnings, '
    + 'and withdrawals to your bank account.',
};

const steps = [
  {
    n: '1',
    title: 'Confirm your number',
    body: 'A one-time code to your mobile creates your driver account.',
  },
  {
    n: '2',
    title: 'Submit your documents',
    body: 'Licence, vehicle registration, insurance and your bank details, from the driver app.',
  },
  {
    n: '3',
    title: 'Get verified',
    body: 'Our operations team reviews your documents. You are told when you are approved.',
  },
  {
    n: '4',
    title: 'Go online and earn',
    body: 'Accept trips near you, see each fare before you accept, and track your earnings daily.',
  },
];

export default function DrivePage() {
  return (
    <div className="sg-page">
      <section>
        <h1 className="text-3xl sm:text-4xl font-bold">Drive with SaaradhiGo</h1>
        <p className="mt-4 text-ink-muted max-w-2xl text-lg">
          You bring the vehicle and the licence. We bring the riders, the
          dispatch, and a fare you can see before you accept.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/driver/sign-up" className="btn-primary">
            Apply to drive
          </Link>
          <Link
            href="/driver/sign-in"
            className="btn-ghost border border-line rounded-xl px-4 py-2"
          >
            Driver sign in
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-xl font-semibold">How it works</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.n} className="card flex gap-4">
              <span
                className="shrink-0 h-8 w-8 rounded-full bg-gold-500 text-on-gold font-bold grid place-items-center"
                aria-hidden="true"
              >
                {s.n}
              </span>
              <div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        <div className="card">
          <h2 className="font-semibold text-gold-text">Transparent earnings</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Commission is shown per trip, not buried. Your daily and weekly
            earnings are in the app.
          </p>
        </div>
        <div className="card">
          <h2 className="font-semibold text-gold-text">Withdraw to your bank</h2>
          <p className="mt-2 text-sm text-ink-muted">
            Request a payout from your earnings balance to the account you
            registered.
          </p>
        </div>
        <div className="card">
          <h2 className="font-semibold text-gold-text">Support when it matters</h2>
          <p className="mt-2 text-sm text-ink-muted">
            An SOS control during a trip, and a support team that can see what
            happened on the ride.
          </p>
        </div>
      </section>

      <section className="mt-12 card">
        <h2 className="text-lg font-semibold">Requirements</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-muted list-disc list-inside">
          <li>A valid driving licence for the country you drive in</li>
          <li>Vehicle registration certificate and valid insurance</li>
          <li>A bank account in your name for payouts</li>
          <li>An Android phone to run the driver app</li>
        </ul>
        <p className="mt-4 text-sm text-ink-subtle">
          Questions before you apply?{' '}
          <Link href="/contact" className="sg-link">
            Talk to us
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
