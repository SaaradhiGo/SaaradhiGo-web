'use client';

import Link from 'next/link';
import { HeroBooking } from '@/components/home/HeroBooking';
import { HeroMapPanel } from '@/components/home/HeroCityMap';
import { useLegal } from '@/components/sg/LegalProvider';
import { Button, Device, Section } from '@/components/ui';
import { IconCar, IconCheck, IconKey, IconLock, IconShare, IconShieldCheck, IconSos } from '@/components/ui/icons';
import { useSite } from '@/i18n/site';
import { useTr } from '@/i18n/website';

/**
 * The homepage to the product standard (owner brief, 17 Nov 2026). One fluid layout at every width:
 * the headline, the booking card and the real city map (with its route and the driver card) side by
 * side while they fit, stacked when they do not, all on the first screen of a phone. Below: the two
 * sides with the real product in phone frames, and safety as plain items, with no icon tiles.
 */
const STORE = {
  rider: process.env.NEXT_PUBLIC_RIDER_APP_URL || '',
  driver: process.env.NEXT_PUBLIC_DRIVER_APP_URL || '',
};

export function HomeContent() {
  const h = useSite().home;
  const market = useLegal().market;
  const safetyIcons = [IconKey, IconShare, IconSos];
  // Each market sees its own product: a Boise trip in dollars for the US, Hyderabad in rupees for India.
  const shot = (name: string) => `/product/${name}${market === 'US' ? '-us' : ''}.webp`;

  const tr = useTr();
  // 20 Nov (owner): facts about the service, not a pretend trip.
  const cityCard = (
    <div className="hmap-facts">
      <span className="hmap-fact"><IconLock className="ui-icon ui-icon--sm" />{tr('Fare locked at booking')}</span>
      <span className="hmap-fact"><IconCar className="ui-icon ui-icon--sm" />{market === 'US' ? 'Standard · XL' : 'Auto · Mini · Sedan · SUV'}</span>
      <Link className="hmap-fact hmap-fact--link" href="/fares">{tr('See fares')} →</Link>
    </div>
  );

  return (
    <div className="ui ui-home">
      <section className="ui-hero" aria-labelledby="hero-title">
        <div className="ui-wrap">
          <div className="ui-hero__grid">
            <div className="ui-stack ui-hero__copy">
              <h1 id="hero-title" className="ui-display">
                {h.titleTop}
                <br />
                <span className="ui-accent">{h.titleBottom}</span>
              </h1>
              <p className="ui-body ui-hero__lead">
                <span className="ui-hero__lead--long">{h.lead}</span>
                <span className="ui-hero__lead--short">{h.leadPhone}</span>
              </p>
              <HeroBooking />
              <div className="ui-row ui-hero__ticks">
                <span className="ui-small ui-row"><IconCheck className="ui-icon ui-icon--sm" />{h.tickLocked}</span>
                <span className="ui-small ui-row"><IconShieldCheck className="ui-icon ui-icon--sm" />{h.tickSafety}</span>
              </div>
            </div>
            <HeroMapPanel market={market} status={tr('Launching soon')} card={cityCard} />
          </div>
        </div>
      </section>

      <Section band labelledBy="sides">
        <div className="ui-stack" style={{ ['--ui-gap' as string]: '32px' }}>
          <div className="ui-stack" style={{ ['--ui-gap' as string]: '8px' }}>
            <p className="ui-label">{h.sidesLabel}</p>
            <h2 id="sides" className="ui-heading">{h.sidesHeading}</h2>
          </div>
          <div className="ui-grid" style={{ ['--ui-min' as string]: '560px', ['--ui-gap' as string]: '24px' }}>
            <div className="ui-card ui-side">
              <div className="ui-stack">
                <p className="ui-label">{h.rideLabel}</p>
                <h3 className="ui-title">{h.rideTitle}</h3>
                <ul className="ui-checks">{h.rideList.map((x) => <li key={x}><IconCheck className="ui-icon ui-icon--sm" /><span>{x}</span></li>)}</ul>
                <div><Button kind="secondary" href="/ride">{h.rideCta}</Button></div>
              </div>
              <Device src={shot('home-rider-choose')} alt={h.rideTitle} width={300} />
            </div>
            <div className="ui-card ui-side">
              <div className="ui-stack">
                <p className="ui-label">{h.driveLabel}</p>
                <h3 className="ui-title">{h.driveTitle}</h3>
                <ul className="ui-checks">{h.driveList.map((x) => <li key={x}><IconCheck className="ui-icon ui-icon--sm" /><span>{x}</span></li>)}</ul>
                <div><Button kind="secondary" href="/drive">{h.driveCta}</Button></div>
              </div>
              <Device src={shot('home-driver-earnings')} alt={h.driveTitle} width={300} />
            </div>
          </div>
        </div>
      </Section>

      <Section labelledBy="safety">
        <div className="ui-split" style={{ alignItems: 'flex-start' }}>
          <div className="ui-stack" style={{ ['--ui-basis' as string]: '260px' }}>
            <p className="ui-label">{h.safetyLabel}</p>
            <h2 id="safety" className="ui-heading">{h.safetyHeading}</h2>
            <Link href="/safety" className="ui-link ui-link--solo">{h.safetyMore}</Link>
          </div>
          <div className="ui-grid" style={{ ['--ui-basis' as string]: '520px', ['--ui-min' as string]: '200px' }}>
            {h.safety.map((s, i) => {
              const I = safetyIcons[i] ?? IconShieldCheck;
              return (
                <div key={s.title} className="ui-feature">
                  <I />
                  <b className="ui-title">{s.title}</b>
                  <p className="ui-body">{s.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* The app band waits for the store listings (owner, 2026-11-07). */}
      {STORE.rider && STORE.driver && (
        <Section band tight labelledBy="apps">
          <div className="ui-row" style={{ justifyContent: 'space-between' }}>
            <div className="ui-stack" style={{ ['--ui-gap' as string]: '8px' }}>
              <h2 id="apps" className="ui-heading">{h.appsHeading}</h2>
              <p className="ui-body">{h.appsBody}</p>
            </div>
            <div className="ui-row">
              <a href={STORE.rider} className="ui-btn ui-btn--primary">{h.riderApp}</a>
              <a href={STORE.driver} className="ui-btn ui-btn--secondary">{h.driverApp}</a>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
