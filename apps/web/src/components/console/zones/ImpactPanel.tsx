'use client';

import { currencySymbol } from '@/lib/money';
import {
  cardLine, impactHeadline, impactWarnings, pickups, transitionWords,
  type ImpactResult,
} from '@/lib/zones';
import { Skeleton } from '@/components/console/ui';

/**
 * "What this change does": the impact preview of a draft over the last 30 days.
 *
 * It only reads. The numbers come from the server, which resolves every pickup with the
 * same function quoting uses, once under today's zones and once under the draft. A draft
 * the server refuses is shown with the server's reason, as it is drawn.
 */
export function ImpactPanel({ result, state, currency }: {
  result: ImpactResult | null;
  state: 'idle' | 'loading' | 'error';
  currency: string;
}) {
  const symbol = currencySymbol(currency);

  if (state === 'loading') {
    return (
      <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
        <span className="sr-only">Working out what this change does</span>
        <Skeleton kind="row" count={3} />
      </div>
    );
  }
  if (state === 'error') {
    return <div className="ops-note ops-note--warn" role="status"><b>The preview could not be worked out.</b> Nothing was changed. Try again in a moment.</div>;
  }
  if (!result) {
    return <p className="help m-0">Draw at least three corners and the preview of what this change does appears here.</p>;
  }
  if (!result.valid) {
    return (
      <div className="ops-note ops-note--warn" role="status">
        <b>This shape cannot be sent yet.</b> {result.error.message}
      </div>
    );
  }

  const warnings = impactWarnings(result);
  return (
    <div className="zn-impact" aria-live="polite">
      <h3 className="ops-subhead">What this change does</h3>
      <p className="zn-impact__head"><b>{impactHeadline(result)}</b></p>
      <ul className="zn-impact__lines">
        {result.summary.filter((l) => !l.startsWith('WARNING') && !l.startsWith('  ')).map((l) => <li key={l}>{l}</li>)}
      </ul>
      {warnings.map((w) => <div key={w} className="ops-note ops-note--warn" role="status"><b>Check this.</b> {w}</div>)}

      {result.transitions.length > 0 ? (
        <div className="ops-table-wrap">
          <table className="ops-table ops-table--compact ops-table--auto">
            <caption className="sr-only">Pickups that would change zone, last {result.window_days} days</caption>
            <thead><tr><th scope="col">Zone now → zone after</th><th scope="col" className="num">Pickups</th></tr></thead>
            <tbody>
              {result.transitions.map((t) => (
                <tr key={`${t.from}-${t.to}`}><th scope="row">{transitionWords(t)}</th><td className="num">{t.trips.toLocaleString('en')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <dl className="ops-facts zn-impact__facts">
        <div><dt>Drivers whose recent pickups would be in another city</dt><dd>{result.drivers_whose_city_would_change.toLocaleString('en')}</dd></div>
        <div><dt>Pickups scanned</dt><dd>{result.trips_scanned.toLocaleString('en')}{result.truncated ? ' (most recent; capped)' : ''}</dd></div>
        {result.trips_in_progress_now > 0 ? (
          <div><dt>Trips in this zone right now</dt><dd>{result.trips_in_progress_now.toLocaleString('en')}</dd></div>
        ) : null}
      </dl>

      {result.cards_newly_applying.length > 0 ? (
        <>
          <h3 className="ops-subhead">Fare cards that would newly apply</h3>
          <ul className="zn-impact__cards">
            {result.cards_newly_applying.map((c) => (
              <li key={c.id}>
                <b>{c.vehicle_type_name}</b> in {c.zone}, v{c.version}: {cardLine(c, symbol)}
                {' '}<span className="muted">({pickups(c.trips ?? 0)})</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {result.pickups_without_a_card.length > 0 ? (
        <>
          <h3 className="ops-subhead">Pickups that would have no fare card</h3>
          <ul className="zn-impact__cards">
            {result.pickups_without_a_card.map((m) => (
              <li key={`${m.zone}-${m.vehicle_type}`}>
                {pickups(m.trips)} in {m.zone ?? 'no zone'} ({m.vehicle_type_name ?? 'unknown class'})
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
