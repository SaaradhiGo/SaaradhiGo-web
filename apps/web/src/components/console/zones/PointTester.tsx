'use client';

import { useId, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { currencySymbol } from '@/lib/money';
import { cardLine, num, type PointResolution, type PointTest } from '@/lib/zones';
import { Pill } from '@/components/console/ui';

/**
 * The point tester: type a latitude and longitude, or click the map, and see which zone and
 * which fare card each vehicle class resolves to.
 *
 * It asks the server, which resolves with the SAME function quoting uses, so what this shows
 * is what a rider at that spot would be quoted. When a draft is open it also resolves the
 * point under the draft, with the same function over the draft shape.
 */
export function PointTester({ lat, lng, onLat, onLng, draftBody }: {
  lat: string;
  lng: string;
  onLat: (v: string) => void;
  onLng: (v: string) => void;
  /** The body of the draft to test against (a `zone` and `values`), or null for live only. */
  draftBody?: (() => Record<string, unknown> | null) | null;
}) {
  const latId = useId();
  const lngId = useId();
  const [result, setResult] = useState<PointTest | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const la = num(lat);
  const ln = num(lng);
  const bad = la === null || ln === null || la < -90 || la > 90 || ln < -180 || ln > 180;

  async function run() {
    if (bad) {
      setMessage('Enter a latitude between -90 and 90 and a longitude between -180 and 180.');
      return;
    }
    setState('loading'); setMessage(null);
    try {
      const extra = draftBody ? draftBody() : null;
      setResult(await api.post<PointTest>('/pricing/admin/zones/point-test/', { lat: la, lng: ln, ...(extra ?? {}) }));
      setState('idle');
    } catch (err) {
      setResult(null);
      setState('error');
      setMessage(err instanceof ApiError && err.fromServer ? err.message : 'The point could not be tested.');
    }
  }

  return (
    <div className="zn-tester">
      <div className="zn-tester__row">
        <div>
          <label className="ops-form__label" htmlFor={latId}>Latitude</label>
          <input id={latId} className="input" inputMode="decimal" value={lat} onChange={(e) => onLat(e.target.value)} />
        </div>
        <div>
          <label className="ops-form__label" htmlFor={lngId}>Longitude</label>
          <input id={lngId} className="input" inputMode="decimal" value={lng} onChange={(e) => onLng(e.target.value)} />
        </div>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void run()} disabled={state === 'loading'}>
          {state === 'loading' ? 'Testing…' : 'Test this point'}
        </button>
      </div>
      <p className="help m-0">Type the coordinates, or click the map to fill them in.</p>
      {message ? <p className="help m-0" role="alert">{message}</p> : null}

      {result ? (
        <div className="zn-tester__result" aria-live="polite">
          <Resolution title="Today" r={result} />
          {result.draft ? (
            <>
              <Resolution title="Under this draft" r={result.draft} />
              <p className="m-0">
                {result.draft.changes_resolution
                  ? <Pill tone="wait">The draft changes this point&apos;s zone</Pill>
                  : <Pill tone="neutral">Same zone as today</Pill>}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Resolution({ title, r }: { title: string; r: PointResolution }) {
  const symbol = currencySymbol(r.zone?.currency);
  return (
    <section className="zn-tester__block" aria-label={title}>
      <h3 className="ops-subhead">{title}</h3>
      {!r.zone ? (
        <p className="m-0"><Pill tone="bad">Outside every active zone</Pill> A rider here cannot book.</p>
      ) : (
        <>
          <p className="m-0">
            <b>{r.zone.name}</b> <span className="muted">{r.zone.code}</span>{' '}
            <Pill tone="good">In service</Pill>
          </p>
          {r.matching_zones.length > 1 ? (
            <p className="help m-0">Inside {r.matching_zones.length} zones ({r.matching_zones.join(', ')}); the highest priority wins.</p>
          ) : null}
          <div className="ops-table-wrap">
            <table className="ops-table ops-table--compact ops-table--auto">
              <caption className="sr-only">{title}: the fare card each vehicle class would use</caption>
              <thead><tr><th scope="col">Vehicle class</th><th scope="col">Fare card in force</th></tr></thead>
              <tbody>
                {r.rate_cards.map((c) => (
                  <tr key={c.vehicle_type}>
                    <th scope="row">{c.vehicle_type_name}</th>
                    <td>
                      {c.card ? <>{cardLine(c.card, symbol)} <span className="muted">· {c.card.zone} v{c.card.version}</span></>
                        : <Pill tone="bad">No fare card</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
