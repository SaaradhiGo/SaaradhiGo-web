'use client';

import { Button, Device } from '@/components/ui';
import { IconPhone, IconShieldCheck } from '@/components/ui/icons';
import { useSite } from '@/i18n/site';
import { useTr } from '@/i18n/website';
import { useLegal } from '@/components/sg/LegalProvider';

/**
 * /safety (20 Nov 2026, owner: "safety page UI should be proper along with images").
 * A masthead with the four protections as jump links, then one section per protection: what it
 * is, how it works in three steps, and the real product screen beside it at a size you can read.
 * Screens: public/product, captured from QA with sample people.
 */
export function SafetyContent() {
  const site = useSite();
  const tr = useTr();
  const s = site.safety;
  const [code, live, sos, checked] = s.cards;
  const market = useLegal().market;
  const us = market === 'US';
  const emergency = us ? '911' : '112';
  const shot = (name: string) => `/product/${name}${us ? '-us' : ''}.webp`;

  const features = [
    { id: 'ride-code', card: code, img: 'safety-ride-code', steps: [
      tr('A ride code appears on your trip screen once a driver is on the way.'),
      tr('Check the driver and the number plate, then tell the driver the code in person.'),
      tr('The code is checked on our servers. Without it the trip cannot start.'),
    ] },
    { id: 'live-trip', card: live, img: 'safety-share-live', steps: [
      tr('Your driver and route show on your map from pickup to drop.'),
      tr('Tap Share to send the trip to family or a friend.'),
      tr('They see the driver, the car and when you will arrive.'),
    ] },
    { id: 'sos', card: sos, img: 'safety-sos', after: 'safety-sos-sent', steps: [
      tr('Press and hold SOS for two seconds during a ride.'),
      tr('Our safety team gets your trip, driver and live location at once.'),
      tr('If it was a mistake, one tap tells the team you are safe.'),
    ] },
  ];

  return (
    <div className="ui sf">
      <header className="lg-head">
        <div className="hp">
          <p className="lg-kicker">{tr('Safety')}</p>
          <h1 className="lg-title">{s.title}</h1>
          <p className="lg-lead">{s.lead}</p>
          <nav className="sf-jump" aria-label={tr('On this page')}>
            {[...features.map((f) => ({ id: f.id, t: f.card.title })), { id: 'checked', t: checked.title }].map((f, i) => (
              <a key={f.id} href={`#${f.id}`}><span className="lg-num">{i + 1}</span>{f.t}</a>
            ))}
          </nav>
        </div>
      </header>

      {features.map((f, i) => (
        <section className={`sf-sec${i % 2 ? '' : ' sf-sec--band'}`} id={f.id} key={f.id} aria-labelledby={`${f.id}-h`}>
          <div className={`hp sf-row${i % 2 ? ' sf-row--flip' : ''}`}>
            <div className="sf-text">
              <p className="sf-num">{String(i + 1).padStart(2, '0')}</p>
              <h2 id={`${f.id}-h`} className="sf-h2">{f.card.title}</h2>
              <p className="sf-body">{f.card.body}</p>
              <ol className="sf-steps">
                {f.steps.map((st) => <li key={st}>{st}</li>)}
              </ol>
            </div>
            <div className={`sf-shots${f.after ? ' sf-shots--two' : ''}`}>
              <figure className="sf-fig">
                <Device src={shot(f.img)} alt={f.card.title} width={f.after ? 280 : 320} />
                {f.after && <figcaption>{tr('Hold to send')}</figcaption>}
              </figure>
              {f.after && (
                <figure className="sf-fig">
                  <Device src={shot(f.after)} alt={s.sos} width={280} />
                  <figcaption>{tr('Alert sent')}</figcaption>
                </figure>
              )}
            </div>
          </div>
        </section>
      ))}

      <section className="sf-sec" id="checked" aria-labelledby="checked-h">
        <div className="hp sf-cards">
          <div className="sf-card">
            <span className="sf-card__icon"><IconShieldCheck /></span>
            <h2 id="checked-h" className="sf-card__h">{checked.title}</h2>
            <p className="sf-body">{checked.body}</p>
          </div>
          <div className="sf-card sf-card--urgent">
            <span className="sf-card__icon"><IconPhone /></span>
            <h2 className="sf-card__h">{tr('In danger right now? Call')} {emergency}</h2>
            <p className="sf-body">{s.emergencyBody}</p>
            <div><Button kind="secondary" href="/contact">{s.report}</Button></div>
          </div>
        </div>
      </section>
    </div>
  );
}
