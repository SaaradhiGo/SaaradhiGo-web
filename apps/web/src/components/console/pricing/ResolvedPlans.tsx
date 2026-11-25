'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { classWord } from '@/lib/pricingWords';
import { selectedMarket, useAdminAccess } from '@/lib/adminScope';
import { hiddenCityName, hiddenPlace } from '@/lib/notLaunched';
import { FitBox } from '@/components/console/ui';

/**
 * What every place and class pays (Srini's ruling, 22 Nov). One row per place -- the country, its
 * states, cities and zones -- and one column per class. A cell says the plan in plain words; a value
 * inherited from a level above says where from ("from Telangana"); a value set right there is
 * highlighted as an override.
 */
type Row = {
  kind: 'country' | 'state' | 'city' | 'zone'; code: string; name: string; vehicle_type: string;
  words: string; plan_type: string | null; from_code: string | null; from_name: string | null; override: boolean;
};
type Payload = { country: string; day: string; classes: string[]; rows: Row[] };

const KIND_WORDS: Record<Row['kind'], string> = { country: 'Country', state: 'State', city: 'City', zone: 'Zone' };

export function ResolvedPlans() {
  // 24 Nov (owner): the market follows the place bar; no second control for it here.
  const access = useAdminAccess();
  const market = selectedMarket(access);
  const [picked, setCountry] = useState<'IN' | 'US'>('IN');
  const country = market === 'US' || market === 'IN' ? market : picked;
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null); setError(null);
    api.get<Payload>(`/pricing/admin/fee-plans/resolved/?country=${country}`).then(setData).catch((e) => {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'What each place pays could not be loaded.');
    });
  }, [country]);
  const places = useMemo(() => {
    const out = new Map<string, { kind: Row['kind']; name: string; cells: Map<string, Row> }>();
    for (const r of data?.rows ?? []) {
      const p = out.get(r.code) ?? { kind: r.kind, name: r.name, cells: new Map() };
      p.cells.set(r.vehicle_type, r);
      out.set(r.code, p);
    }
    // Not-launched places stay out unless "Show not launched" is on (owner 24 Nov).
    return Array.from(out.entries()).filter(([code, p]) => !hiddenPlace(code) && !hiddenCityName(p.name));
  }, [data]);

  return (
    <section className="ops-card" aria-labelledby="rp-title">
      <header className="ops-card__head">
        <div>
          <h2 id="rp-title">What each place pays</h2>
          <p>The plan in force today for every place and class. Highlighted values are set at that place; the rest come from the level above.</p>
        </div>
        {market ? null : <div className="ops-seg" role="group" aria-label="Market">
          {(['IN', 'US'] as const).map((c) => (
            <button key={c} type="button" className="ops-seg__btn" aria-pressed={country === c} onClick={() => setCountry(c)}>
              {c === 'IN' ? 'India' : 'United States'}
            </button>
          ))}
        </div>}
      </header>
      {error ? <div className="alert-error" role="alert">{error}</div> : null}
      {data ? (
        <FitBox className="ops-list__table rp-resolved">
          <table>
            <caption className="sr-only">Driver fee by place and class</caption>
            <thead>
              <tr><th scope="col">Place</th>{data.classes.map((c) => <th scope="col" key={c}>{classWord(c)}</th>)}</tr>
            </thead>
            <tbody>
              {places.map(([code, p]) => (
                <tr key={code} className={`rp-resolved__${p.kind}`}>
                  <th scope="row"><span className="rp-resolved__place" title={KIND_WORDS[p.kind]}>{p.name}</span></th>
                  {data.classes.map((c) => {
                    const cell = p.cells.get(c);
                    if (!cell) return <td key={c}>—</td>;
                    return (
                      <td key={c}>
                        {cell.override ? <mark className="rp-resolved__own">{cell.words}</mark> : <span>{cell.words}</span>}
                        {!cell.override && cell.from_name ? <span className="muted rp-resolved__from"> (from {cell.from_name})</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </FitBox>
      ) : !error ? <p className="muted">Loading…</p> : null}
    </section>
  );
}
