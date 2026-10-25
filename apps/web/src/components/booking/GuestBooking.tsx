'use client';

import Link from 'next/link';
import { ButtonLink } from '@/components/sg/Button';
import { Photo } from '@/components/home/Photo';
import { Serviceability } from '@/lib/booking';
import { publicRideName } from '@/lib/vehicles';
import { useT } from '@/i18n/LocaleProvider';
import { usePages } from '@/i18n/usePages';

/**
 * What a signed-out visitor sees after pressing "See ride options".
 *
 * THE OLD SCREEN THREW THE TRIP AWAY. It was a card reading "Sign in to book
 * a ride" over two buttons: the pickup and destination the visitor had just
 * typed on the homepage were parsed, held in state and never shown, and
 * signing in returned them to `/` to start again. That is the single worst
 * moment in the product -- the step where someone has committed effort is the
 * step that asked them to throw it away.
 *
 * WHAT IS SHOWN BEFORE SIGNING IN, AND WHY ONLY THIS.
 * `/pricing/vehicle-types/` is `AllowAny` and already answers anonymous
 * callers from the homepage, so the classes really available at this pickup
 * are real information we may show. `/ride/estimate-fare/` is
 * `IsAuthenticated` and prices a specific trip against a route the server
 * fetches from a paid provider, so there is NO guest fare here and none is
 * invented. The screen says that plainly rather than leaving a blank where a
 * price should be.
 *
 * AN UNSERVICEABLE PICKUP NEVER ASKS ANYONE TO REGISTER. If the server says
 * it does not operate at that point, this says so and offers to change the
 * pickup. Inviting someone to create an account for a city we cannot drive
 * in is worse than saying no.
 */
export function GuestBooking({
  pickupLabel,
  destinationLabel,
  service,
  checking,
  returnTo,
}: {
  pickupLabel: string;
  destinationLabel: string;
  service: Serviceability | null;
  /** True while the pickup point is still being checked. */
  checking: boolean;
  /** The URL to come back to, carrying the trip. */
  returnTo: string;
}) {
  const t = useT();
  const g = t.guest;
  const ridePage = usePages().ride;
  const hasTrip = Boolean(pickupLabel || destinationLabel);
  const outsideArea = service != null && !service.serviceable;

  const next = encodeURIComponent(returnTo);

  return (
    <div className="hp hp-masthead">
      <h1 className="hp-h1">{g.heading}</h1>

      {/* Two columns on a desktop. One column of text against half a screen
          of black was the same unused space the drive page had. */}
      <div className="bk-layout">
        <div>

        {hasTrip && (
          <div className="bk-trip">
            <p className="bk-trip__row">
              <span className="hp-field__marker hp-field__marker--pickup" aria-hidden="true" />
              <span className="bk-trip__label">{g.from}</span>
              <strong>{pickupLabel || g.unset}</strong>
            </p>
            <p className="bk-trip__row">
              <span className="hp-field__marker hp-field__marker--drop" aria-hidden="true" />
              <span className="bk-trip__label">{g.to}</span>
              <strong>{destinationLabel || g.unset}</strong>
            </p>
          </div>
        )}

        {outsideArea ? (
          <>
            <p className="hp-lead">{g.outsideArea}</p>
            <div className="hp-actions">
              <ButtonLink href="/" variant="primary" size="lg">
                {g.changePickup}
              </ButtonLink>
            </div>
          </>
        ) : (
          <>
            {checking && !service && (
              <p className="hp-lead" role="status">
                {g.checking}
              </p>
            )}

            {service?.serviceable && service.vehicle_types.length > 0 && (
              <div className="bk-available">
                <h2>{g.availableHere}</h2>
                <ul>
                  {service.vehicle_types.map((v) => (
                    <li key={v.type}>{publicRideName(v.type, t.rideNames)}</li>
                  ))}
                </ul>
                {service.zone?.name && <p className="hp-hint">{g.inZone} {service.zone.name}</p>}
              </div>
            )}

            <p className="hp-lead">{g.fareAfterSignIn}</p>

            <div className="hp-actions">
              <ButtonLink href={`/sign-in?next=${next}`} variant="primary" size="lg">
                {g.signInContinue}
              </ButtonLink>
              <ButtonLink href={`/sign-up?next=${next}`} variant="secondary" size="lg">
                {g.createAccount}
              </ButtonLink>
            </div>

            <p className="hp-hint">{g.tripKept}</p>
          </>
        )}

          <p className="hp-hint">
            <Link href="/ride" className="sg-link">
              {g.howItWorks}
            </Link>
          </p>
        </div>

        <div className="bk-layout__media">
          <Photo
            src="/photography/ride-sedan.jpg"
            alt={ridePage.photoAlt ?? ''}
            sizes="(max-width: 1024px) 100vw, 45vw"
            // Down a little: the car, not the shopfront above it.
            position="50% 62%"
          />
        </div>
      </div>
    </div>
  );
}
