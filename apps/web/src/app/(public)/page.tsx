import Link from 'next/link';
import { ButtonLink } from '@/components/sg/Button';
import { HeroBooking } from '@/components/home/HeroBooking';
import { ImageSlot } from '@/components/home/ImageSlot';
import { RideCategories } from '@/components/home/RideCategories';
import { OperatingCities } from '@/components/home/OperatingCities';
import { Lock, Phone, Shield } from '@/components/sg/icons';

/**
 * The SaaradhiGo public homepage.
 *
 * Built to the implementation contract: 1200px column, 72px header, the
 * 8/16/24/32/48/64/96 spacing scale, and seven sections in a fixed order.
 * Layout lives in `src/styles/home.css`; the booking flow it hands off to is
 * untouched.
 *
 * WHAT IT CLAIMS IS WHAT THE PLATFORM DOES. Ride categories come from
 * `/pricing/vehicle-types/`; cities come from `/pricing/zones/` and are
 * described as configured service areas rather than as live coverage, since
 * a priced zone does not prove a driver is online in it. The safety section
 * lists three implemented capabilities and makes none of the claims a safety
 * section is expected to make -- no 24/7 response desk, no background-check
 * programme, no insurance, no ride recording.
 *
 * No fabricated statistics, testimonials, partner logos, app-store badges or
 * contact details. No `href="#"`: every link resolves to a route that exists
 * or to an anchor on this page.
 */

const STEPS = [
  { n: '01', title: 'Enter your destination', body: 'Choose where you want to go.' },
  { n: '02', title: 'Choose your ride', body: 'Compare the available ride options.' },
  { n: '03', title: 'Confirm and go', body: 'Review your trip and request your ride.' },
];

/** Implemented and shipping. Nothing aspirational. */
const SAFETY = [
  {
    icon: Lock,
    title: 'A PIN starts every ride',
    body: 'Your driver cannot start the trip until you give them the four-digit PIN shown on your screen. It is verified on our servers, not in the app.',
  },
  {
    icon: Phone,
    title: 'Live trip tracking',
    body: "Your driver's position updates on your map for the length of the trip, and the route being travelled is drawn as you go.",
  },
  {
    icon: Shield,
    title: 'Alerts reach our operations team',
    body: 'A safety alert raised during a ride is delivered to our operations team with the trip and its location attached.',
  },
];

export default function HomePage() {
  return (
    <>
      {/* 1 — Hero ------------------------------------------------------- */}
      <section className="hp" aria-labelledby="hero-title">
        <div className="hp-hero">
          <div>
            <h1 id="hero-title" className="hp-hero__title">
              Your city.
              <span>Your ride.</span>
            </h1>
            <p className="hp-hero__sub">
              Wherever you&rsquo;re headed, find a ride that works for you.
            </p>
            <HeroBooking />
          </div>

          <div className="hp-hero__media">
            <ImageSlot needs="Licensed photograph: an Indian urban street scene with a passenger and car. 4:3, supplied by the brand team." />
          </div>
        </div>
      </section>

      {/* 2 — Choose your ride -------------------------------------------- */}
      <RideCategories />

      {/* 3 — Getting there is simple ------------------------------------- */}
      <section className="hp hp-section" id="how-it-works" aria-labelledby="how">
        <h2 id="how" className="hp-h2">
          Getting there is simple
        </h2>
        <ol className="hp-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="hp-step">
              <div className="hp-step__n">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 4 — Drive with SaaradhiGo --------------------------------------- */}
      <section className="hp hp-section" id="drive" aria-labelledby="drive-h">
        <div className="hp-split">
          <div>
            <h2 id="drive-h" className="hp-h2">
              Drive with SaaradhiGo
            </h2>
            <p className="hp-lead">
              Interested in driving? Learn how to get started with SaaradhiGo.
            </p>
            <div className="mt-sg-6">
              {/* Driver onboarding is live: `/driver/sign-up` is a working
                  route backed by the document-upload flow. */}
              <ButtonLink href="/driver/sign-up" variant="primary" size="lg">
                Become a driver
              </ButtonLink>
            </div>
          </div>
          <div className="hp-split__media">
            <ImageSlot needs="Licensed photograph: a SaaradhiGo driver with their vehicle. 3:2, supplied by the brand team." />
          </div>
        </div>
      </section>

      {/* 5 — Safety ------------------------------------------------------ */}
      <section className="hp hp-section" id="safety" aria-labelledby="safety-h">
        <h2 id="safety-h" className="hp-h2">
          Safety
        </h2>
        <p className="hp-lead">
          Your safety matters. Learn about the safety features and support
          available during your journey.
        </p>
        <ul className="hp-facts">
          {SAFETY.map(({ icon: Icon, title, body }) => (
            <li key={title} className="hp-fact">
              <span className="hp-fact__icon" aria-hidden="true">
                <Icon />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* 6 — Where we operate -------------------------------------------- */}
      <OperatingCities />

      {/* 7 — Closing ----------------------------------------------------- */}
      <section className="hp" aria-labelledby="closing">
        <div className="hp-closing">
          <h2 id="closing" className="hp-h2">
            Ready to go?
          </h2>
          <p className="hp-lead">
            Enter your destination and explore your ride options.
          </p>
          <div className="hp-closing__actions">
            <ButtonLink href="/book" variant="primary" size="lg">
              Book a ride
            </ButtonLink>
            <Link href="/contact" className="sg-link self-center">
              Contact support
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
