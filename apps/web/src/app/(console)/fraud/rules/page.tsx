'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp } from '@/lib/consoleTime';
import {
  canReadFraud, changedThresholds, thresholdProblem, thresholdWords, type CountryRules, type RuleRow,
} from '@/lib/fraud';
import { interpretWrite, type ApprovalBody } from '@/lib/trips';
import { FraudNav, NoFraudAccess } from '@/components/console/fraud/parts';
import {
  Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * Fraud & Risk: the detection rules.
 *
 * Each country has its own numbers for each rule, versioned: a flag says which version raised it.
 * Reading is for anyone who reads fraud flags. CHANGING A NUMBER IS A REQUEST: the form sends it
 * for a second Super Admin to approve (the server answers 202 and nothing changes yet), and the
 * request is listed under the rule until it is decided. Only Super Admin has the Edit button; the
 * server checks again. A change only affects flags raised from then on.
 *
 * Each rule says what data it reads and what the platform does not store that would sharpen it, so
 * a reviewer knows what a flag can and cannot prove.
 */
const failure = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.fromServer ? err.message : fallback;

function EditDrawer({ country, rule, onClose, onDone }: {
  country: string; rule: RuleRow; onClose: () => void; onDone: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(
    () => Object.fromEntries(rule.thresholds.map((t) => [t.key, String(t.value)])));
  const [enabled, setEnabled] = useState(rule.enabled);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const problems = Object.fromEntries(rule.thresholds.map((t) => [t.key, thresholdProblem(t, draft[t.key] ?? '')]));
  const changes = changedThresholds(rule.thresholds, draft);
  const switched = enabled !== rule.enabled;
  const reasonProblem = reason.trim().length < 5 ? 'Give the reason for the change (at least 5 characters).' : null;
  const blocked = Object.values(problems).some(Boolean) || reasonProblem !== null
    || (Object.keys(changes).length === 0 && !switched);

  async function submit() {
    setTouched(true);
    if (blocked) return;
    setBusy(true); setError(null);
    try {
      const body = await api.put<ApprovalBody>(`/fraud/admin/rules/${country}/${rule.rule_key}/`, {
        thresholds: changes, ...(switched ? { enabled } : {}), reason: reason.trim(),
      });
      onDone(interpretWrite(body, 'No change was needed.').message);
      onClose();
    } catch (err) {
      setError(failure(err, 'The request did not go through. Nothing was changed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open wide title={`${rule.title} · ${country}`} onClose={onClose}
      footer={(
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Sending…' : 'Send for approval'}
          </button>
        </>
      )}>
      <div className="ops-form">
        <div className="ops-confirm">
          <b>This is a request, not a change</b>
          <span>A second Super Admin has to approve it before any number changes. It then applies to flags raised from that moment; older flags keep the version that raised them.</span>
        </div>
        {rule.thresholds.map((t) => (
          <div key={t.key} className="fr-field">
            <label className="ops-form__label" htmlFor={`thr-${t.key}`}>{t.label} ({t.unit})</label>
            <input id={`thr-${t.key}`} className="input" inputMode="numeric" value={draft[t.key] ?? ''}
              aria-invalid={touched && problems[t.key] ? true : undefined}
              aria-describedby={`thr-${t.key}-help`}
              onChange={(e) => setDraft((d) => ({ ...d, [t.key]: e.target.value }))} />
            <span id={`thr-${t.key}-help`} className={touched && problems[t.key] ? 'fr-bad' : 'help'}>
              {touched && problems[t.key] ? problems[t.key] : `Now ${t.value}. Standard ${t.default}. Allowed ${t.low} to ${t.high}.${t.hint ? ` ${t.hint}` : ''}`}
            </span>
          </div>
        ))}
        <label className="fr-switch">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Rule is running
        </label>
        <label className="ops-form__label" htmlFor="thr-reason">Reason (required)</label>
        <textarea id="thr-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        {touched && reasonProblem ? <div className="alert-error" role="alert">{reasonProblem}</div> : null}
        {touched && Object.keys(changes).length === 0 && !switched ? <div className="alert-error" role="alert">Nothing has changed.</div> : null}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}

function RuleCard({ country, rule, mayEdit, onEdit }: {
  country: string; rule: RuleRow; mayEdit: boolean; onEdit: (r: RuleRow) => void;
}) {
  return (
    <article className="fr-rule" aria-labelledby={`rule-${country}-${rule.rule_key}`}>
      <header className="fr-rule__head">
        <h3 id={`rule-${country}-${rule.rule_key}`}>{rule.title}</h3>
        {rule.mode === 'event' ? <Pill>Event-driven</Pill>
          : rule.enabled ? <Pill tone="good">Running</Pill> : <Pill tone="wait">Switched off</Pill>}
        {rule.mode === 'scheduled' && !rule.configured ? <Pill tone="wait">Not configured</Pill> : null}
        {mayEdit && rule.mode === 'scheduled' && rule.configured ? (
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => onEdit(rule)}
            aria-label={`Edit ${rule.title} thresholds for ${country}`}>Edit</button>
        ) : null}
      </header>
      <p className="fr-rule__sum">{rule.summary}</p>
      <dl className="fr-rule__meta">
        <div><dt>Version</dt><dd>{rule.mode === 'event' ? 'n/a' : rule.version || 'none'}</dd></div>
        <div><dt>Last run</dt><dd>{rule.mode === 'event' ? 'On each blocked reward' : rule.last_run_at ? stamp(rule.last_run_at) : 'Not yet'}</dd></div>
        <div><dt>Flags in 7 days</dt><dd className="sg-num">{rule.flags_7d}</dd></div>
      </dl>
      {rule.thresholds.length > 0 ? (
        <ul className="fr-thr" aria-label={`${rule.title} thresholds`}>
          {rule.thresholds.map((t) => (
            <li key={t.key}><span>{t.label}</span><b className="sg-num">{thresholdWords(t)}</b></li>
          ))}
        </ul>
      ) : null}
      {rule.pending.map((p) => (
        <div key={p.id} className="fr-pending" role="status">
          <b>Waiting for a second approver · request #{p.id}</b>
          <span>
            {Object.entries(p.thresholds)
              .filter(([k, v]) => rule.thresholds.some((t) => t.key === k && t.value !== v))
              .map(([k, v]) => {
                const t = rule.thresholds.find((x) => x.key === k);
                return `${t?.label ?? k}: ${t?.value} → ${v}`;
              }).join(' · ') || (p.enabled === false ? 'Switch the rule off' : p.enabled ? 'Switch the rule on' : 'No numeric change')}
          </span>
          <span className="muted">Asked by {p.maker_label || 'an admin'}{p.requested_at ? ` · ${stamp(p.requested_at)}` : ''} — {p.reason}</span>
        </div>
      ))}
      <details className="fr-rule__data">
        <summary>What it reads, and what is missing</summary>
        <p><b>Reads:</b> {rule.data_used}</p>
        <p><b>Missing:</b> {rule.data_missing}</p>
      </details>
    </article>
  );
}

export default function FraudRulesPage() {
  const access = useAdminAccess();
  const [data, setData] = useState<CountryRules[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ country: string; rule: RuleRow } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const may = canReadFraud(access);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData((await api.get<{ results: CountryRules[] }>('/fraud/admin/rules/')).results);
    } catch (err) {
      setData(null);
      setError(failure(err, 'The rules could not be loaded.'));
    }
  }, []);
  useEffect(() => { if (may) void load(); }, [load, may]);

  if (!canOpen(access, 'fraud') || !may) {
    return (<><PageHeader title="Fraud & Risk" /><NoFraudAccess /></>);
  }

  return (
    <>
      <PageHeader title="Fraud & Risk"
        subtitle="The detection rules and their numbers, per country. Rules only raise flags; they never act on an account or on money." />
      <FraudNav />
      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}
      {error ? (
        <ErrorState title="The rules could not be loaded" detail={error} onRetry={() => void load()} />
      ) : data === null ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the rules</span>
          <Skeleton kind="block" count={2} />
        </div>
      ) : data.length === 0 ? (
        <Empty title="No rules in your scope" detail="Rules are configured per country, and none is in a country you can see." />
      ) : data.map((c) => (
        <Panel key={c.country} title={`${c.country_name} (${c.country})`}>
          <div className="fr-rules">
            {c.rules.map((r) => (
              <RuleCard key={r.rule_key} country={c.country} rule={r} mayEdit={c.may_edit}
                onEdit={(rule) => setEditing({ country: c.country, rule })} />
            ))}
          </div>
        </Panel>
      ))}
      {editing && (
        <EditDrawer country={editing.country} rule={editing.rule} onClose={() => setEditing(null)}
          onDone={(m) => { setNotice(m); void load(); }} />
      )}
    </>
  );
}
