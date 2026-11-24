'use client';

import type { IntegrationRow, IntegrationsPayload } from '@/lib/platform';
import { placeName } from '@/lib/places';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { acknowledgeAlert } from '@/lib/commandCentre';
import { waited } from '@/lib/workspace';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { Empty, ErrorState, PageHeader, Skeleton } from '@/components/console/ui';

/**
 * Engineering health (owner, 22 Nov). System checks -- data integrity, the scheduler, message
 * providers, the Maps budget -- and whether the audit log's hash chain verifies. They belong to
 * Engineering (and Sentry), so they never appear in ops "Needs attention", on the live map or the
 * dashboard. Super Admin only (`platform.settings`).
 */

type EngAlert = {
  id: number; kind: string; severity: string; title: string; created_at: string;
  owner: string; age_seconds: number; age_text: string; next_step: { text: string; link: string };
};
type EngPayload = {
  alerts: EngAlert[];
  audit_chain: { rows: number; problems: number; by_issue: Record<string, number>; verifies: boolean };
};

const KIND_WORDS: Record<string, string> = {
  'platform.data_integrity': 'Data integrity',
  'platform.scheduler_stopped': 'Scheduler',
  'notify.provider_failing': 'Message provider',
  'platform.maps_budget': 'Maps budget',
};

export default function EngineeringHealthPage() {
  const [data, setData] = useState<EngPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.get<EngPayload>('/command-centre/admin/engineering/'));
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) { setForbidden(true); return; }
      setError(e instanceof ApiError && e.fromServer ? e.message : 'Check your connection, then try again.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function done(a: EngAlert) {
    setBusy(a.id);
    try {
      await acknowledgeAlert(a.id, 'Handled by Engineering');
      await load();
    } catch (e) {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  }

  if (forbidden) return <Empty title="Engineering health is for Super Admins" detail="System checks are handled by Engineering." />;
  if (error && !data) return <ErrorState title="Engineering health could not be loaded" detail={error} onRetry={() => void load()} />;
  if (!data) return <Skeleton kind="block" count={2} />;
  const chain = data.audit_chain;

  return (
    <div className="ops-ws">
      <PageHeader title="Engineering health"
        subtitle="System checks for Engineering. They are also sent to Sentry, and never shown to ops." />

      <section className="ops-card" aria-label="Audit log integrity">
        <header className="ops-card__head">
          <div>
            <h2>Audit log integrity</h2>
            <p>Every audit entry is linked to the one before it, so an edit or a deletion shows up here.</p>
          </div>
          <StatusChip tone={chain.verifies ? 'good' : 'critical'}>{chain.verifies ? 'Verifies' : 'Broken'}</StatusChip>
        </header>
        <p className="sg-num">
          {chain.rows.toLocaleString('en-IN')} entries checked
          {chain.verifies ? ', no problems.' : `, ${chain.problems} problem${chain.problems === 1 ? '' : 's'}: `
            + Object.entries(chain.by_issue).map(([k, n]) => `${n} ${k}`).join(', ') + '.'}
        </p>
      </section>

      <section className="ops-card" aria-label="Open system checks">
        <header className="ops-card__head">
          <div><h2>Open system checks</h2><p>Oldest last. Mark one handled once the cause is fixed.</p></div>
        </header>
        {data.alerts.length === 0 ? (
          <p className="muted">All clear: no open system checks.</p>
        ) : (
          <ul className="ops-health">
            {data.alerts.map((a) => (
              <li key={a.id}>
                <div>
                  <b>{KIND_WORDS[a.kind] ?? 'System check'}</b>
                  <p className="mb-0">{a.title}</p>
                  <p className="help mb-0">{waited(a.age_seconds)} · Owner: {a.owner} · Next: {a.next_step.text}</p>
                </div>
                <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy === a.id}
                  onClick={() => void done(a)}>Mark handled</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <EnvNames />
    </div>
  );
}

/** 24 Nov (owner): environment variable names live here, for engineers, and nowhere else. */
function EnvNames() {
  const [rows, setRows] = useState<IntegrationRow[] | null>(null);
  useEffect(() => {
    api.get<IntegrationsPayload>('/platform/admin/integrations/').then((d) => setRows(d.rows)).catch(() => setRows(null));
  }, []);
  const withEnv = (rows ?? []).filter((r) => r.env_vars.length);
  if (!withEnv.length) return null;
  return (
    <section className="ops-card" aria-labelledby="eng-env">
      <h2 id="eng-env">Environment variables each provider reads</h2>
      <p className="help">Names only; this console never shows a value.</p>
      <ul className="ops-list-plain">
        {withEnv.map((r) => (
          <li key={`${r.type}-${r.country}`}><b>{r.label}</b> · {placeName(r.country === 'all' ? 'GLOBAL' : r.country)} · <code className="nf-envnames">{r.env_vars.join(', ')}</code></li>
        ))}
      </ul>
    </section>
  );
}
