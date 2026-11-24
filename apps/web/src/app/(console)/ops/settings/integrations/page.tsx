'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { selectedMarket, useAdminAccess } from '@/lib/adminScope';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  MODE_WORDS, canReadIntegrations, canWritePlatform, modeTone, type IntegrationRow, type IntegrationsPayload,
} from '@/lib/platform';
import { messageOf } from '@/components/console/notifications';
import { MapsCallsPanel, PlatformNav, PlatformNoAccess } from '@/components/console/platform';
import { MapsCostPanel } from '@/components/console/maps/MapsCostPanel';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { chipToneOf } from '@/components/console/listKit';
import { PageHeader } from '@/components/console/ui';
import { placeName } from '@/lib/places';
import { providerName } from '@/lib/templateNames';

/**
 * Platform settings: Integrations.
 *
 * One row per provider type per country: whether it is configured (an environment variable is set:
 * yes or no), its mode, the last success and error the platform recorded, and the go-live blocker it
 * waits on. READ-ONLY, and it cannot show a secret: the API sends presence and names, never a value,
 * a key prefix or a URL with credentials.
 */
export default function IntegrationsPage() {
  const access = useAdminAccess();
  const [view, setView] = useState('');
  const [q, setQ] = useState('');
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<IntegrationsPayload>('/platform/admin/integrations/'));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The integrations could not be loaded.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  // 24 Nov (owner): written for a Super Admin -- provider, country, live or not, last success, and
  // what is missing in words. Environment variable names are on Engineering health only.
  const columns: ListColumn<IntegrationRow>[] = [
    { key: 'type', label: 'Service', primary: true, render: (r) => r.label },
    { key: 'provider', label: 'Provider', render: (r) => (r.provider === 'none' ? <span className="muted">None chosen</span> : providerName(r.provider)) },
    { key: 'country', label: 'Country', render: (r) => (r.country === 'all' ? 'Every country' : placeName(r.country)) },
    { key: 'live', label: 'Live?', render: (r) => (r.configured && r.mode === 'live'
      ? <StatusChip tone="good">Live</StatusChip>
      : <StatusChip tone={chipToneOf(modeTone(r.mode))}>{r.configured ? MODE_WORDS[r.mode] : 'Not set up'}</StatusChip>) },
    { key: 'ok', label: 'Last success', render: (r) => (r.last_success_at ? stamp(r.last_success_at, timeZoneFor(r.country)) : <span className="muted">None recorded</span>) },
    { key: 'missing', label: 'What is missing', render: (r) => (r.waits_on || r.note || (r.configured && r.mode === 'live' ? <span className="muted">Nothing</span> : 'Not set up yet.')) },
  ];

  if (!canReadIntegrations(access)) {
    return (<><PageHeader title="Integrations" /><PlatformNav /><PlatformNoAccess what="Integrations" /></>);
  }

  // The console's market switch: that market's providers plus the ones every market shares.
  // The list is platform configuration (one small payload), so it is narrowed here.
  const market = selectedMarket(access);
  const all = [...(data?.rows ?? [])].filter((r) => !market || r.country === market || r.country === 'all').sort((x, y) => x.label.localeCompare(y.label) || x.country.localeCompare(y.country));
  const inView = (r: IntegrationRow) => (view === 'live' ? r.mode === 'live' : view === 'attention' ? (!r.configured || r.mode !== 'live') : true);
  const needle = q.trim().toLowerCase();
  const rows = all.filter((r) => inView(r)
    && (!needle || [r.label, r.provider, r.type].some((t) => t.toLowerCase().includes(needle))));

  return (
    <>
      <PlatformNav />
      {data ? (
        <p className="ops-note mb-3" role="note">
          Live sending {data.live_send ? <StatusChip tone="good">On</StatusChip> : <><StatusChip tone="info">Off</StatusChip> messages go to the test sender and nobody receives them</>}
          {' · '}{data.production ? 'Production' : 'Not production'}
          {' · '}a stubbed provider {data.live_providers_required ? 'blocks a launch' : 'is a warning on the launch checklist'}
        </p>
      ) : null}
      <ListPage<IntegrationRow>
        pageKey="settings-integrations"
        title="Integrations"
        summary="Which providers carry payments, messages, maps and files in each country, and whether they are live. This page shows whether a credential is present, never what it is."
        views={[
          { key: '', label: 'All', count: data ? all.length : undefined },
          { key: 'attention', label: 'Not live yet', count: data ? all.filter((r) => !r.configured || r.mode !== 'live').length : undefined },
          { key: 'live', label: 'Live', count: data ? all.filter((r) => r.mode === 'live').length : undefined },
        ]}
        view={view}
        onView={setView}
        chips={[
                    ...(q.trim() ? [{ key: 'q', label: `Search: ${q.trim()}`, onRemove: () => setQ('') }] : []),
        ]}
        filterSlot={(
          <div className="ops-list__filters">
            <label className="sr-only" htmlFor="in-q">Search providers</label>
            <input id="in-q" className="input ops-list__search" type="search" placeholder="Search a provider" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        columns={columns}
        rows={rows}
        rowKey={(r) => `${r.type}-${r.country}`}
        total={data ? rows.length : null}
        page={1}
        pageSize={Math.max(1, rows.length)}
        onPage={() => undefined}
        loading={data === null && !error}
        error={error}
        empty="No provider matches."
      />
      <MapsCallsPanel calls={data?.maps_calls} />
      <MapsCostPanel mayEdit={canWritePlatform(access)} />
    </>
  );
}
