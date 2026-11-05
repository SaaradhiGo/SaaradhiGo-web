'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  MODE_WORDS, canReadIntegrations, modeTone, type IntegrationRow, type IntegrationsPayload,
} from '@/lib/platform';
import { messageOf } from '@/components/console/notifications';
import { MapsCallsPanel, PlatformNav, PlatformNoAccess } from '@/components/console/platform';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { chipToneOf } from '@/components/console/listKit';
import { PageHeader } from '@/components/console/ui';

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
  const [country, setCountry] = useState('');
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

  const columns: ListColumn<IntegrationRow>[] = [
    { key: 'type', label: 'Provider type', primary: true, render: (r) => r.label },
    { key: 'country', label: 'Country', render: (r) => (r.country === 'all' ? 'All' : r.country) },
    { key: 'provider', label: 'Provider', render: (r) => r.provider },
    { key: 'configured', label: 'Configured', render: (r) => (r.configured ? <StatusChip tone="good">Yes</StatusChip> : <StatusChip tone="caution">No</StatusChip>) },
    { key: 'mode', label: 'Mode', render: (r) => <StatusChip tone={chipToneOf(modeTone(r.mode))}>{MODE_WORDS[r.mode]}</StatusChip> },
    { key: 'blocker', label: 'Waits on', render: (r) => (r.blocker ? `Blocker #${r.blocker}` : <span className="muted">none</span>) },
    { key: 'ok', label: 'Last success', render: (r) => (r.last_success_at ? stamp(r.last_success_at, timeZoneFor(r.country)) : <span className="muted">none recorded</span>) },
    { key: 'bad', label: 'Last error', render: (r) => (r.last_error_at ? stamp(r.last_error_at, timeZoneFor(r.country)) : <span className="muted">none recorded</span>) },
    { key: 'env', label: 'Environment variables', render: (r) => (r.env_vars.length ? <code className="nf-envnames">{r.env_vars.join(', ')}</code> : <span className="muted">—</span>) },
    { key: 'note', label: 'Note', render: (r) => r.note || <span className="muted">—</span> },
  ];

  if (!canReadIntegrations(access)) {
    return (<><PageHeader title="Integrations" /><PlatformNav /><PlatformNoAccess what="Integrations" /></>);
  }

  const all = [...(data?.rows ?? [])].sort((x, y) => x.label.localeCompare(y.label) || x.country.localeCompare(y.country));
  const countries = Array.from(new Set(all.map((r) => r.country))).sort();
  const inView = (r: IntegrationRow) => (view === 'live' ? r.mode === 'live' : view === 'attention' ? (!r.configured || r.mode !== 'live') : true);
  const needle = q.trim().toLowerCase();
  const rows = all.filter((r) => inView(r) && (!country || r.country === country)
    && (!needle || [r.label, r.provider, r.type].some((t) => t.toLowerCase().includes(needle))));

  return (
    <>
      <PlatformNav />
      {data ? (
        <p className="ops-note mb-3" role="note">
          Live sending {data.live_send ? <StatusChip tone="good">On</StatusChip> : <><StatusChip tone="info">Off</StatusChip> every external message goes to the stub</>}
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
          ...(country ? [{ key: 'country', label: `Country: ${country === 'all' ? 'All' : country}`, onRemove: () => setCountry('') }] : []),
          ...(q.trim() ? [{ key: 'q', label: `Search: ${q.trim()}`, onRemove: () => setQ('') }] : []),
        ]}
        filterSlot={(
          <div className="ops-list__filters">
            <label className="sr-only" htmlFor="in-country">Country</label>
            <select id="in-country" className="ops-select ops-list__select" value={country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">Every country</option>
              {countries.map((c) => <option key={c} value={c}>{c === 'all' ? 'All countries' : c}</option>)}
            </select>
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
    </>
  );
}
