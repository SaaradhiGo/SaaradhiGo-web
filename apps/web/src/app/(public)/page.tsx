import Link from 'next/link';

/**
 * The homepage.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM
 * No fare estimates, no "drivers near you", no testimonials, no app-store
 * badges and no uptime or coverage promises. Every one of those would be a
 * number or a quote we cannot stand behind today, and a ride-hailing service
 * that overstates on its homepage has told the customer how much to trust the
 * fare screen.
 *
 * ON BOOKING
 * Booking runs over an authenticated WebSocket dispatch flow in the apps.
 * There is no browser booking surface, so the page says where booking happens
 * instead of implying a form that does not exist, and the next action it
 * offers -- create the account you will use in the app -- is one that works
 * today.
 */
export default function HomePage() {
  return (
    <>
      <section className="py-6 sm:py-10">
        <h1 className="text-4xl sm:text-5xl font-bold leading-[1.1] max-w-3xl">
          Rides across India, with the fare agreed before you get in.
        </h1>
        <p className="mt-5 text-lg text-white/70 max-w-2xl">
          SaaradhiGo is a ride-hailing service built for Indian cities. You see
          what a trip costs before you book it, pay in cash or online, and get a
          receipt for every ride.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link href="/sign-up" className="btn-primary sm:w-auto">
            Create a rider account
          </Link>
          <Link href="/drive" className="btn-secondary sm:w-auto">
            Drive with SaaradhiGo
          </Link>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="riders">
        <h2 id="riders" className="text-2xl font-semibold">
          For riders
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            {
              t: 'The price before the trip',
              b: 'The fare is calculated from distance and time and shown to you before you confirm. The breakdown is on your receipt.',
            },
            {
              t: 'Pay the way you want',
              b: 'Cash to the driver, or online. Either way the trip is recorded and the receipt reaches your email.',
            },
            {
              t: 'Help from a person',
              b: 'Raise a problem about a specific trip and it becomes a ticket our support team works through, with the ride in front of them.',
            },
          ].map((c) => (
            <article key={c.t} className="card">
              <h3 className="font-semibold text-brand">{c.t}</h3>
              <p className="mt-2 text-sm text-white/70">{c.b}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-14" aria-labelledby="booking">
        <div className="card sm:flex sm:items-center sm:gap-8">
          <div className="sm:flex-1">
            <h2 id="booking" className="text-2xl font-semibold">
              Booking happens in the app
            </h2>
            <p className="mt-3 text-white/70">
              Rides are booked in the SaaradhiGo Android app, where we can use
              your live location to find your pickup and keep you and your
              driver connected for the whole trip. The website is where you
              create your account, get help and manage your details.
            </p>
            <p className="mt-3 text-sm text-white/55">
              Create your account here and sign in with the same email on the
              app.
            </p>
          </div>
          <div className="mt-5 sm:mt-0 sm:w-56 shrink-0">
            <Link href="/sign-up" className="btn-primary w-full">
              Create your account
            </Link>
            <Link href="/contact" className="btn-ghost block text-center mt-3">
              Ask us about availability
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="drivers">
        <h2 id="drivers" className="text-2xl font-semibold">
          For drivers
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {[
            {
              t: 'See the fare before you accept',
              b: 'Every offer shows where it goes and what it pays. You decide with the number in front of you.',
            },
            {
              t: 'Commission you can check',
              b: 'The commission is shown per trip, and your daily and weekly earnings are in the app.',
            },
            {
              t: 'Paid to your bank',
              b: 'Request a payout from your earnings balance to the account registered to you.',
            },
          ].map((c) => (
            <article key={c.t} className="card">
              <h3 className="font-semibold text-brand">{c.t}</h3>
              <p className="mt-2 text-sm text-white/70">{c.b}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <Link href="/driver/sign-up" className="btn-primary sm:w-auto">
            Apply to drive
          </Link>
          <Link href="/drive" className="btn-secondary sm:w-auto">
            What you need to start
          </Link>
        </div>
      </section>

      <section className="mt-14" aria-labelledby="safety">
        <div className="card">
          <h2 id="safety" className="text-2xl font-semibold">
            Safety
          </h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 text-sm text-white/70">
            <li>
              Every driver&apos;s licence, vehicle registration and insurance is
              checked by our team before their first trip.
            </li>
            <li>
              An SOS control during the ride alerts our operations team and your
              emergency contact.
            </li>
            <li>
              Trips are recorded end to end, so support can reconstruct what
              happened on a specific ride.
            </li>
            <li>Riders and drivers rate each other, and we read the ratings.</li>
          </ul>
        </div>
      </section>
    </>
  );
}
