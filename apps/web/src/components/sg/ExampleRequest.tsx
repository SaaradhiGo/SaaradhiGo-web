'use client';

import { exampleFor, moneyOf, splitOf } from '@/lib/exampleFare';
import { useTr } from '@/i18n/website';
import { useLegal } from '@/components/sg/LegalProvider';

/**
 * The three lines of a ride request as a driver sees them, with example numbers that add up
 * (lib/exampleFare.ts), marked "Example". Used by the Drive page and the home page's phone.
 */
export function ExampleLines({ fare, commission, earn }: { fare: string; commission: string; earn: string }) {
  // 14 Nov: the example follows the market on screen (USA: Treasure Valley's test rate card).
  const ex = exampleFor(useLegal().market);
  const s = splitOf(ex);
  const m = (v: number) => moneyOf(v, ex.currency);
  return (
    <div className="s-bars" data-testid="example-request" data-example="">
      <div className="s-bar"><span>{fare}</span><b>{m(s.fare)}</b></div>
      <div className="s-bar"><span>{commission} ({ex.commissionPercent}%)</span><b>−{m(s.commission)}</b></div>
      <div className="s-bar s-bar--earn"><span>{earn}</span><b>{m(s.earn)}</b></div>
    </div>
  );
}

export function ExampleTag() {
  const tr = useTr();
  const ex = exampleFor(useLegal().market);
  return (
    <span className="s-example" data-example=""
      title={ex.currency === 'USD' ? tr('Example from the Treasure Valley test rate card') : tr('Example from the Hyderabad rate card')}>
      {tr('Example')} · {tr(ex.vehicle)}, {ex.city}
    </span>
  );
}
