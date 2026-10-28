'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useDensity } from '@/lib/consolePrefs';
import { currencySymbol } from '@/lib/money';
import {
  Column,
  DataTable,
  Drawer,
  Empty,
  ErrorState,
  Fact,
  Facts,
  PageHeader,
  Panel,
  Pill,
  Skeleton,
  TableToolbar,
} from '@/components/console/ui';

/**
 * Service zones and what each one charges.
 *
 * READ-ONLY, DELIBERATELY. Fares change through the versioned,
 * approved configuration that Phase 1(c) introduces, not from a table
 * cell; until that lands this page shows what is live and nothing on it
 * edits anything. A zone's row opens its active rate cards, priced in
 * the zone's own currency -- the old page printed "Rs" in front of every
 * number, including Austin's.
 */
type Zone = {
  id: number;
  code: string;
  name: string;
  city: string;
  state_code: string;
  country: string;
  zone_type: string;
  priority: number;
  is_active: boolean;
  currency: string;
};

type RateCard = {
  id: number;
  zone_code: string;
  vehicle_type_name: string;
  base_fare: string;
  per_km_fare: string;
  per_min_fare: string;
  min_fare: string;
  surge_cap_multiplier: string;
  commission_percent: string;
  gst_percent: string;
  version: number;
  is_active: boolean;
};

function asList<T>(r: unknown): T[] {
  const o = r as { results?: T[]; data?: T[] } | T[];
  if (Array.isArray(o)) return o;
  if (Array.isArray(o?.results)) return o.results;
  if (Array.isArray(o?.data)) return o.data;
  return [];
}

export default function ZonesPage() {
  const [density, setDensity] = useDensity();
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Zone | null>(null);
  const [cards, setCards] = useState<Record<number, RateCard[] | null | 'error'>>({});

  const load = useCallback(async () => {
    setZones(null);
    setError(null);
    try {
      setZones(asList<Zone>(await api.get('/pricing/admin/zones/')));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the zones.');
      setZones([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function open(z: Zone) {
    setSelected(z);
    if (cards[z.id] !== undefined && cards[z.id] !== 'error') return;
    setCards((c) => ({ ...c, [z.id]: null }));
    try {
      const list = asList<RateCard>(await api.get(`/pricing/admin/rate-cards/?zone=${z.id}&is_active=true`));
      setCards((c) => ({ ...c, [z.id]: list }));
    } catch {
      setCards((c) => ({ ...c, [z.id]: 'error' }));
    }
  }

  const columns: Column<Zone>[] = [
    {
      key: 'name', label: 'Zone', sortValue: (z) => z.name,
      render: (z) => <><b>{z.name}</b> <span className="muted">{z.code}</span></>,
    },
    { key: 'where', label: 'Where', sortValue: (z) => `${z.country} ${z.state_code} ${z.city}`, render: (z) => `${z.city}, ${z.state_code}, ${z.country}` },
    { key: 'type', label: 'Type', width: '9rem', sortValue: (z) => z.zone_type, render: (z) => <span className="capitalize">{z.zone_type?.replace(/_/g, ' ')}</span> },
    { key: 'priority', label: 'Priority', num: true, width: '7rem', sortValue: (z) => z.priority, render: (z) => z.priority },
    { key: 'currency', label: 'Currency', width: '7rem', render: (z) => z.currency },
    {
      key: 'status', label: 'Status', width: '8rem', sortValue: (z) => (z.is_active ? 1 : 0),
      render: (z) => (z.is_active ? <Pill tone="good">Active</Pill> : <Pill tone="neutral">Inactive</Pill>),
    },
  ];

  const sym = (z: Zone) => currencySymbol(z.currency);
  const selectedCards = selected ? cards[selected.id] : undefined;

  return (
    <>
      <PageHeader
        title="Zones & fares"
        subtitle="What is live. Fares change through approved configuration, not here."
      />

      <Panel flush>
        <TableToolbar
          summary={zones ? `${zones.length} zone${zones.length === 1 ? '' : 's'} · ${zones.filter((z) => z.is_active).length} active` : null}
          density={density}
          onDensity={setDensity}
        />
        {zones === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading zones</span>
            <Skeleton kind="row" count={5} />
          </div>
        ) : error ? (
          <div className="p-4"><ErrorState title="The zones could not be loaded" detail={error} onRetry={() => void load()} /></div>
        ) : zones.length === 0 ? (
          <Empty title="No service zones" detail="Nothing is configured for this region yet." />
        ) : (
          <DataTable
            caption="Service zones"
            rows={zones}
            columns={columns}
            rowKey={(z) => z.id}
            density={density}
            onRow={(z) => void open(z)}
            selectedKey={selected?.id ?? null}
            defaultSort={{ key: 'where', dir: 'asc' }}
            maxHeight={false}
          />
        )}
      </Panel>

      <Drawer open={selected !== null} title={selected ? `${selected.name} · ${selected.code}` : ''} onClose={() => setSelected(null)} wide>
        {selected && (
          <div className="grid gap-5">
            <Facts>
              <Fact label="Where">{selected.city}, {selected.state_code}, {selected.country}</Fact>
              <Fact label="Type"><span className="capitalize">{selected.zone_type?.replace(/_/g, ' ')}</span></Fact>
              <Fact label="Priority">{selected.priority}</Fact>
              <Fact label="Currency">{selected.currency}</Fact>
              <Fact label="Status">{selected.is_active ? <Pill tone="good">Active</Pill> : <Pill tone="neutral">Inactive</Pill>}</Fact>
            </Facts>

            <section>
              <h3 className="ops-subhead">Active rate cards</h3>
              {selectedCards === null || selectedCards === undefined ? (
                <div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={3} /></div>
              ) : selectedCards === 'error' ? (
                <ErrorState title="The rate cards could not be loaded" onRetry={() => { setCards((c) => ({ ...c, [selected.id]: undefined as unknown as null })); void open(selected); }} />
              ) : selectedCards.length === 0 ? (
                <Empty title="No active rate card" detail="This zone cannot quote a fare until one is approved." />
              ) : (
                <div className="ops-table-wrap">
                  <table className="ops-table ops-table--compact ops-table--auto">
                    <caption className="sr-only">Rate cards for {selected.name}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Vehicle</th>
                        <th scope="col" className="num">Base</th>
                        <th scope="col" className="num">/km</th>
                        <th scope="col" className="num">/min</th>
                        <th scope="col" className="num">Min</th>
                        <th scope="col" className="num">Surge cap</th>
                        <th scope="col" className="num">Commission</th>
                        <th scope="col" className="num">GST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedCards.map((c) => (
                        <tr key={c.id}>
                          <td>{c.vehicle_type_name} <span className="muted">v{c.version}</span></td>
                          <td className="num">{sym(selected)}{c.base_fare}</td>
                          <td className="num">{sym(selected)}{c.per_km_fare}</td>
                          <td className="num">{sym(selected)}{c.per_min_fare}</td>
                          <td className="num">{sym(selected)}{c.min_fare}</td>
                          <td className="num">×{c.surge_cap_multiplier}</td>
                          <td className="num">{c.commission_percent}%</td>
                          <td className="num">{c.gst_percent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        )}
      </Drawer>
    </>
  );
}
