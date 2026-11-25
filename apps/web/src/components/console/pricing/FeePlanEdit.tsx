'use client';

import { useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { stamp } from '@/lib/consoleTime';
import { classWord } from '@/lib/pricingWords';
import { interpretWrite } from '@/lib/trips';
import { DataTable, Drawer } from '@/components/console/ui';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { ChangePreview, type ChangeLine, type ImpactTable } from '@/components/console/edit/ChangePreview';

/**
 * Driver fee plans: the Edit pattern (owner, 25 Nov). Edit opens the values in force, highlights
 * what you change, previews driver take-home and SaaradhiGo revenue at 5, 12 and 20 trips a day per
 * class, shows the first day (7 days' notice when drivers pay more) and sends it for approval with
 * a reason. The plan in force stays until a second person approves.
 */
export type Decision = { status: string; by: string; at: string | null; reason: string; request_reason: string } | null;
export type FeePlan = {
  id: number; country: string; scope_code: string; currency: string; plan_type: string;
  amounts: Record<string, Record<string, number>>; earnings_floor_minor: number; daily_cap_minor: number | null;
  waiver_until: string | null; waiver_first_days: number | null; status: string; version: number;
  effective_from: string | null; effective_to: string | null; note: string; reason?: string;
  created_by?: string; created_at?: string | null; activated_at?: string | null;
  approval_request_id?: number | null; scope_name?: string; decision?: Decision;
};
type Impact = {
  changes: ChangeLine[];
  impact: { table: ImpactTable };
  start: { effective_from: string; increase: boolean; notice_days: number; today: string };
};

export const TYPE_WORDS: Record<string, string> = {
  daily_pass: 'Daily fee', percent_commission: 'Commission (% of each fare)', fair_share: 'Per-trip fee (Fair Share)',
  per_trip_fee: 'Per-trip fee',
};
/** A market's own classes (market rules): India Auto, Mini, Sedan, SUV; the US Standard and XL. */
export const MARKET_CLASSES: Record<string, string[]> = { IN: ['auto', 'hatchback', 'sedan', 'suv'], US: ['standard', 'xl'] };
const FIELDS_BY_TYPE: Record<string, string[]> = {
  daily_pass: ['daily_pass_minor', 'fee_free_after_trips'],
  percent_commission: ['commission_percent'],
  fair_share: ['per_trip_fee_minor', 'fee_free_after_trips'],
  per_trip_fee: ['per_trip_fee_minor', 'fee_free_after_trips'],
};
const MONEY = new Set(['per_trip_fee_minor', 'daily_pass_minor', 'rider_platform_fee_minor']);

const sym = (cur: string) => (cur === 'INR' ? '₹' : '$');
const major = (minor: number | null | undefined) => (minor == null ? '' : String(minor / 100));
const minor = (v: string) => (v.trim() === '' ? null : Math.round(Number(v) * 100));
/** Internal notes in plain words, rupees as ₹ ("Rs 10" -> "₹10"). */
export const plainNote = (s: string) => s.replace(/\bRs\.?\s?(?=\d)/g, '₹').replace(/\bINR\s?(?=\d)/g, '₹');

type Form = {
  plan_type: string; classes: Record<string, Record<string, string>>; floor: string; cap: string; waiver: string;
  note: string; from: string; reason: string;
};

function formOf(p: FeePlan): Form {
  const keys = Array.from(new Set([...Object.keys(p.amounts),
    ...(Object.keys(p.amounts).includes('*') ? [] : MARKET_CLASSES[p.country] ?? [])]));
  const classes: Form['classes'] = {};
  for (const c of keys) {
    const a = p.amounts[c] ?? {};
    classes[c] = Object.fromEntries(['per_trip_fee_minor', 'daily_pass_minor', 'fee_free_after_trips', 'commission_percent', 'rider_platform_fee_minor']
      .map((k) => [k, MONEY.has(k) ? major(a[k]) : a[k] == null ? '' : String(a[k])]));
  }
  return { plan_type: p.plan_type, classes, floor: major(p.earnings_floor_minor), cap: major(p.daily_cap_minor),
    waiver: p.waiver_first_days == null ? '' : String(p.waiver_first_days), note: plainNote(p.note || ''), from: '', reason: '' };
}

function bodyOf(f: Form) {
  const amounts: Record<string, Record<string, number | null>> = {};
  for (const [c, vals] of Object.entries(f.classes)) {
    const row: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(vals)) {
      if (v.trim() === '') continue;
      row[k] = MONEY.has(k) ? minor(v) : Number(v);
    }
    if (Object.keys(row).length) amounts[c] = row;
  }
  return { plan_type: f.plan_type, amounts, earnings_floor_minor: minor(f.floor) ?? 0, daily_cap_minor: minor(f.cap),
    waiver_first_days: f.waiver.trim() ? Number(f.waiver) : null, note: f.note,
    ...(f.from ? { effective_from: f.from } : {}) };
}

const FIELD_WORDS: Record<string, (cur: string) => string> = {
  per_trip_fee_minor: (c) => `Fee a trip (${sym(c)})`, daily_pass_minor: (c) => `Daily fee (${sym(c)})`,
  fee_free_after_trips: () => 'Free after (trips a day)', commission_percent: () => 'Commission %',
  rider_platform_fee_minor: (c) => `Rider booking fee (${sym(c)})`,
};

export function FeePlanEditDrawer({ plan, onClose, onDone }: {
  plan: FeePlan; onClose: () => void; onDone: (text: string) => void;
}) {
  const start = useMemo(() => formOf(plan), [plan]);
  const [f, setF] = useState<Form>(start);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cur = plan.currency;
  const fields = [...(FIELDS_BY_TYPE[f.plan_type] ?? []), 'rider_platform_fee_minor'];
  const changed = (a: string, b: string) => a.trim() !== b.trim();
  const body = useMemo(() => bodyOf(f), [f]);

  // The preview follows the form (debounced): changes, impact and the first day.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setPreviewError(null);
      api.post<Impact>(`/pricing/admin/fee-plans/${plan.id}/impact/`, body)
        .then((r) => setImpact(r))
        .catch((err) => { setImpact(null); setPreviewError(err instanceof ApiError && err.fromServer ? err.message : 'The preview could not be worked out.'); });
    }, 400);
    return () => window.clearTimeout(t);
  }, [body, plan.id]);

  const nothing = impact !== null && impact.changes.length === 0;
  async function send() {
    setBusy(true); setError(null);
    try {
      const r = await api.post(`/pricing/admin/fee-plans/${plan.id}/edit/`, { ...body, reason: f.reason.trim() });
      onDone(interpretWrite(r as never, 'Sent for approval.').message);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally { setBusy(false); }
  }
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const setCls = (c: string, k: string, v: string) => setF((x) => ({ ...x, classes: { ...x.classes, [c]: { ...x.classes[c], [k]: v } } }));
  const where = plan.scope_name ?? plan.scope_code ?? plan.country;

  return (
    <Drawer open wide onClose={onClose} title={`Edit driver fee plan · ${where}`}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()}
          disabled={busy || nothing || !!previewError || f.reason.trim().length < 5}>{busy ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      <div className="grid gap-5">
        <p className="help m-0">
          {plan.status === 'draft' ? `Draft v${plan.version}, sent back or withdrawn. ` : `v${plan.version} is in force and stays in force until a second person approves this change. `}
          Changed values are highlighted.
        </p>
        <section className="ops-form" aria-label="Values">
          <div className={changed(f.plan_type, start.plan_type) ? 'ops-field is-changed' : 'ops-field'}>
            <label className="ops-form__label" htmlFor="fe-type">Plan type</label>
            <select id="fe-type" className="input" value={f.plan_type} onChange={(e) => set({ plan_type: e.target.value })}>
              {Object.entries(TYPE_WORDS).filter(([k]) => k !== 'per_trip_fee' || plan.plan_type === 'per_trip_fee')
                .map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="ops-table-wrap">
            <table className="ops-table ops-table--compact ops-table--auto ops-edit-grid">
              <caption className="sr-only">Amounts per class</caption>
              <thead><tr><th scope="col">Class</th>{fields.map((k) => <th key={k} scope="col">{FIELD_WORDS[k](cur)}</th>)}</tr></thead>
              <tbody>
                {Object.keys(f.classes).map((c) => (
                  <tr key={c}>
                    <th scope="row">{c === '*' ? 'Every other class' : classWord(c)}</th>
                    {fields.map((k) => {
                      const was = start.classes[c]?.[k] ?? '';
                      const id = `fe-${c}-${k}`;
                      return (
                        <td key={k} className={changed(f.classes[c][k] ?? '', was) ? 'is-changed' : undefined}>
                          <label className="sr-only" htmlFor={id}>{`${c === '*' ? 'Every other class' : classWord(c)}: ${FIELD_WORDS[k](cur)}`}</label>
                          <input id={id} className="input" inputMode="decimal" value={f.classes[c][k] ?? ''}
                            placeholder="not set" onChange={(e) => setCls(c, k, e.target.value)} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {([['floor', `Earnings floor a day (${sym(cur)}, 0 = off)`], ['cap', `Daily cap (${sym(cur)}, blank = none)`],
              ['waiver', 'New drivers free for (days)']] as const).map(([k, label]) => (
              <div key={k} className={changed(f[k], start[k]) ? 'ops-field is-changed' : 'ops-field'}>
                <label className="ops-form__label" htmlFor={`fe-${k}`}>{label}</label>
                <input id={`fe-${k}`} className="input" inputMode="decimal" value={f[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<Form>)} />
              </div>
            ))}
          </div>
          <div className={changed(f.note, start.note) ? 'ops-field is-changed' : 'ops-field'}>
            <label className="ops-form__label" htmlFor="fe-note">Internal note (shown in the plan’s history, not to drivers)</label>
            <input id="fe-note" className="input" value={f.note} onChange={(e) => set({ note: e.target.value })} />
          </div>
        </section>

        <section aria-label="Preview">
          {previewError ? <div className="alert-error" role="alert">{previewError}</div>
            : impact ? <ChangePreview display={{ changes: impact.changes, impact: impact.impact.table }} />
              : <p className="help m-0" aria-busy="true">Working out the impact…</p>}
        </section>

        <section className="ops-form" aria-label="When and why">
          <label className="ops-form__label" htmlFor="fe-from">Starts on (local day)</label>
          <input id="fe-from" className="input" type="date" value={f.from || impact?.start.effective_from || ''}
            onChange={(e) => set({ from: e.target.value })} />
          {impact ? (
            <p className={impact.start.increase ? 'ops-note ops-note--warn m-0' : 'help m-0'} role="note">
              {impact.start.increase
                ? <><b>Drivers pay more:</b> they are told {impact.start.notice_days} days ahead, so the earliest start is {impact.start.effective_from}.</>
                : <>It starts on the next local day, {impact.start.effective_from}, unless you choose a later day.</>}
            </p>
          ) : null}
          <label className="ops-form__label" htmlFor="fe-why">Why (the approver and the history see it)</label>
          <textarea id="fe-why" className="input" rows={2} value={f.reason} onChange={(e) => set({ reason: e.target.value })} />
          {nothing ? <p className="help m-0" role="note">Nothing differs from the plan in force.</p> : null}
          {error ? <div className="alert-error" role="alert">{error}</div> : null}
        </section>
      </div>
    </Drawer>
  );
}

const DECISION_WORDS: Record<string, string> = {
  requested: 'Waiting for approval', executed: 'Approved', approved: 'Approved', rejected: 'Rejected',
  returned: 'Sent back', cancelled: 'Withdrawn', expired: 'Expired', failed: 'Approved, but it failed',
};

/** One place's plan: its values, internal note and version history (who, when, why). */
export function FeePlanPanel({ plan, versions, onClose, onEdit, onWithdraw, may }: {
  plan: FeePlan; versions: FeePlan[]; onClose: () => void; onEdit: () => void; onWithdraw: () => void; may: boolean;
}) {
  return (
    <Drawer open wide onClose={onClose} title={`Driver fee plan · ${plan.scope_name ?? plan.scope_code ?? plan.country}`}
      footer={may ? (
        <>
          {plan.status === 'pending_approval' ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onWithdraw}>Withdraw</button> : null}
          {plan.status === 'active' || plan.status === 'draft'
            ? <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onEdit}>Edit</button> : null}
        </>
      ) : undefined}>
      <div className="grid gap-5">
        {plan.note ? <p className="ops-note m-0"><b>Internal note:</b> {plainNote(plan.note)}</p> : null}
        <section aria-label="Version history">
          <h3 className="ops-subhead">Version history</h3>
          <DataTable caption="Versions of this plan" density="compact" maxHeight={false} wrap rows={versions} rowKey={(v) => v.id}
            columns={[
              { key: 'v', label: 'Version', render: (v) => `v${v.version}` },
              { key: 's', label: 'Status', render: (v) => <StatusChip tone={v.status === 'active' ? 'good' : v.status === 'pending_approval' ? 'info' : 'neutral'}>
                {({ draft: 'Draft', pending_approval: 'Waiting for approval', active: 'In force', archived: 'Ended' } as Record<string, string>)[v.status] ?? v.status}</StatusChip> },
              { key: 'who', label: 'Changed by', render: (v) => `${v.created_by || '—'}${v.created_at ? ` · ${stamp(v.created_at)}` : ''}` },
              { key: 'why', label: 'Why', render: (v) => v.decision?.request_reason || v.reason || '—' },
              { key: 'd', label: 'Decision', render: (v) => (v.decision
                ? `${DECISION_WORDS[v.decision.status] ?? v.decision.status}${v.decision.by ? ` by ${v.decision.by}` : ''}${v.decision.at ? ` · ${stamp(v.decision.at)}` : ''}${v.decision.reason ? `: ${v.decision.reason}` : ''}`
                : '—') },
              { key: 'from', label: 'In force', render: (v) => (v.effective_from ? `${v.effective_from}${v.effective_to ? ` to ${v.effective_to}` : ''}` : '—') },
              { key: 'note', label: 'Note', render: (v) => (v.note ? plainNote(v.note) : '—') },
            ]} />
        </section>
      </div>
    </Drawer>
  );
}
