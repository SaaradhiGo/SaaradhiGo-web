'use client';

import { Button, Device, Section } from '@/components/ui';
import { IconPhone, IconShieldCheck } from '@/components/ui/icons';
import { useSite } from '@/i18n/site';
import { useLegal } from '@/components/sg/LegalProvider';

/**
 * /safety to the product standard (17 Nov 2026): each safety feature shows the real product in a
 * phone frame (the rider's trip screen with the ride code, a trip shared live, SOS and what happens
 * next), with a short heading and one line. No icon tiles. Screens: public/product, captured from QA.
 */
export function SafetyContent() {
  const site = useSite();
  const s = site.safety;
  const [code, live, sos] = site.home.safety;
  const checked = s.cards[3];
  // Each market sees its own trip: Boise in dollars with 911, Hyderabad in rupees with 112.
  const us = useLegal().market === 'US';
  const shot = (name: string) => `/product/${name}${us ? '-us' : ''}.webp`;

  return (
    <div className="ui ui-safety">
      <Section tight labelledBy="safety-title">
        <div className="ui-stack ui-measure">
          <h1 id="safety-title" className="ui-display">{s.title}</h1>
          <p className="ui-body">{s.lead}</p>
        </div>
      </Section>

      <Section band labelledBy="safety-code">
        <div className="ui-split ui-split--feature">
          <div className="ui-stack ui-measure">
            <h2 id="safety-code" className="ui-heading">{code.title}</h2>
            <p className="ui-body">{code.body}</p>
          </div>
          <Device src={shot('safety-ride-code')} alt={code.title} />
        </div>
      </Section>

      <Section labelledBy="safety-live">
        <div className="ui-split ui-split--feature ui-split--flip">
          <div className="ui-stack ui-measure">
            <h2 id="safety-live" className="ui-heading">{live.title}</h2>
            <p className="ui-body">{live.body}</p>
          </div>
          <Device src={shot('safety-share-live')} alt={live.title} />
        </div>
      </Section>

      <Section band labelledBy="safety-sos">
        <div className="ui-split ui-split--feature">
          <div className="ui-stack ui-measure">
            <h2 id="safety-sos" className="ui-heading">{sos.title}</h2>
            <p className="ui-body">{sos.body}</p>
          </div>
          <div className="ui-devices">
            <Device src={shot('safety-sos')} alt={sos.title} width={260} />
            <Device src={shot('safety-sos-sent')} alt={s.sos} width={260} />
          </div>
        </div>
      </Section>

      <Section tight labelledBy="safety-more">
        <h2 id="safety-more" className="sr-only">{s.emergencyTitle}</h2>
        <div className="ui-grid" style={{ ['--ui-min' as string]: '300px' }}>
          <div className="ui-feature">
            <IconShieldCheck />
            <b className="ui-title">{checked.title}</b>
            <p className="ui-body">{checked.body}</p>
          </div>
          <div className="ui-feature">
            <IconPhone />
            <b className="ui-title">{s.emergencyTitle}</b>
            <div className="ui-stack" style={{ ['--ui-gap' as string]: '16px' }}>
              <p className="ui-body">{s.emergencyBody}</p>
              <div><Button kind="secondary" href="/contact">{s.report}</Button></div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
