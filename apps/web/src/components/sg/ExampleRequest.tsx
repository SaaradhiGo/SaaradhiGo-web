'use client';

import { EXAMPLE_FARE, exampleSplit, rupees } from '@/lib/exampleFare';
import { useTr } from '@/i18n/website';

/**
 * The three lines of a ride request as a driver sees them, with example numbers that add up
 * (lib/exampleFare.ts), marked "Example". Used by the Drive page and the home page's phone.
 */
export function ExampleLines({ fare, commission, earn }: { fare: string; commission: string; earn: string }) {
  const s = exampleSplit();
  return (
    <div className="s-bars" data-testid="example-request" data-example="">
      <div className="s-bar"><span>{fare}</span><b>{rupees(s.fare)}</b></div>
      <div className="s-bar"><span>{commission} ({EXAMPLE_FARE.commissionPercent}%)</span><b>−{rupees(s.commission)}</b></div>
      <div className="s-bar s-bar--earn"><span>{earn}</span><b>{rupees(s.earn)}</b></div>
    </div>
  );
}

export function ExampleTag() {
  const tr = useTr();
  return (
    <span className="s-example" data-example="" title={tr('Example from the Hyderabad rate card')}>
      {tr('Example')} · {tr(EXAMPLE_FARE.vehicle)}, {EXAMPLE_FARE.city}
    </span>
  );
}
