'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { ErrorState, Fact, Facts, Panel, Skeleton } from '@/components/console/ui';
import { FieldsDrawer, type FieldSpec } from '@/components/console/kit/FieldsDrawer';

/**
 * Reports > Cost per trip (open books, 9 Nov): a market's month of completed trips, what the
 * platform earned from them, what they cost (Maps, SMS, masked calls, payment fees, from the
 * metered data) and the fixed costs Srini enters. The surplus after a reserve is shown only:
 * no rebate is paid (the `driver_rebate` flag stays off).
 */
type Report = {
  country: string; month: string; completed_trips: number; fee_income_minor: number; commission_minor: number;
  platform_fee_minor: number; rider_platform_fee_minor: number;
  variable_costs: { maps_minor: number; sms_minor: number; sms_count: number; calls_minor: number; calls: number; payment_fees_minor: number };
  variable_costs_minor: number; variable_cost_per_trip_minor: number | null; fixed_costs_minor: number;
  fixed_costs_entered: boolean; reserve_percent: string; reserve_minor: number; surplus_minor: number;
  missing_config: string[];
};

const money = (minor: number | null | undefined, country: string) =>
  minor == null ? '—' : `${country === 'US' ? '$' : '₹'}${(minor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const FIXED: FieldSpec[] = [{ key: 'amount_minor', label: 'Fixed costs this month (minor units, ₹1 = 100)', kind: 'number' }];

export default function CostPerTripPage() {
  const [country, setCountry] = useState('IN');
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const load = useCallback(async () => {
    setError(null); setData(null);
    try {
      setData(await api.get<Report>(`/pricing/admin/cost-per-trip/?country=${country}&month=${month}`));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The report could not be loaded.');
    }
  }, [country, month]);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <header className="ops-list__head mb-3">
        <div><h1>Cost per trip</h1><p>Income and costs per completed trip, by market and month. The surplus is shown only; nothing is paid out from it.</p></div>
        <div className="flex gap-2">
          <select className="input" aria-label="Market" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="IN">India</option><option value="US">United States</option>
          </select>
          <input className="input" type="month" aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </header>
      {error ? <ErrorState title="The report could not be loaded" detail={error} onRetry={() => void load()} />
        : !data ? <Skeleton kind="row" count={4} /> : (
          <div className="grid gap-4">
            <Panel title={`${data.country} · ${data.month.slice(0, 7)}`}>
              <Facts>
                <Fact label="Completed trips">{data.completed_trips}</Fact>
                <Fact label="Fee income">{money(data.fee_income_minor, country)} (commission {money(data.commission_minor, country)}, platform fee {money(data.platform_fee_minor, country)})</Fact>
                <Fact label="Rider platform fee">{money(data.rider_platform_fee_minor, country)}</Fact>
                <Fact label="Maps">{money(data.variable_costs.maps_minor, country)}</Fact>
                <Fact label="SMS">{money(data.variable_costs.sms_minor, country)} ({data.variable_costs.sms_count} sent)</Fact>
                <Fact label="Masked calls">{money(data.variable_costs.calls_minor, country)} ({data.variable_costs.calls} calls)</Fact>
                <Fact label="Payment fees">{money(data.variable_costs.payment_fees_minor, country)}</Fact>
                <Fact label="Variable cost per trip">{money(data.variable_cost_per_trip_minor, country)}</Fact>
                <Fact label="Fixed costs">{data.fixed_costs_entered ? money(data.fixed_costs_minor, country) : 'not entered'}{' '}
                  <button type="button" className="ops-linkbtn" onClick={() => setEditing(true)}>Enter…</button></Fact>
                <Fact label={`Reserve (${data.reserve_percent}%)`}>{money(data.reserve_minor, country)}</Fact>
                <Fact label="Surplus">{money(data.surplus_minor, country)}</Fact>
              </Facts>
              {data.missing_config.length ? <p className="help">Not configured yet, counted as 0: {data.missing_config.join(', ')}.</p> : null}
            </Panel>
          </div>
        )}
      {editing ? (
        <FieldsDrawer title={`Fixed costs · ${country} · ${month}`} fields={FIXED} reasonRequired={false}
          initial={{ amount_minor: data?.fixed_costs_entered ? String(data.fixed_costs_minor) : '' }}
          send={(changes, reason) => api.put(`/pricing/admin/fixed-costs/${country}/${month}/`, { ...changes, note: reason })}
          onClose={() => setEditing(false)} onDone={() => { setEditing(false); void load(); }} />
      ) : null}
    </>
  );
}
