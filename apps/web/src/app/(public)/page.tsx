import Link from 'next/link';
import BookingPanel from '@/components/BookingPanel';
import MapSurface from '@/components/MapSurface';
import ServiceAreas from '@/components/ServiceAreas';

/**
 * The homepage.
 *
 * LAYOUT
 * A booking product's first screen is the booking form and the place it
 * applies to, side by side, using the width the screen actually has. The
 * previous version was a 1024px column centred in a 1440px window with the
 * panel stacked under a headline, which left a third of the desktop empty
 * and made the product read as an article about a ride-hailing service
 * rather than one you can use.
 *
 * On a phone this is not the same layout compressed: the map region is not
 * rendered at all (it has nothing to show without a provider, and it would
 * push the form below the fold on the device most customers are on), and the
 * panel takes the full width at the top of the screen.
 *
 * WHAT IT DOES NOT CLAIM
 * No fares, no "drivers near you", no ETAs, no testimonials, no app-store
 * badges, no coverage promises, and no drawn map. Where the map belongs,
 * MapSurface states that no provider is configured rather than illustrating
 * one.
 */
export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-10 lg:items-stretch">
        <div className="flex flex-col justify-center">
          <h1 className="text-[2.1rem] sm:text-5xl font-bold leading-[1.06] tracking-tight">
            Know the fare
            <span className="block text-brand">before you get in.</span>
          </h1>
          <p className="mt-3 text-base text-white/55">
            Set your pickup, choose a vehicle, see the price up front.
          </p>

          <div className="mt-6">
            <BookingPanel />
          </div>
        </div>

        {/* The map region. Desktop only: on a phone it would push the form
            off the first screen to show a panel that has nothing to draw. */}
        <div className="hidden lg:block min-h-[32rem]">
          <MapSurface className="h-full" />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section
        className="mt-14 border-t border-white/[0.07] pt-10"
        aria-labelledby="how"
      >
        <h2 id="how" className="sr-only">
          How it works
        </h2>
        <ol className="grid gap-8 sm:grid-cols-3 sm:gap-10">
          {[
            ['Set your pickup', 'Use your location, or type it in.'],
            ['See the fare', 'Choose a vehicle and the price is shown up front.'],
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
                <p className="mt-1 text-sm text-white/55">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-14" aria-labelledby="areas">
        <ServiceAreas />
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-14" aria-labelledby="safety">
        <h2 id="safety" className="text-2xl font-semibold">
          Safety
        </h2>
        <dl className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            [
              'Drivers are checked',
              'Licence, registration and insurance verified before a first trip.',
            ],
            [
              'SOS during the ride',
              'Alerts our operations team and your emergency contact.',
            ],
            [
              'Every trip is recorded',
              'Support can reconstruct what happened on a specific ride.',
            ],
            ['Ratings both ways', 'Riders and drivers rate each other.'],
          ].map(([title, body]) => (
            <div key={title} className="min-w-0">
              <dt className="font-medium text-brand">{title}</dt>
              <dd className="mt-1 text-sm text-white/55">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-14 mb-4 rounded-2xl border border-white/[0.07] bg-ink-800/50 px-6 py-8 sm:px-10 sm:flex sm:items-center sm:justify-between sm:gap-8">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">Drive with SaaradhiGo</h2>
          <p className="mt-1 text-sm text-white/55">
            Apply online, upload your documents, start earning once approved.
          </p>
        </div>
        <Link href="/drive" className="btn-secondary mt-5 sm:mt-0 shrink-0">
          Apply to drive
        </Link>
      </section>
    </>
  );
}
