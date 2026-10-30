'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import { formatMinor } from '@/lib/finance';
import {
  NO_POLICY_WORDS, WEEKDAYS, canConfigurePayouts, configBody, configChanges, configProblem, draftFrom,
  feeNeedsWarning, scheduleLabel, type ConfigDraft, type PayoutConfig,
} from '@/lib/financeActions';
import { interpretWrite, newIdempotencyKey } from '@/lib/trips';
import { PageLink } from '@/components/console/PageLink';
import { FinanceNav } from '@/components/console/finance';
import {
  DataTable, Drawer, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * Payout settings: each country's fee, minimum, stuck-payout hours and
 * schedule, with the versions it has had, and an edit that is a REQUEST.
 *
 * Editing needs `finance.config` and is always a maker-checker request
 * (`finance.payout_config_change`): the new version is written only when a
 * different admin approves, and a country with no approval policy is blocked,
 * which the page says in words. The fee input carries a standing warning:
 * any fee above zero is shown to drivers exactly as it is charged.
 */
type Version = PayoutConfig & {
  id: number; version: number; is_active: boolean; valid_from: string; valid_to: string | null;
  reason: string; currency: string; minimum_withdrawal: string;
  created_by: { id: number | null; label: string; role: string };
};
type PendingChange = { id: number; status: string; requested_at: string; maker: { label: string } };
type Run = {
  id: number; week_start: string; withdrawal_count: number; amount_minor: number; currency: string;
  outcome: string; approval_request_id: number | null; truncated: boolean; created_at: string;
};
type Country = {
  country: string; name: string; currency: string; configured: boolean; message: string | null;
  config: Version | null; history: Version[]; pending_changes: PendingChange[]; recent_runs: Run[];
  editable: boolean; change_blocked: boolean; change_blocked_reason: string | null;
  payout_approval_blocked: boolean; payout_approval_blocked_reason: string | null;
};
type Payload = { countries: Country[]; editable: boolean; fee_warning: string };

const RUN_WORDS: Record<string, string> = {
  opened: 'Approval request opened', blocked_no_policy: 'Blocked: no approval policy in this country',
  nothing_to_pay: 'Nothing to pay',
};

function SettingsInner() {
  const access = useAdminAccess();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Country | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Payload>(withScope('/payments/admin/payout-config/')));
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The payout settings could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const may = canConfigurePayouts(access);

  return (
    <>
      <PageHeader title="Finance" subtitle="Payout settings per country. A change is a request that a second admin approves." />
      <FinanceNav />
      {notice && (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-4' : 'alert-success mb-4'} role="status">
          <b>{notice.text}</b>
        </div>
      )}
      {data === null && !error ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the payout settings</span>
          <Skeleton kind="row" count={4} />
        </div>
      ) : error ? (
        <ErrorState title="The payout settings could not be loaded" detail={error} onRetry={() => void load()} />
      ) : data && data.countries.length === 0 ? (
        <Empty title="No countries in your scope" detail="Nothing is assigned to your account for payouts." />
      ) : (
        <div className="grid gap-4">
          {data?.countries.map((c) => (
            <Panel key={c.country} title={`${c.name} · ${c.currency}`}>
              {c.config ? (
                <>
                  <Facts>
                    <Fact label="Transfer fee">{Number(c.config.fee_percent)}%</Fact>
                    <Fact label="Minimum withdrawal">{formatMinor(c.config.minimum_withdrawal_minor, c.currency)}</Fact>
                    <Fact label="A payout is stuck after">
                      {c.config.stuck_payout_hours ? `${c.config.stuck_payout_hours} hours` : 'Not checked'}
                    </Fact>
                    <Fact label="Payout schedule">{scheduleLabel(c.config)}</Fact>
                    <Fact label="Version">v{c.config.version} · since {stamp(c.config.valid_from)}</Fact>
                  </Facts>
                  {c.payout_approval_blocked && (
                    <div className="ops-note ops-note--warn mt-3" role="status">
                      <b>{c.payout_approval_blocked_reason}</b>
                    </div>
                  )}
                  {c.pending_changes.length > 0 && (
                    <div className="ops-confirm mt-3" role="status">
                      <b>{c.pending_changes.length} change{c.pending_changes.length === 1 ? '' : 's'} waiting for a second admin</b>
                      <span>
                        {c.pending_changes.map((p) => `Request #${p.id} (asked by ${p.maker.label || 'an operator'})`).join(' · ')}
                      </span>
                    </div>
                  )}
                  {may && c.editable ? (
                    c.change_blocked ? (
                      <div className="ops-note ops-note--warn mt-3" role="status">
                        <b>{c.change_blocked_reason ?? NO_POLICY_WORDS}</b> Settings here cannot be changed from
                        the console until the owner configures an approval policy.
                      </div>
                    ) : (
                      <div className="mt-3">
                        <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setEditing(c)}>
                          Edit as a request…
                        </button>
                      </div>
                    )
                  ) : null}

                  {c.recent_runs.length > 0 && (
                    <div className="mt-4">
                      <DataTable caption={`Scheduled payout runs in ${c.name}`} rows={c.recent_runs}
                        rowKey={(r) => r.id} density="compact" maxHeight={false}
                        columns={[
                          { key: 'week', label: 'Week of', render: (r) => r.week_start },
                          { key: 'n', label: 'Payouts', num: true, render: (r) => r.withdrawal_count },
                          { key: 'amt', label: 'Amount', num: true, render: (r) => formatMinor(r.amount_minor, r.currency) },
                          { key: 'out', label: 'Outcome', render: (r) => (
                            <>
                              {RUN_WORDS[r.outcome] ?? r.outcome}
                              {r.approval_request_id ? ` · request #${r.approval_request_id}` : ''}
                              {r.truncated ? ' · cut at the weekly cap' : ''}
                            </>
                          ) },
                        ]} />
                    </div>
                  )}

                  <div className="mt-4">
                    <DataTable caption={`Version history for ${c.name}`} rows={c.history} rowKey={(h) => h.id}
                      density="compact" maxHeight={false}
                      columns={[
                        { key: 'v', label: 'Version', width: '6rem', render: (h) => (
                          <>v{h.version} {h.is_active ? <Pill tone="good">current</Pill> : null}</>
                        ) },
                        { key: 'fee', label: 'Fee', num: true, render: (h) => `${Number(h.fee_percent)}%` },
                        { key: 'min', label: 'Minimum', num: true, render: (h) => formatMinor(h.minimum_withdrawal_minor, c.currency) },
                        { key: 'stuck', label: 'Stuck after', num: true, render: (h) => (h.stuck_payout_hours ? `${h.stuck_payout_hours} h` : '—') },
                        { key: 'sched', label: 'Schedule', render: (h) => scheduleLabel(h) },
                        { key: 'from', label: 'From', render: (h) => stamp(h.valid_from) },
                        { key: 'by', label: 'Set by', hideBelow: 1100, render: (h) => h.created_by.label || '—' },
                        { key: 'why', label: 'Reason', hideBelow: 1280, render: (h) => h.reason || '—' },
                      ]} />
                  </div>
                </>
              ) : (
                <p className="help m-0">{c.message ?? 'Not configured.'}</p>
              )}
            </Panel>
          ))}
          <p className="help m-0">
            Payout queue: <PageLink page="finance" href="/finance/payouts">Finance &gt; Payouts</PageLink>.
          </p>
        </div>
      )}

      {editing && editing.config ? (
        <EditDrawer country={editing} warning={data?.fee_warning ?? ''}
          onClose={() => setEditing(null)}
          onDone={(text, kind) => { setNotice({ text, kind }); void load(); }} />
      ) : null}
    </>
  );
}

function EditDrawer({ country, warning, onClose, onDone }: {
  country: Country; warning: string; onClose: () => void;
  onDone: (text: string, kind: 'pending' | 'done') => void;
}) {
  const current = country.config as Version;
  const [draft, setDraft] = useState<ConfigDraft>(() => draftFrom(current, country.currency));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);

  const changes = configChanges(current, draft, country.currency);
  const problem = configProblem(draft, country.currency)
    ?? (changes.length === 0 ? 'Nothing differs from the current settings.' : null)
    ?? (reason.trim().length < 5 ? 'Say why, in a few words.' : null);
  const set = <K extends keyof ConfigDraft>(k: K, v: ConfigDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  async function submit() {
    if (problem) return;
    setBusy(true); setError(null);
    try {
      const body = await api.post<{ approval_request?: { id: number; status?: string } | null }>(
        `/payments/admin/payout-config/${country.country}/`, configBody(draft, country.currency, reason, key));
      const result = interpretWrite(body as never, `Payout settings for ${country.name} changed.`);
      setOutcome(result.message);
      onDone(result.message, result.kind);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? (/threshold|policy/i.test(err.message) ? `${NO_POLICY_WORDS} ${err.message}` : err.message)
        : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`Edit payout settings · ${country.name}`}
      onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()}
            disabled={busy || problem !== null}>{busy ? 'Working…' : 'Send for approval'}</button>
        </>
      )}
    >
      <div className="ops-form">
        {outcome ? (
          <div className="ops-confirm" role="status">
            <b>{outcome}</b>
            <span>The settings stay as they are until a different finance admin approves the request.</span>
          </div>
        ) : (
          <>
            <label className="ops-form__label" htmlFor="cfg-fee">Transfer fee (%)</label>
            <input id="cfg-fee" className="input" inputMode="decimal" value={draft.fee}
              onChange={(e) => set('fee', e.target.value)} aria-describedby="cfg-fee-warning" />
            <p id="cfg-fee-warning" className={feeNeedsWarning(draft.fee) ? 'ops-note ops-note--warn m-0' : 'help m-0'}>
              {warning || 'Any fee above zero is shown to drivers exactly as it is charged.'}
              {feeNeedsWarning(draft.fee)
                ? ' With this value the driver app will show a transfer fee line, and every withdrawal will be charged it.'
                : ' At zero the driver app shows no fee line.'}
            </p>
            <label className="ops-form__label" htmlFor="cfg-min">Minimum withdrawal ({country.currency})</label>
            <input id="cfg-min" className="input" inputMode="decimal" value={draft.minimum}
              onChange={(e) => set('minimum', e.target.value)} />
            <label className="ops-form__label" htmlFor="cfg-stuck">A payout is stuck after (hours, empty = not checked)</label>
            <input id="cfg-stuck" className="input" inputMode="numeric" value={draft.stuckHours}
              onChange={(e) => set('stuckHours', e.target.value)} />
            <label className="ops-form__label" htmlFor="cfg-schedule">Payout schedule</label>
            <select id="cfg-schedule" className="input" value={draft.schedule}
              onChange={(e) => set('schedule', e.target.value as ConfigDraft['schedule'])}>
              <option value="on_request">On request (the driver asks)</option>
              <option value="weekly">Weekly (a run creates the payouts)</option>
            </select>
            {draft.schedule === 'weekly' ? (
              <>
                <label className="ops-form__label" htmlFor="cfg-weekday">Weekday (in the country&apos;s own time zone)</label>
                <select id="cfg-weekday" className="input" value={draft.weekday}
                  onChange={(e) => set('weekday', Number(e.target.value))}>
                  {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </>
            ) : null}
            <label className="ops-form__label" htmlFor="cfg-reason">Why (kept in the audit log)</label>
            <textarea id="cfg-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            {changes.length > 0 ? (
              <div className="ops-confirm">
                <b>This request will change</b>
                <span>{changes.map((c) => `${c.label}: ${c.from} to ${c.to}`).join(' · ')}</span>
              </div>
            ) : null}
            {problem && (reason || changes.length > 0) ? <p className="help m-0" role="note">{problem}</p> : null}
          </>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}

export default function PayoutSettingsPage() {
  return <SettingsInner />;
}
