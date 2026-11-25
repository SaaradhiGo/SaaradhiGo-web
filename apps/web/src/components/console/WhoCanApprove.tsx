'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { can, useAdminAccess } from '@/lib/adminScope';
import { plural } from '@/components/console/kit/ListPage';
import { Drawer } from '@/components/console/ui';
import { formatMinor, interpretWrite } from '@/lib/trips';
import { ChangePreview } from '@/components/console/edit/ChangePreview';
import { usePreview } from '@/components/console/edit/usePreview';

/** 25 Nov (owner): who can approve what. A checker's role holds approval.check and the action's own
 *  capability, in the request's place; the maker can never check their own request. Each country's
 *  limit (a refund up to ₹X needs no second person) has Edit, through a second person too. */
type Checker = { role: string; name: string; people: number };
type Action = { key: string; description: string; capability: string; always_checker: boolean; checkers?: Checker[] };
type Policy = {
  id: number; country: string; action_key: string; limit_kind: 'money' | 'count' | 'always'; currency: string;
  maker_limit: number | null; maker_daily_limit: number | null; cumulative_per_target: boolean; version: number;
};

const COUNTRY: Record<string, string> = { IN: 'India', US: 'United States' };

export function limitWords(p: Policy): string {
  if (p.limit_kind === 'always' || p.maker_limit === null) return 'always a second person';
  if (p.limit_kind === 'count') return `a second person above ${p.maker_limit}`;
  return `a second person above ${formatMinor(p.maker_limit, p.currency)}`;
}

export function WhoCanApprove() {
  const access = useAdminAccess();
  const mayEdit = can(access, 'platform.settings');
  const [actions, setActions] = useState<Action[] | null>(null);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(force = false) {
    if (actions && !force) return;
    try {
      const d = await api.get<{ actions: Action[]; policies: Policy[] }>('/approvals/admin/policies/');
      setActions(d.actions);
      setPolicies(d.policies ?? []);
    } catch (e) {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'This list could not be loaded.');
    }
  }

  return (
    <details className="ops-card" onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) void load(); }}>
      <summary><b>Who can approve what</b></summary>
      <p className="ops-prose">A request is checked by someone else whose role may approve and may do the action itself, in that place.</p>
      {notice ? <div className="ops-confirm" role="status"><b>{notice}</b></div> : null}
      {error ? <div className="alert-error" role="alert">{error}</div> : null}
      {actions ? (
        <ul className="ops-list-plain" aria-label="Who can approve each action">
          {actions.map((a) => (
            <li key={a.key}>
              <b>{a.description}</b>
              {a.always_checker ? <span className="muted"> · always needs a second person</span> : null}
              <div className="help">
                {a.checkers && a.checkers.length
                  ? a.checkers.map((c) => `${c.name} (${plural(c.people, 'person', 'people')})`).join(', ')
                  : 'Super Admin only'}
              </div>
              {policies.filter((p) => p.action_key === a.key).map((p) => (
                <div key={p.id} className="ops-row-actions">
                  <span className="help">{COUNTRY[p.country] ?? p.country}: {limitWords(p)}</span>
                  {mayEdit && p.limit_kind !== 'always' ? (
                    <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setEditing(p)}
                      aria-label={`Edit the limit for ${a.description} in ${COUNTRY[p.country] ?? p.country}`}>Edit</button>
                  ) : null}
                </div>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? <LimitDrawer policy={editing} title={actions?.find((a) => a.key === editing.action_key)?.description ?? editing.action_key}
        onClose={() => setEditing(null)}
        onDone={(t) => { setEditing(null); setNotice(t); void load(true); }} /> : null}
    </details>
  );
}

const major = (minor: number | null) => (minor === null ? '' : String(minor / 100));
const toMinor = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100));

function LimitDrawer({ policy, title, onClose, onDone }: { policy: Policy; title: string; onClose: () => void; onDone: (t: string) => void }) {
  const money = policy.limit_kind === 'money';
  const [limit, setLimit] = useState(money ? major(policy.maker_limit) : String(policy.maker_limit ?? ''));
  const [daily, setDaily] = useState(major(policy.maker_daily_limit));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const body = {
    country: policy.country, action_key: policy.action_key, limit_kind: policy.limit_kind, currency: policy.currency,
    maker_limit: money ? toMinor(limit) : (limit.trim() === '' ? null : Number(limit)),
    maker_daily_limit: money ? toMinor(daily) : null, cumulative_per_target: policy.cumulative_per_target,
  };
  const changed = body.maker_limit !== policy.maker_limit || body.maker_daily_limit !== policy.maker_daily_limit;
  const shown = usePreview(changed ? '/approvals/admin/policies/preview/' : null, body);
  async function send() {
    setBusy(true); setError(null);
    try {
      const r = await api.post('/approvals/admin/policies/change/', { ...body, reason: reason.trim() });
      onDone(interpretWrite(r as never, 'Sent for approval.').message);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally { setBusy(false); }
  }
  const sym = policy.currency === 'USD' ? '$' : '₹';
  return (
    <Drawer open title={`Edit limit · ${title} · ${COUNTRY[policy.country] ?? policy.country}`} onClose={onClose}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()}
          disabled={busy || !changed || reason.trim().length < 5}>{busy ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      <div className="ops-form">
        <p className="help m-0">The limit in force stays until a second person approves. Changed values are highlighted.</p>
        <div className={body.maker_limit !== policy.maker_limit ? 'ops-field is-changed' : 'ops-field'}>
          <label className="ops-form__label" htmlFor="lim-one">{money ? `One person may approve up to (${sym})` : 'One person may approve up to (records)'}</label>
          <input id="lim-one" className="input" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        {money ? (
          <div className={body.maker_daily_limit !== policy.maker_daily_limit ? 'ops-field is-changed' : 'ops-field'}>
            <label className="ops-form__label" htmlFor="lim-day">A day, per person ({sym}, blank = no daily limit)</label>
            <input id="lim-day" className="input" inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value)} />
          </div>
        ) : null}
        {shown.display ? <ChangePreview display={shown.display} /> : shown.error ? <div className="alert-error" role="alert">{shown.error}</div> : null}
        <label className="ops-form__label" htmlFor="lim-why">Why (the approver and the history see it)</label>
        <textarea id="lim-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}
