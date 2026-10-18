import Link from 'next/link';
import BookingPanel from '@/components/BookingPanel';
import ServiceAreas from '@/components/ServiceAreas';

/**
 * The homepage.
 *
 * THE BOOKING PANEL IS THE PAGE, not a column beside it. Someone arriving
 * here wants a ride; the first thing under the headline is the form that
 * gets them one, centred, at full width on a phone.
 *
 * WHAT IT DELIBERATELY DOES NOT CLAIM
 * No fare estimates, no "drivers near you", no testimonials, no app-store
 * badges, no coverage or uptime promises, no map. Every one of those would
 * be a number, a quote or a picture we cannot stand behind, and a
 * ride-hailing service that overstates on its homepage has told the customer
 * exactly how much to trust the fare screen.
 *
 * The decoration is CSS only -- a warm glow and a faint route motif. It is
 * not a map and is marked aria-hidden, because a decorative line that looks
 * like a route must never be mistaken for one.
 */
export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero: headline, then the booking panel directly under it.        */}
      {/* ---------------------------------------------------------------- */}
      <section className="relative isolate pt-2 pb-10 sm:pt-6 sm:pb-16">
        <div aria-hidden="true" className="hero-glow" />
        <div aria-hidden="true" className="hero-routes" />

        <div className="relative mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand/25 bg-brand/[0.07] px-3 py-1 text-xs font-medium tracking-wide text-brand">
            The fare is agreed before you travel
          </p>
          <h1 className="mt-5 text-4xl sm:text-5xl lg:text-[3.5rem] font-bold leading-[1.04] tracking-tight">
            Know the fare
            <span className="block text-brand">before you get in.</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg text-white/60">
            Tell us where you are and where you are going.
          </p>
        </div>

        <div className="relative mt-8 sm:mt-10 mx-auto w-full max-w-xl">
          <BookingPanel />
        </div>

        <div className="relative mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
          <Link href="/drive" className="text-brand hover:underline">
            Drive with SaaradhiGo
          </Link>
          <Link href="/my-trips" className="text-white/60 hover:text-white">
            Your trips and receipts
          </Link>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Three steps, as a numbered strip rather than three more cards.   */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-white/[0.07] py-10" aria-labelledby="how">
        <h2 id="how" className="sr-only">
          How it works
        </h2>
        <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6">
          {[
            ['Set your pickup', 'Use your location, or type it in.'],
            ['See the fare', 'Pick a vehicle and the price is shown up front.'],
            ['Ride and pay', 'Cash to the driver or online. Receipt by email.'],
          ].map(([title, body], i) => (
            <li key={title} className="flex gap-4">
              <span
                aria-hidden="true"
                className="shrink-0 grid place-items-center h-9 w-9 rounded-full border border-brand/30 text-brand font-semibold text-sm"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold">{title}</h3>
                <p className="mt-1 text-sm text-white/60">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="py-12" aria-labelledby="areas">
        <ServiceAreas />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Safety: a band of short statements, not a card of bullet points. */}
      {/* ---------------------------------------------------------------- */}
      <section
        className="rounded-3xl border border-white/[0.07] bg-ink-800/50 px-6 py-10 sm:px-10"
        aria-labelledby="safety"
      >
        <h2 id="safety" className="text-2xl font-semibold">
          Safety
        </h2>
        <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {[
            [
              'Drivers are checked',
              'Licence, registration and insurance are verified before a first trip.',
            ],
            [
              'SOS during the ride',
              'Alerts our operations team and your emergency contact.',
            ],
            [
              'Every trip is recorded',
              'Support can reconstruct what happened on a specific ride.',
            ],
            [
              'Ratings both ways',
              'Riders and drivers rate each other, and we read them.',
            ],
          ].map(([title, body]) => (
            <div key={title} className="min-w-0">
              <dt className="font-medium text-brand">{title}</dt>
              <dd className="mt-1 text-sm text-white/60">{body}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}
