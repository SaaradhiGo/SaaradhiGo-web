'use client';

import { useState } from 'react';
import { Alert, Button, Card, Chip, DialogBox, Device, EmptyState, ErrorState, Field, Section, Skeleton, Table, Tabs, Toast } from '@/components/ui';
import { ICONS, IconCar, IconPin, IconSearch } from '@/components/ui/icons';

const COLOURS: [string, string][] = [
  ['--ui-bg', 'Page'], ['--ui-band', 'Section band'], ['--ui-surface', 'Card'], ['--ui-line', 'Line'], ['--ui-line-strong', 'Control edge'],
  ['--ui-text', 'Text'], ['--ui-text-2', 'Secondary text'], ['--ui-text-3', 'Tertiary text'], ['--ui-ink', 'Header and footer'],
  ['--ui-gold', 'Primary action'], ['--ui-gold-text', 'Highlight text'], ['--ui-ok', 'Status: done'], ['--ui-warn', 'Status: attention'], ['--ui-bad', 'Status: problem'],
];
const TYPE: [string, string, string][] = [
  ['ui-display', 'Display', '40/48 semibold; 28/36 in a narrow column'], ['ui-heading', 'Heading', '28/36 semibold; 20/28 in a narrow column'],
  ['ui-title', 'Title', '20/28 semibold'], ['ui-body', 'Body', '16/24 regular'], ['ui-small', 'Small', '14/20 regular, the smallest size'],
];
const SPACE = [8, 16, 24, 32, 48, 64, 96];

function Panel({ p }: { p: string }) {
  const [tab, setTab] = useState('Rides');
  const Icons = Object.entries(ICONS);
  return (
    <>
      <Section tight labelledBy={`${p}-colour`}>
        <div className="ui-stack" style={{ ['--ui-gap' as string]: '24px' }}>
          <h2 id={`${p}-colour`} className="ui-heading">Colour</h2>
          <div className="ui-grid" style={{ ['--ui-min' as string]: '180px', ['--ui-gap' as string]: '16px' }}>
            {COLOURS.map(([v, name]) => (
              <div key={v} className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ height: 64, background: `var(${v})`, borderBottom: '1px solid var(--ui-line)' }} />
                <div style={{ padding: 12 }}><div className="ui-strong">{name}</div><code className="ui-small">{v}</code></div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section tight band labelledBy={`${p}-type`}>
        <div className="ui-stack" style={{ ['--ui-gap' as string]: '24px' }}>
          <h2 id={`${p}-type`} className="ui-heading">Type</h2>
          {TYPE.map(([cls, name, spec]) => (
            <div key={cls} className="ui-stack" style={{ ['--ui-gap' as string]: '4px' }}>
              <div className={cls}>{name}: the fare you book is the fare you pay</div>
              <span className="ui-small">.{cls} · {spec}</span>
            </div>
          ))}
          <div className="ui-label">Label · 14 semibold, uppercase</div>
        </div>
      </Section>

      <Section tight labelledBy={`${p}-space`}>
        <div className="ui-stack" style={{ ['--ui-gap' as string]: '16px' }}>
          <h2 id={`${p}-space`} className="ui-heading">Spacing (8 px grid)</h2>
          {SPACE.map((s) => (
            <div key={s} className="ui-row"><div style={{ width: s, height: 16, background: 'var(--ui-gold)', borderRadius: 4 }} /><span className="ui-small">{s} px</span></div>
          ))}
          <p className="ui-body">Sections: 96 / 64 px on wide screens, 48 / 32 px on narrow ones, scaling smoothly between. Cards: 24 px, 16 px when narrow.</p>
        </div>
      </Section>

      <Section tight band labelledBy={`${p}-buttons`}>
        <div className="ui-stack" style={{ ['--ui-gap' as string]: '24px' }}>
          <h2 id={`${p}-buttons`} className="ui-heading">Buttons</h2>
          <div className="ui-row">
            <Button>See fares</Button>
            <Button kind="secondary">Driver sign in</Button>
            <Button kind="quiet">How fares work</Button>
            <Button disabled>Booking…</Button>
          </div>
          <div style={{ maxWidth: 360 }}><Button block>Main form action (full width on a phone)</Button></div>
          <p className="ui-small">48 px tall, 16 px semibold, 12 px radius. One primary per view. Disabled at 50%.</p>
        </div>
      </Section>

      <Section tight labelledBy={`${p}-forms`}>
        <div className="ui-stack" style={{ ['--ui-gap' as string]: '24px' }}>
          <h2 id={`${p}-forms`} className="ui-heading">Inputs</h2>
          <div className="ui-grid" style={{ ['--ui-min' as string]: '240px' }}>
            <Field id={`${p}-a`} label="Pickup" hint="Type a place or use your location"><input id={`${p}-a`} className="ui-input" placeholder="Pickup" /></Field>
            <Field id={`${p}-b`} label="Email"><input id={`${p}-b`} className="ui-input" defaultValue="rider@example.com" /></Field>
            <Field id={`${p}-c`} label="Mobile number" error="Enter a 10-digit number"><input id={`${p}-c`} className="ui-input" aria-invalid="true" defaultValue="98480" /></Field>
            <Field id={`${p}-d`} label="City"><select id={`${p}-d`} className="ui-select" defaultValue="Hyderabad"><option>Hyderabad</option><option>Boise</option></select></Field>
          </div>
        </div>
      </Section>

      <Section tight band labelledBy={`${p}-data`}>
        <div className="ui-stack" style={{ ['--ui-gap' as string]: '24px' }}>
          <h2 id={`${p}-data`} className="ui-heading">Tables, tabs and chips</h2>
          <Tabs label="Trips" tabs={['Rides', 'Payments', 'Receipts']} selected={tab} onSelect={setTab} />
          <Table caption="Hyderabad rates" head={['Class', 'Base fare', 'Per km', 'Per minute', 'Minimum']}
            rows={[['Auto', '₹30', '₹12', '₹1.50', '₹35'], ['Mini', '₹45', '₹14', '₹2', '₹60'], ['Sedan', '₹60', '₹17', '₹2.50', '₹95'], ['SUV', '₹100', '₹23', '₹3', '₹150']]} />
          <div className="ui-row"><Chip>Scheduled</Chip><Chip tone="ok">Completed</Chip><Chip tone="warn">Driver late</Chip><Chip tone="bad">Cancelled</Chip></div>
        </div>
      </Section>

      <Section tight labelledBy={`${p}-feedback`}>
        <div className="ui-stack" style={{ ['--ui-gap' as string]: '24px' }}>
          <h2 id={`${p}-feedback`} className="ui-heading">Feedback</h2>
          <div className="ui-grid" style={{ ['--ui-min' as string]: '260px' }}>
            <Alert tone="ok">Payment received. Your receipt is on its way.</Alert>
            <Alert tone="warn">Your driver is running 4 minutes late.</Alert>
            <Alert tone="bad">We could not reach the payment provider. Try again.</Alert>
            <Alert>Booking opens in Hyderabad soon.</Alert>
          </div>
          <Toast title="Trip shared">Priya can follow your ride live.</Toast>
          <div style={{ background: 'var(--ui-scrim)', padding: 24, borderRadius: 16 }}>
            <DialogBox title="Cancel this ride?" actions={<><Button kind="secondary">Keep ride</Button><Button>Cancel ride</Button></>}>
              Cancelling is free for 5 minutes after booking.
            </DialogBox>
          </div>
        </div>
      </Section>

      <Section tight band labelledBy={`${p}-states`}>
        <div className="ui-stack" style={{ ['--ui-gap' as string]: '24px' }}>
          <h2 id={`${p}-states`} className="ui-heading">Empty, loading and error</h2>
          <div className="ui-grid" style={{ ['--ui-min' as string]: '260px' }}>
            <Card><EmptyState icon={<IconCar />} title="No trips yet" body="Your rides will show here." action={<Button kind="secondary" href="/ride">Book a ride</Button>} /></Card>
            <Card>
              <div className="ui-stack" aria-label="Loading" role="status">
                <Skeleton width="60%" height={20} /><Skeleton /><Skeleton width="80%" /><Skeleton height={48} />
              </div>
            </Card>
            <Card><ErrorState title="Something went wrong" body="We could not load your trips." action={<Button kind="secondary">Try again</Button>} /></Card>
          </div>
        </div>
      </Section>

      <Section tight labelledBy={`${p}-icons`}>
        <div className="ui-stack" style={{ ['--ui-gap' as string]: '24px' }}>
          <h2 id={`${p}-icons`} className="ui-heading">Icons</h2>
          <div className="ui-grid" style={{ ['--ui-min' as string]: '150px', ['--ui-gap' as string]: '16px' }}>
            {Icons.map(([name, I]) => <div key={name} className="ui-row" style={{ ['--ui-gap' as string]: '8px' }}><I /><span className="ui-small">{name.replace('Icon', '')}</span></div>)}
          </div>
          <div className="ui-feature"><IconPin /><b className="ui-strong">Icons support text</b><span className="ui-body">24 px beside a title, 20 px in a button, never on a coloured tile.</span></div>
          <div className="ui-row"><IconSearch /><span className="ui-body">1.75 stroke, round caps, current colour.</span></div>
        </div>
      </Section>

      <Section tight band labelledBy={`${p}-device`}>
        <div className="ui-split">
          <div className="ui-stack">
            <h2 id={`${p}-device`} className="ui-heading">Product in a device frame</h2>
            <p className="ui-body">Feature sections show the real product: our own screens, captured with real Hyderabad or Boise data, in a phone frame. No drawn maps, cartoon cars or stock illustrations.</p>
          </div>
          <Device src="/product/safety-ride-code.webp" alt="The rider's trip screen with the ride code" width={280} />
        </div>
      </Section>
    </>
  );
}

export function DesignSystem() {
  return (
    <div className="ui">
      <Section labelledBy="ds-title">
        <div className="ui-stack">
          <p className="ui-label">SaaradhiGo product standard</p>
          <h1 id="ds-title" className="ui-display">One standard for every screen</h1>
          <p className="ui-body">Tokens and components, shown in every state. Light is the default; the second half shows the same set in the dark theme a person can choose.</p>
        </div>
      </Section>
      <Panel p="l" />
      <div data-theme="dark" className="ui" style={{ background: 'var(--ui-bg)', color: 'var(--ui-text)' }}>
        <Section tight labelledBy="ds-dark"><h2 id="ds-dark" className="ui-heading">Dark theme (only when chosen)</h2></Section>
        <Panel p="d" />
      </div>
    </div>
  );
}
