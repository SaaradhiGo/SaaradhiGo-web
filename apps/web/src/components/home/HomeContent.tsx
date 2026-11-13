'use client';

import { ExampleLines, ExampleTag } from '@/components/sg/ExampleRequest';

import Link from 'next/link';
import { HeroBooking } from '@/components/home/HeroBooking';
import { HeroMapArt } from '@/components/art/HeroMapArt';
import { RideMiniMap } from '@/components/art/MiniMaps';
import {
  BigLockIcon, CarIcon, LockIcon, PhoneDeviceIcon, PinIcon, ShieldAlertIcon, ShieldIcon,
} from '@/components/sg/SiteIcons';
import { useSite } from '@/i18n/site';

/**
 * The homepage, as approved on 2026-11-07 (design/website-2026-11-07,
 * Home.html and HomePhone.html).
 *
 * Desktop: a 640px hero over the illustrated map, then "Honest for the rider.
 * Honest for the driver." with two phone mock-ups, the safety row and, once
 * the apps are in the stores, the app band.
 *
 * Phone: the headline, the lead and the booking panel, then the map as a
 * card, then the two sides and safety as plain cards.
 *
 * The map is a drawing: no tiles, no location prompt on load. The mock-ups
 * are HTML, so they stay sharp, and they carry no numbers: the driver's
 * request shows its fare, commission and earning as bars.
 */
const STORE = {
  rider: process.env.NEXT_PUBLIC_RIDER_APP_URL || '',
  driver: process.env.NEXT_PUBLIC_DRIVER_APP_URL || '',
};

export function HomeContent() {
  const h = useSite().home;
  const safetyIcons = [
    { icon: <BigLockIcon />, tone: 's-tile--gold' },
    { icon: <PinIcon />, tone: 's-tile--green' },
    { icon: <ShieldAlertIcon />, tone: 's-tile--red' },
  ];

  return (
    <div className="s-cb">
      <section className="s-hero" aria-labelledby="hero-title">
        <HeroMapArt className="s-hero__map s-only-desk" />
        <div className="s-hero__fade s-only-desk" aria-hidden="true" />
        <div className="s-wrap s-hero__inner">
          <div className="s-hero__copy">
            <h1 id="hero-title" className="t-display">
              {h.titleTop}
              <br />
              <span className="t-accent">{h.titleBottom}</span>
            </h1>
            <p className="s-hero__lead">
              <span className="s-only-desk">{h.lead}</span>
              <span className="s-only-phone">{h.leadPhone}</span>
            </p>
            <HeroBooking />
            <div className="s-hero__ticks s-only-desk">
              <span><LockIcon />{h.tickLocked}</span>
              <span><ShieldIcon />{h.tickSafety}</span>
            </div>
          </div>
        </div>
        <div className="s-only-desk" aria-hidden="true">
          <div className="s-hero__pin s-hero__pin--drop">{h.pinDrop}</div>
          <div className="s-hero__pin s-hero__pin--pickup">{h.pinPickup}</div>
          <div className="s-hero__card">
            <div className="s-hero__card-top">
              <span className="s-hero__card-icon"><CarIcon /></span>
              <span>
                <b className="t-strong" style={{ display: 'block' }}>{h.cardTitle}</b>
                <span className="t-small t-muted">{h.cardBody}</span>
              </span>
            </div>
            <div className="s-lockline"><LockIcon />{h.cardLocked}</div>
          </div>
        </div>
      </section>

      {/* Phone: the map follows the panel, as a card. */}
      <div className="s-only-phone" aria-hidden="true">
        <div className="s-mapcard">
          <HeroMapArt viewBox="720 80 540 430" fit="xMidYMid meet" />
        </div>
        <div className="s-mapcard__foot"><LockIcon />{h.phoneMapNote}</div>
      </div>

      {/* Desktop: the two sides with their phone mock-ups. */}
      <section className="s-wrap s-sides s-only-desk" aria-labelledby="sides">
        <div className="s-sides__head">
          <div className="t-label">{h.sidesLabel}</div>
          <h2 id="sides" className="t-heading">{h.sidesHeading}</h2>
        </div>
        <div className="s-sides__grid">
          <div className="s-side">
            <div className="s-side__copy">
              <div className="t-label s-side__label--green">{h.rideLabel}</div>
              <h3 className="t-title">{h.rideTitle}</h3>
              <ul className="s-side__list">
                {h.rideList.map((x) => <li key={x}>{x}</li>)}
              </ul>
              <Link href="/ride" className="s-btn s-btn--dark">{h.rideCta}</Link>
            </div>
            <RiderMock />
          </div>
          <div className="s-side s-side--dark">
            <div className="s-side__copy">
              <div className="t-label">{h.driveLabel}</div>
              <h3 className="t-title">{h.driveTitle}</h3>
              <ul className="s-side__list">
                {h.driveList.map((x) => <li key={x}>{x}</li>)}
              </ul>
              <Link href="/drive" className="s-btn s-btn--primary">{h.driveCta}</Link>
            </div>
            <DriverMock />
          </div>
        </div>
      </section>

      {/* Phone: the two sides as cards. */}
      <section className="s-pstack s-only-phone" aria-labelledby="sides-phone">
        <h2 id="sides-phone" className="t-title">{h.sidesHeadingPhone}</h2>
        <div className="s-pcard">
          <div className="t-label">{h.forRiders}</div>
          <p>{h.forRidersBody}</p>
        </div>
        <div className="s-pcard s-pcard--dark">
          <div className="t-label">{h.forDrivers}</div>
          <p>{h.forDriversBody}</p>
          <Link href="/drive" className="s-btn s-btn--primary">{h.driveCta}</Link>
        </div>
      </section>

      <section className="s-band s-only-desk" aria-labelledby="safety">
        <div className="s-wrap s-safety">
          <div>
            <div className="t-label">{h.safetyLabel}</div>
            <h2 id="safety" className="t-heading">{h.safetyHeading}</h2>
            <Link href="/safety" className="s-safety__more">{h.safetyMore}</Link>
          </div>
          <div className="s-safety__items">
            {h.safety.map((s, i) => (
              <div key={s.title} className="s-safety__item">
                <span className={`s-tile ${safetyIcons[i].tone}`}>{safetyIcons[i].icon}</span>
                <b>{s.title}</b>
                <span>{s.body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="s-pstack s-pstack--last s-only-phone" aria-labelledby="safety-phone">
        <h2 id="safety-phone" className="t-title">{h.safetyHeading}</h2>
        {h.safetyPhone.map((s) => (
          <div key={s.title} className="s-pcard s-pcard--sm">
            <b className="t-strong">{s.title}</b>
            <div className="t-small">{s.body}</div>
          </div>
        ))}
      </section>

      {/* The app band waits for the store listings (owner, 2026-11-07): it
          appears only when both store links are configured. */}
      {STORE.rider && STORE.driver && (
        <section className="s-wrap s-apps s-only-desk" aria-labelledby="apps">
          <div className="s-apps__card">
            <div>
              <h2 id="apps" className="t-heading">{h.appsHeading}</h2>
              <p>{h.appsBody}</p>
            </div>
            <div className="s-apps__links">
              <a href={STORE.rider} className="s-btn s-btn--dark"><PhoneDeviceIcon className="s-ico20" />{h.riderApp}</a>
              <a href={STORE.driver} className="s-btn s-btn--dark"><PhoneDeviceIcon className="s-ico20" />{h.driverApp}</a>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function RiderMock() {
  const h = useSite().home;
  return (
    <div className="s-phone" aria-hidden="true">
      <div className="s-phone__screen">
        <div className="s-phone__map">
          <RideMiniMap />
        </div>
        <div className="s-phone__body">
          <div className="t-small t-strong">{h.mockChoose}</div>
          {h.mockClasses.map((c, i) => (
            <div key={c} className={`s-mock-row${i === 0 ? ' s-mock-row--on' : ''}`}>
              <span className={`s-mock-row__swatch s-mock-row__swatch--${i}`} />
              <span className="s-mock-row__name">{c}</span>
              <LockIcon />
            </div>
          ))}
          <div className="s-mock-btn" style={{ marginTop: 4 }}>{h.mockBook}</div>
        </div>
      </div>
    </div>
  );
}

function DriverMock() {
  const h = useSite().home;
  return (
    <div className="s-phone s-phone--black" aria-hidden="true">
      <div className="s-phone__screen s-phone__screen--grid">
        <div className="s-mock-status">
          <span><i className="s-dot" />{h.mockOnline}</span>
          <span className="s-mock-avatar" />
        </div>
        <div className="s-mock-card">
          <div className="s-request__head">
            <div className="t-label">{h.mockRequest}</div>
            <ExampleTag />
          </div>
          <ExampleLines fare={h.mockFare} commission={h.mockCommission} earn={h.mockEarn} />
          <div className="s-mock-actions">
            <span>{h.mockDecline}</span>
            <span>{h.mockAccept}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
