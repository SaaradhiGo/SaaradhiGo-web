'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import {
  MODE_WORDS, canReadIntegrations, modeTone, type IntegrationRow, type IntegrationsPayload,
} from '@/lib/platform';
import { messageOf } from '@/components/console/notifications';
import { PlatformNav, PlatformNoAccess } from '@/components/console/platform';
import {
  DataTable, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

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
  const [density, setDensity] = useDensity();
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

  const columns = useMemo(() => [
    { key: 'type', label: 'Provider type', sortValue: (r: IntegrationRow) => r.label, render: (r: IntegrationRow) => <b>{r.label}</b> },
    { key: 'country', label: 'Country', width: '6rem', sortValue: (r: IntegrationRow) => r.country, render: (r: IntegrationRow) => (r.country === 'all' ? 'All' : r.country) },
    { key: 'provider', label: 'Provider', width: '9rem', render: (r: IntegrationRow) => r.provider },
    { key: 'configured', label: 'Configured', width: '9rem',
      render: (r: IntegrationRow) => (r.configured ? <Pill tone="good">Yes</Pill> : <Pill tone="bad">No</Pill>) },
    { key: 'mode', label: 'Mode', width: '8rem', render: (r: IntegrationRow) => <Pill tone={modeTone(r.mode)}>{MODE_WORDS[r.mode]}</Pill> },
    { key: 'blocker', label: 'Waits on', width: '9rem',
      render: (r: IntegrationRow) => (r.blocker ? `Blocker #${r.blocker}` : <span className="muted">none</span>) },
    { key: 'ok', label: 'Last success', width: '10rem', hideBelow: 1100 as const, render: (r: IntegrationRow) => (r.last_success_at ? stamp(r.last_success_at) : <span className="muted">none recorded</span>) },
    { key: 'bad', label: 'Last error', width: '10rem', hideBelow: 1100 as const, render: (r: IntegrationRow) => (r.last_error_at ? stamp(r.last_error_at) : <span className="muted">none recorded</span>) },
    { key: 'env', label: 'Environment variables', hideBelow: 1500 as const,
      render: (r: IntegrationRow) => (r.env_vars.length ? <code className="nf-envnames">{r.env_vars.join(', ')}</code> : <span className="muted">—</span>) },
    { key: 'note', label: 'Note', hideBelow: 1500 as const, render: (r: IntegrationRow) => r.note || <span className="muted">—</span> },
  ], []);

  if (!canReadIntegrations(access)) {
    return (<><PageHeader title="Platform settings" /><PlatformNav /><PlatformNoAccess what="Integrations" /></>);
  }

  return (
    <>
      <PageHeader title="Platform settings"
        subtitle="Which providers carry payments, messages, maps and files in each country, and whether they are live. This page shows whether a credential is present, never what it is." />
      <PlatformNav />
      {error ? (
        <ErrorState title="The integrations could not be loaded" detail={error} onRetry={() => void load()} />
      ) : data === null ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the integrations</span>
          <Skeleton kind="row" count={6} />
        </div>
      ) : (
        <div className="grid gap-4">
          <Panel title="Sending">
            <Facts>
              <Fact label="Live sending">{data.live_send ? <Pill tone="good">On</Pill> : <><Pill tone="wait">Off</Pill> <span className="muted">every external message goes to the stub</span></>}</Fact>
              <Fact label="Environment">{data.production ? 'Production' : 'Not production'}</Fact>
              <Fact label="A stubbed provider">{data.live_providers_required ? 'Blocks a launch' : 'A warning on the launch checklist'}</Fact>
            </Facts>
          </Panel>
          <Panel title="Providers" flush>
            <TableToolbar summary={`${data.rows.length} rows`} density={density} onDensity={setDensity} />
            <DataTable caption="Integrations by provider type and country" rows={data.rows} columns={columns}
              rowKey={(r) => `${r.type}-${r.country}`} density={density} defaultSort={{ key: 'type', dir: 'asc' }} maxHeight={false} />
          </Panel>
        </div>
      )}
    </>
  );
}
