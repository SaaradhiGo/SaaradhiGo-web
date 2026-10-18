import Link from 'next/link';

// The home page. Deliberately modest: this is a controlled pilot, so it
// claims no city coverage, no fleet size and no ratings it cannot stand
// behind. Everything stated here is something the platform actually does.
export default function HomePage() {
  return (
    <>
      <section className="py-8">
        <p className="text-brand text-sm font-semibold tracking-wide uppercase">
          India · controlled pilot
        </p>
        <h1 className="mt-3 text-4xl sm:text-5xl font-bold leading-tight">
          Rides you can count on,
          <br />
          fares you can see first.
        </h1>
        <p className="mt-5 text-white/70 max-w-2xl text-lg">
          SaaradhiGo is a ride-hailing service built for India. You see the
          fare before you book, pay in cash or online, and get a receipt for
          every trip. Riding happens in the Android app — this site is for
          signing in, driving with us, and getting help.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/sign-up" className="btn-primary">
            Create a rider account
          </Link>
          <Link href="/drive" className="btn-ghost border border-white/10 rounded-xl px-4 py-2">
            Drive with us
          </Link>
        </div>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {[
          {
            title: 'The fare up front',
            body: 'You see an estimate before you book, with the breakdown. No meter surprises at the end of the trip.',
          },
          {
            title: 'Cash or online',
            body: 'Pay the driver in cash, or online. Either way the trip is recorded and you get a receipt by email.',
          },
          {
            title: 'Help that reaches a person',
            body: 'Raise an issue from the app or this site and it becomes a ticket our support team works through.',
          },
        ].map((f) => (
          <div key={f.title} className="card">
            <h2 className="font-semibold text-brand">{f.title}</h2>
            <p className="mt-2 text-sm text-white/70">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-12 card">
        <h2 className="text-xl font-semibold">Safety is built in, not bolted on</h2>
        <ul className="mt-4 space-y-2 text-sm text-white/70 list-disc list-inside">
          <li>Every driver is verified before their first trip — documents and vehicle are reviewed by our team.</li>
          <li>An SOS control during the ride alerts our operations team and your emergency contact.</li>
          <li>Trips are tracked end to end, so support can reconstruct what happened.</li>
          <li>Ratings go both ways, and we read them.</li>
        </ul>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <h2 className="text-lg font-semibold">Riding with SaaradhiGo</h2>
          <p className="mt-2 text-sm text-white/70">
            Book from the Android app: set your pickup and destination, see the
            fare, and get matched with a nearby driver. Cancel free before a
            driver is on the way.
          </p>
          <Link href="/sign-in" className="btn-ghost inline-block mt-4">
            Already have an account? Sign in →
          </Link>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold">Driving with SaaradhiGo</h2>
          <p className="mt-2 text-sm text-white/70">
            Earn per trip with transparent commission, see your earnings daily,
            and withdraw to your bank. You bring the vehicle and the licence; we
            bring the riders.
          </p>
          <Link href="/drive" className="btn-ghost inline-block mt-4">
            What you need to start →
          </Link>
        </div>
      </section>
    </>
  );
}
