'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { useDensity } from '@/lib/consolePrefs';
import {
  CHANNEL_WORDS, failureRate, hoursWords, type ProviderRow, type ProviderState,
} from '@/lib/notifications';
import { NoAccess, NotificationsNav, messageOf } from '@/components/console/notifications';
import {
  DataTable, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Notifications: providers.
 *
 * Per channel and country: which provider is configured, whether it is LIVE or the STUB, and
 * whether its credentials are present (yes or no). Never a value: this page cannot show a
 * secret because the API never sends one. Turning live sending on is an environment change
 * made by the owner once the provider accounts are confirmed; nothing here switches it.
 */
export default function ProvidersPage() {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const [state, setState] = useState<ProviderState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setState(await api.get<ProviderState>('/notifications/admin/providers/'));
    } catch (err) {
      setState(null);
      setError(messageOf(err, 'The provider settings could not be loaded.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const columns = useMemo(() => [
    { key: 'ch', label: 'Channel', width: '8rem', sortValue: (r: ProviderRow) => r.channel, render: (r: ProviderRow) => CHANNEL_WORDS[r.channel] },
    { key: 'co', label: 'Country', width: '6rem', sortValue: (r: ProviderRow) => r.country, render: (r: ProviderRow) => r.country },
    { key: 'p', label: 'Provider', sortValue: (r: ProviderRow) => r.provider, render: (r: ProviderRow) => <b>{r.provider}</b> },
    { key: 'mode', label: 'Sending', width: '9rem',
      render: (r: ProviderRow) => (r.internal ? <Pill>Internal</Pill> : r.mode === 'live' ? <Pill tone="good">Live</Pill> : <Pill tone="wait">Stub</Pill>) },
    { key: 'cred', label: 'Credentials', width: '11rem',
      render: (r: ProviderRow) => (r.internal ? <span className="muted">not needed</span>
        : r.credentials_present ? <Pill tone="good">Present</Pill> : <Pill tone="bad">Not set</Pill>) },
    { key: 'names', label: 'Environment variables', hideBelow: 1280 as const,
      render: (r: ProviderRow) => (r.credential_names.length ? <code className="nf-envnames">{r.credential_names.join(', ')}</code> : <span className="muted">—</span>) },
    { key: 'fail', label: 'Failed (15 min)', num: true, width: '9rem', hideBelow: 1100 as const,
      render: (r: ProviderRow) => (r.recent_total ? `${r.recent_failed} of ${r.recent_total} · ${failureRate(r)}` : '—') },
  ], []);

  if (!canOpen(access, 'notifications')) {
    return (<><PageHeader title="Notifications" /><NoAccess /></>);
  }

  return (
    <>
      <PageHeader title="Notifications"
        subtitle="Which provider carries each channel in each country, and whether it is live. This page shows whether credentials are present, never what they are." />
      <NotificationsNav />

      {error ? (
        <ErrorState title="The provider settings could not be loaded" detail={error} onRetry={() => void load()} />
      ) : state === null ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the provider settings</span>
          <Skeleton kind="row" count={5} />
        </div>
      ) : (
        <div className="grid gap-4">
          <Panel title="Sending">
            <Facts>
              <Fact label="Live sending">
                {state.live_send ? <Pill tone="good">On</Pill> : <><Pill tone="wait">Off</Pill> <span className="muted">every external channel uses the stub</span></>}
              </Fact>
              <Fact label="Environment">{state.production ? 'Production' : 'Not production'}</Fact>
              <Fact label="Test allowlist">
                {state.allowlist_size} recipient{state.allowlist_size === 1 ? '' : 's'}
                {state.allowlist_applies ? ' (only these receive anything)' : state.live_send ? ' (not applied in production)' : ' (applies only when live sending is on)'}
              </Fact>
              {Object.entries(state.quiet_hours).map(([country, hours]) => (
                <Fact key={country} label={`Promotional quiet hours · ${country}`}>{hoursWords(hours)}, recipient local time</Fact>
              ))}
            </Facts>
            <p className="help mt-3 mb-0">
              Quiet hours apply to promotional messages only; the exact TRAI and TCPA windows still need legal confirmation before
              any live promotional send.
            </p>
          </Panel>

          <Panel title="Providers by channel and country" flush>
            <TableToolbar summary={`${state.providers.length} routes`} density={density} onDensity={setDensity} />
            <DataTable caption="Providers by channel and country" rows={state.providers} columns={columns}
              rowKey={(r) => `${r.channel}-${r.country}`} density={density}
              defaultSort={{ key: 'ch', dir: 'asc' }} maxHeight={false} />
          </Panel>
        </div>
      )}
    </>
  );
}
