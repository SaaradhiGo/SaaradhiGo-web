import Link from 'next/link';
import BookingPanel from '@/components/BookingPanel';
import ServiceAreas from '@/components/ServiceAreas';

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
      {/* Above the fold: the proposition on the left, a working booking
          panel on the right. The first screen has to answer "how do I book a
          ride?" without scrolling, which a column of marketing copy did not. */}
      <section className="grid gap-8 lg:grid-cols-[1.05fr_minmax(0,24rem)] lg:items-center py-4 sm:py-8">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/5 px-3 py-1 text-xs font-medium tracking-wide text-brand">
            Fare agreed before you travel
          </p>
          <h1 className="mt-5 text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.05] tracking-tight">
            Know the fare
            <span className="block text-brand">before you get in.</span>
          </h1>
          <p className="mt-5 text-lg text-white/65 max-w-xl">
            Enter where you are and where you are going. We show the price and
            the vehicle types available at your pickup, in that city&apos;s own
            currency.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/drive" className="btn-secondary">
              Drive with SaaradhiGo
            </Link>
            <Link href="/my-trips" className="btn-ghost self-center">
              Your trips and receipts →
            </Link>
          </div>
        </div>

        <div className="lg:justify-self-end w-full min-w-0">
          <BookingPanel />
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

      <section className="mt-14" aria-labelledby="areas">
        <ServiceAreas />
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
