import BookingPanel from '@/components/BookingPanel';
import ServiceAreas from '@/components/ServiceAreas';
import { ButtonLink } from '@/components/sg/Button';
import { HeroEyebrow } from '@/components/sg/HeroEyebrow';
import { MembershipCard } from '@/components/sg/MembershipCard';
import { PromiseStrip } from '@/components/sg/PromiseStrip';
import { RouteMarker } from '@/components/sg/LocationField';
import {
  ArrowRight,
  AutoGlyph,
  BikeGlyph,
  CarGlyph,
  SuvGlyph,
} from '@/components/sg/icons';

/**
 * The homepage, in the order the design system's HomeScreen specifies:
 * hero, promise strip, ways to ride, service areas, Saaradhi Black, the app,
 * footer.
 *
 * ONE PRIMARY ACTION. It is "See fares", inside the booking panel, because
 * that is what this page is for. The "Ride Black" button in the Saaradhi
 * Black band is therefore `secondary` here even though the handoff's preview
 * draws it as a gold fill: two gold buttons on one page means neither of them
 * is the primary one. That is the design system's own rule applied to its own
 * preview, which composes each section in isolation.
 *
 * WHAT IS REAL AND WHAT IS NOT
 * The hero eyebrow and the service areas come from `/pricing/zones/`. The
 * vehicle classes and their descriptions are product facts. The three
 * promises are things the platform does. Everything the server cannot tell
 * this page yet -- a "from" price per class, the hero's map, a membership
 * name, the app store listings -- is marked TODO below rather than filled
 * with a plausible number.
 */

// The India launch classes, in the design system's order and naming. These
// are product facts, not sample data: the names are fixed ("Saaradhi
// <Class>") and the copy describes what each class is.
//
// TODO(pricing): no "from" price. A per-class floor needs an endpoint that
// returns a minimum fare for a zone without a pickup and destination --
// `/pricing/vehicle-types/` answers "which classes serve this point", not
// "what does the cheapest Sedan ride cost". Until that exists these cards
// carry no price, because an indicative number on a page whose promise is
// "know the fare before you get in" is the one thing it cannot show.
const CLASSES = [
  {
    name: 'Saaradhi Bike',
    glyph: BikeGlyph,
    body: 'One seat, through the traffic. The quickest way across town.',
  },
  {
    name: 'Saaradhi Auto',
    glyph: AutoGlyph,
    body: 'Three seats, metered honestly, for the short hop that used to be an argument.',
  },
  {
    name: 'Saaradhi Sedan',
    glyph: CarGlyph,
    body: 'Four seats and a boot. The everyday ride to the office and the airport.',
  },
  {
    name: 'Saaradhi Black',
    glyph: SuvGlyph,
    body: 'Premium sedans and top-rated Saaradhis, for the arrival that matters.',
    black: true,
  },
];

export default function HomePage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Hero                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="sg-hero">
        {/* TODO(map): the design's hero is a full-bleed map with the
            headline and the booking panel over a left scrim. There is no map
            here, and that is a data problem rather than a styling one: a
            truthful basemap needs a coordinate, and the only ones this page
            could centre on are the rider's own location -- which it will not
            ask for unprompted on a marketing page -- or a zone centroid,
            which `/pricing/zones/` does not return.

            Rendering the surface anyway was worse than leaving it out. It
            cannot draw streets it does not have, so the hero became 880px of
            empty charcoal under the headline, which reads as a page that
            failed rather than as a map still loading.

            To restore it: add a centroid to the zones endpoint, render
            `<div className="sg-hero__map"><MapSurface pickup={centroid} />
            <div className="sg-scrim-left" /></div>` here, and put
            `min-height: 880px` back on `.sg-hero`. MapSurface already draws
            the design's basemap, route and markers from the map tokens. */}

        <div className="sg-hero__inner">
          <HeroEyebrow />
          <h1 className="sg-hero__h1">
            Know the fare
            <br />
            <em>before you get in.</em>
          </h1>
          {/* The handoff's preview ends this line with "No surge surprises."
              The brief's copy rules forbid the word outside the single phrase
              "No surge after you book", which the promise strip below carries
              in full, so the sentence stops here. */}
          <p className="body-lg sg-hero__sub">
            Set your pickup, choose a vehicle, see the price up front.
          </p>

          <div className="sg-hero__panel">
            <BookingPanel />
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The three promises                                               */}
      {/* ---------------------------------------------------------------- */}
      <div className="sg-wrap">
        <PromiseStrip />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Ways to ride                                                     */}
      {/* ---------------------------------------------------------------- */}
      <section className="sg-section" aria-labelledby="ways">
        <div className="sg-head">
          <div>
            <span className="sg-eyebrow">Ways to ride</span>
            <h2 id="ways" className="sg-h2">
              A Saaradhi for <em>every journey.</em>
            </h2>
          </div>
          <p className="sg-lead">
            From a quick bike hop to a quiet sedan after a long flight. Every
            class shows its fare before you book.
          </p>
        </div>

        <ul className="sg-classes">
          {CLASSES.map(({ name, glyph: Glyph, body, black }) => (
            <li
              key={name}
              className={`sg-class ${black ? 'is-black sg-on-noir' : ''}`.trim()}
            >
              <span className="sg-class__glyph" aria-hidden="true">
                <Glyph />
              </span>
              <h3>{name}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ----------------------------------------------------------------
          Where we operate.

          Not in the handoff's HomeScreen order, and kept anyway: this is the
          only place on the site that states which cities SaaradhiGo serves,
          it reads the dispatcher's own zones, and removing it to match a
          preview would have traded a fact for a gap.
          ---------------------------------------------------------------- */}
      <section className="sg-section pt-0">
        <ServiceAreas />
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Saaradhi Black — `noir` in both themes                           */}
      {/* ---------------------------------------------------------------- */}
      <section className="sg-black sg-on-noir" aria-labelledby="black">
        <div>
          <span className="sg-eyebrow text-gold-500">Saaradhi Black</span>
          <h2 id="black" className="sg-h2 text-on-noir">
            Arrive like
            <br />
            <em className="text-gold-500">it matters.</em>
          </h2>
          <p className="sg-lead text-on-noir-muted">
            Premium sedans, top-rated Saaradhis, priority pickup at the airport
            and a quiet cabin when you want one.
          </p>
          {/* TODO(membership): the perks below are the tier's product
              definition and are safe to state. What does not exist yet is the
              membership itself -- no tier record, no enrolment endpoint, no
              eligibility rule -- so this button goes to the booking flow,
              where a rider can choose the Black class on a real trip, rather
              than to a sign-up page for a programme that cannot enrol them. */}
          <ul className="sg-black__list">
            <li>Priority pickup at the airport</li>
            <li>Top-rated drivers only</li>
            <li>A quiet-ride option on every trip</li>
          </ul>
          {/* Secondary, not primary: the page's one gold button is "See
              fares". */}
          <ButtonLink href="/book" variant="secondary" size="lg">
            Ride Black
            <ArrowRight />
          </ButtonLink>
        </div>
        <div className="sg-black__card">
          <MembershipCard />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* The app                                                          */}
      {/* ---------------------------------------------------------------- */}
      <section className="sg-section sg-app" aria-labelledby="app">
        <div>
          <span className="sg-eyebrow">The app</span>
          <h2 id="app" className="sg-h2">
            Your Saaradhi,
            <br />
            <em>in your pocket.</em>
          </h2>
          <p className="sg-lead">
            Book in three taps, track your ride live, pay the way that suits
            you, and share every trip with family.
          </p>

          {/* TODO(stores): the rider app is not published yet, so there are no
              App Store or Play listings to link to. These are rendered as
              disabled controls that say so, rather than as working-looking
              buttons behind `href="#"` -- a store button that does nothing is
              the kind of thing a visitor tries exactly once. Swap each one for
              an `<a className="sg-store" href="{listing}">` when the listings
              go live. */}
          <div className="mt-sg-6 flex flex-wrap gap-sg-3">
            <span className="sg-store" aria-disabled="true">
              <span>
                <small>Not yet published</small>
                iPhone
              </span>
            </span>
            <span className="sg-store" aria-disabled="true">
              <span>
                <small>Not yet published</small>
                Android
              </span>
            </span>
          </div>
          <p className="caption text-ink-subtle mt-sg-3">
            Booking, live tracking and receipts all work in your browser today.
          </p>
        </div>

        {/* The phone, as the design presents mobile screens.
            TODO(app-preview): the handoff fills this frame with sample places
            and distances ("Inorbit Mall · 4.2 km"). Those are not shown: a
            recent-destinations list belongs to a signed-in rider, and inventing
            three of them on a public page is exactly the sample content the
            brief rules out. The frame carries the real chrome -- the greeting,
            the search field and the saved-place chips -- and the list below it
            fills in once `/ride/places/recent/` exists. */}
        <div className="sg-app__phone" aria-hidden="true">
          <div className="sg-phone">
            <div className="sg-statusbar">
              <span className="sg-num">9:41</span>
              <i />
            </div>
            <div className="px-sg-4 pb-sg-4 grid gap-sg-4">
              <div>
                <p className="sg-sheet__sub">Good evening</p>
                <h3 className="display-lg text-[32px] leading-[36px] m-0">
                  Where to?
                </h3>
              </div>
              <div className="sg-search">
                <RouteMarker kind="drop" />
                Search destination
                <span className="sg-search__time">Now</span>
              </div>
              <div className="flex gap-sg-2 overflow-hidden">
                <span className="sg-chip">Home</span>
                <span className="sg-chip">Work</span>
                <span className="sg-chip">Airport</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
