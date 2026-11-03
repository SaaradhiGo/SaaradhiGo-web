'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  LEVEL_WORDS, STATE_WORDS, canDraftPricing, capWords, draftBody, gridOf, isIncrease, noticeWords, pct,
  previewLines, previewSentence, ruleProblem, unconfiguredCells,
  type CountryConfig, type EarningsPreview, type Matrix, type MatrixRow, type Rule, type RuleDetail,
  type RuleDraft, type RuleStatus,
} from '@/lib/pricing';
import { interpretWrite } from '@/lib/trips';
import { PricingNav } from '@/components/console/pricing';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import {
  DataTable, Drawer, Empty, ErrorState, Fact, Facts, Skeleton,
} from '@/components/console/ui';

/**
 * Pricing: the commission matrix.
 *
 * ONE SOURCE. The matrix is the server's resolution (country default, then a
 * city override, then a vehicle-class override: the most specific active rule
 * wins) for every country x city x vehicle class in the operator's scope. A
 * draft is previewed against the last 30 days of completed trips, then sent as
 * a REQUEST that a different admin approves. Nothing here changes a rate by
 * itself, and nothing is retroactive: every trip keeps the rate it was booked at.
 */
type RulesPayload = { count: number; results: Rule[] };
type Notice = { text: string; kind: 'pending' | 'done' };

const RULE_TONE: Record<Rule['state'], ChipTone> = {
  draft: 'neutral', pending_approval: 'info', scheduled: 'info', live: 'good', superseded: 'neutral',
};
const RULE_STATUSES: Array<{ key: '' | RuleStatus; label: string }> = [
  { key: '', label: 'All' }, { key: 'active', label: 'Active' }, { key: 'pending_approval', label: 'Waiting for approval' },
  { key: 'draft', label: 'Draft' }, { key: 'archived', label: 'Archived' },
];

function PricingInner() {
  const access = useAdminAccess();
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [rules, setRules] = useState<RulesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [status, setStatus] = useState<'' | RuleStatus>('');
  const [openRule, setOpenRule] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingConfig, setEditingConfig] = useState<CountryConfig | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const may = canDraftPricing(access);

  const loadMatrix = useCallback(async () => {
    setError(null);
    try {
      setMatrix(await api.get<Matrix>(withScope('/pricing/admin/commission/matrix/')));
    } catch (err) {
      setMatrix(null);
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The commission rates could not be loaded.');
    }
  }, []);
  const loadRules = useCallback(async () => {
    setRulesError(null);
    setRules(null);
    try {
      setRules(await api.get<RulesPayload>(withScope(`/pricing/admin/commission/rules/${status ? `?status=${status}` : ''}`)));
    } catch (err) {
      setRules({ count: 0, results: [] });
      setRulesError(err instanceof ApiError && err.fromServer ? err.message : 'The commission rules could not be loaded.');
    }
  }, [status]);
  useEffect(() => { void loadMatrix(); }, [loadMatrix]);
  useEffect(() => { void loadRules(); }, [loadRules]);
  const load = () => { void loadMatrix(); void loadRules(); };

  const loading = matrix === null && !error;
  const done = (text: string, kind: Notice['kind']) => { setNotice({ text, kind }); load(); };

  const ruleColumns: ListColumn<Rule>[] = [
    {
      key: 'scope', label: 'Scope', primary: true,
      render: (r) => <>{r.country} {r.city_name ?? 'whole country'} · {r.vehicle_type_name ?? 'all classes'}</>,
    },
    { key: 'level', label: 'Layer', render: (r) => LEVEL_WORDS[r.level] },
    { key: 'pct', label: 'Rate', num: true, render: (r) => pct(r.percent) },
    { key: 'v', label: 'Version', num: true, render: (r) => `v${r.version}` },
    { key: 'state', label: 'Status', render: (r) => <StatusChip tone={RULE_TONE[r.state]}>{STATE_WORDS[r.state]}</StatusChip> },
    { key: 'from', label: 'Effective from', num: true, render: (r) => stamp(r.effective_from, timeZoneFor(r.city ?? r.country)) },
  ];
  const ruleRows = rules?.results ?? [];

  return (
    <>
      <PricingNav />
      {notice && (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-4' : 'alert-success mb-4'} role="status">
          <b>{notice.text}</b>
        </div>
      )}

      <header className="ops-list__head mb-3">
        <div>
          <h1>Commission</h1>
          <p>Each country&rsquo;s default, and only the cities that override it. A change is a request a second admin approves, and never reaches a trip already booked.</p>
        </div>
      </header>

      {loading ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the commission rates</span>
          <Skeleton kind="row" count={5} />
        </div>
      ) : error ? (
        <ErrorState title="The commission rates could not be loaded" detail={error} onRetry={() => void loadMatrix()} />
      ) : matrix && matrix.config.length === 0 ? (
        <Empty title="No countries in your scope" detail="Nothing is assigned to your account for pricing." />
      ) : matrix ? (
        <div className="grid gap-4">
          {matrix.config.map((cfg) => (
            <CountryPanel key={cfg.country} cfg={cfg} matrix={matrix}
              onCell={(row) => row.rule_id && setOpenRule(row.rule_id)}
              onDefault={(id) => setOpenRule(id)}
              onEditConfig={may ? () => setEditingConfig(cfg) : undefined} />
          ))}

          <section className="ops-card" aria-labelledby="pr-kinds">
            <header className="ops-card__head"><h2 id="pr-kinds">Rule types</h2></header>
            <ul className="ops-kinds m-0 p-0 list-none flex flex-wrap gap-3">
              {matrix.kinds.map((k) => (
                <li key={k.kind} className={k.supported ? '' : 'muted'}>
                  <b>kind: {k.kind}</b>{' '}
                  {k.supported ? <span>in use</span> : <span>{k.note ?? 'not supported yet'}</span>}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      <div className="mt-4">
        <ListPage<Rule>
          pageKey="pricing-rules"
          title="Rules and drafts"
          summary="Every commission rule, newest first. Open one for its history, its earnings preview and the next step."
          actionsSlot={may && matrix ? (
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setCreating(true)}>New draft…</button>
          ) : undefined}
          views={RULE_STATUSES.map((s) => ({ key: s.key, label: s.label, count: s.key === status ? rules?.count ?? null : undefined }))}
          view={status}
          onView={(v) => setStatus(v as '' | RuleStatus)}
          columns={ruleColumns}
          rows={ruleRows}
          rowKey={(r) => r.id}
          total={rules ? ruleRows.length : null}
          page={1}
          pageSize={Math.max(1, ruleRows.length)}
          onPage={() => undefined}
          onRow={(r) => setOpenRule(r.id)}
          activeKey={openRule}
          loading={rules === null}
          error={rulesError}
          empty={status ? 'No rules in this view.' : 'No commission rules yet. Without a rule, trips in this scope cannot be settled and a city cannot go live. Start a draft.'}
        />
      </div>

      {openRule !== null ? (
        <RuleDrawer ruleId={openRule} may={may} onClose={() => setOpenRule(null)}
          onDone={(text, kind) => { setOpenRule(null); done(text, kind); }} />
      ) : null}
      {creating && matrix ? (
        <NewDraftDrawer matrix={matrix} onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); load(); setOpenRule(id); }} />
      ) : null}
      {editingConfig ? (
        <ConfigDrawer cfg={editingConfig} onClose={() => setEditingConfig(null)}
          onDone={(text, kind) => { setEditingConfig(null); done(text, kind); }} />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// One country: its default, its cap and notice, and only the cities that override it
// ---------------------------------------------------------------------------

/** A city's own rule (or a gap) rather than the country's. */
const OWN = new Set(['city override', 'city + vehicle-class override']);
const overrides = (r: MatrixRow) => r.percent === null || OWN.has(r.source ?? '');

function CountryPanel({ cfg, matrix, onCell, onDefault, onEditConfig }: {
  cfg: CountryConfig; matrix: Matrix; onCell: (r: MatrixRow) => void; onDefault: (ruleId: number) => void;
  onEditConfig?: () => void;
}) {
  const [lookup, setLookup] = useState('');
  const grid = gridOf(matrix.rows, cfg.country);
  const def = matrix.country_defaults.find((d) => d.country === cfg.country)?.rule ?? null;
  const missing = unconfiguredCells(matrix.rows, cfg.country);
  const mine = matrix.rows.filter((r) => r.country === cfg.country);
  // The country's rate per class: what a city with no rule of its own gets.
  const countryCell = (vt: number) => mine.find((r) => r.vehicle_type === vt && r.percent !== null && !OWN.has(r.source ?? '')) ?? null;
  // A missing city rate is an exception only where the country HAS a rate for that class;
  // with no country rate at all the banner already says so, once (not once per city).
  const differs = (r: MatrixRow) => (r.percent === null ? countryCell(r.vehicle_type) !== null : overrides(r));
  const overriding = grid.cities.filter((c) => mine.some((r) => r.city === c.code && differs(r)));
  const shown = lookup && !overriding.some((c) => c.code === lookup)
    ? [...overriding, ...grid.cities.filter((c) => c.code === lookup)] : overriding;
  const inheriting = grid.cities.length - overriding.length;
  const tz = timeZoneFor(cfg.country);

  const cellView = (cell: MatrixRow | null, label: string, own: boolean) => {
    if (!cell || cell.percent === null) return <StatusChip tone="caution">No rule</StatusChip>;
    return (
      <button type="button" className="ops-linkbtn" onClick={() => onCell(cell)}
        title={`${cell.source ?? ''}, v${cell.version ?? ''} since ${stamp(cell.effective_from, tz)}${cell.next_change ? `; then ${pct(cell.next_change.percent)} on ${stamp(cell.next_change.effective_from, tz)}` : ''}`}
        aria-label={`${label}: ${pct(cell.percent)}, ${cell.source}, version ${cell.version}`}>
        {own ? <b>{pct(cell.percent)}</b> : <span className="muted">{pct(cell.percent)}</span>}
        {cell.next_change ? <span className="block text-xs">then {pct(cell.next_change.percent)}</span> : null}
      </button>
    );
  };

  return (
    <section className="ops-card" aria-labelledby={`pr-${cfg.country}`}>
      <header className="ops-card__head">
        <div>
          <h2 id={`pr-${cfg.country}`}>{cfg.country} · commission</h2>
          <p>
            Default {def ? <button type="button" className="ops-linkbtn" onClick={() => onDefault(def.id)}>{pct(def.percent)} · v{def.version}</button> : 'not set'}
            {' · '}maximum {cfg.max_percent === null ? capWords(cfg) : pct(cfg.max_percent)}
            {' · '}driver notice {noticeWords(cfg.notice_days)}
          </p>
        </div>
        {onEditConfig ? (
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={onEditConfig}>Cap and notice…</button>
        ) : null}
      </header>
      {!def ? (
        <div className="ops-note ops-note--warn" role="status">
          <b>No active commission rule for {cfg.country}.</b> Trips cannot be settled there and no city in it can
          go live until a country rule is approved.
        </div>
      ) : missing > 0 ? (
        <div className="ops-note ops-note--warn" role="status">
          <b>{missing} place and class pair{missing === 1 ? ' has' : 's have'} no rule.</b> They are listed below.
        </div>
      ) : null}

      {grid.classes.length === 0 ? (
        <p className="help m-0">No cities in {cfg.country} are in your scope yet. The country default applies to all of them.</p>
      ) : (
        <div className="ops-list__table">
          <table className="ops-table ops-table--compact ops-table--auto ops-matrix">
            <caption className="sr-only">Commission in {cfg.country}: the country rates and the cities that override them</caption>
            <thead>
              <tr>
                <th scope="col">Place</th>
                {grid.classes.map((c) => <th scope="col" key={c.id} className="num">{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">All of {cfg.country}</th>
                {grid.classes.map((c) => <td key={c.id} className="num">{cellView(countryCell(c.id), `${cfg.country}, ${c.name}`, true)}</td>)}
              </tr>
              {shown.map((city) => (
                <tr key={city.code}>
                  <th scope="row"><span className="ops-tree ops-tree--1">{city.name}</span></th>
                  {grid.classes.map((c) => {
                    const cell = grid.cell(city.code, c.id);
                    return <td key={c.id} className="num">{cellView(cell, `${city.name}, ${c.name}`, Boolean(cell && overrides(cell)))}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {grid.cities.length > 0 ? (
        <div className="ops-list__filters">
          <span className="muted">
            {inheriting > 0 ? `${inheriting} cit${inheriting === 1 ? 'y uses' : 'ies use'} the country rates.` : 'Every city has a rule of its own.'}
            {' '}A rate in bold is set for that place; grey is inherited.
          </span>
          <label className="sr-only" htmlFor={`pr-city-${cfg.country}`}>Look up a city</label>
          <select id={`pr-city-${cfg.country}`} className="ops-select ops-list__select" value={lookup} onChange={(e) => setLookup(e.target.value)}>
            <option value="">Look up a city…</option>
            {grid.cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// A rule: details, history, preview, and the next step
// ---------------------------------------------------------------------------

function RuleDrawer({ ruleId, may, onClose, onDone }: {
  ruleId: number; may: boolean; onClose: () => void; onDone: (text: string, kind: Notice['kind']) => void;
}) {
  const [detail, setDetail] = useState<RuleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<EarningsPreview | 'loading' | 'error' | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>({ percent: '', effectiveFrom: '', reason: '' });
  const [reason, setReason] = useState('');
  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await api.get<RuleDetail>(withScope(`/pricing/admin/commission/rules/${ruleId}/`));
      setDetail(d);
      setDraft({ percent: String(Number(d.rule.percent)), effectiveFrom: toLocalInput(d.rule.effective_from), reason: d.rule.reason });
      setReason(d.rule.reason);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That rule could not be loaded.');
    }
  }, [ruleId]);
  useEffect(() => { void load(); }, [load]);

  async function loadPreview() {
    setPreview('loading');
    try {
      setPreview(await api.get<EarningsPreview>(withScope(`/pricing/admin/commission/rules/${ruleId}/preview/`)));
    } catch {
      setPreview('error');
    }
  }

  async function submit() {
    if (!detail) return;
    if (reason.trim().length < 5) { setProblem('Say why, in a few words.'); return; }
    setBusy(true); setProblem(null);
    try {
      const body = await api.post<{ approval_request?: { id: number; status?: string } | null; state?: string }>(
        `/pricing/admin/commission/rules/${ruleId}/submit/`, { reason: reason.trim() });
      const result = interpretWrite(body as never, 'The commission rule is active.');
      onDone(result.message, result.kind);
    } catch (err) {
      setProblem(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!detail) return;
    const p = ruleProblem(draft, detail.config, { increase: false });
    if (p) { setProblem(p); return; }
    setBusy(true); setProblem(null);
    try {
      const body: Record<string, unknown> = { percent: draft.percent.trim(), reason: draft.reason.trim() };
      if (draft.effectiveFrom) body.effective_from = new Date(draft.effectiveFrom).toISOString();
      await api.patch(`/pricing/admin/commission/rules/${ruleId}/`, body);
      setEditing(false); setPreview(null);
      await load();
    } catch (err) {
      setProblem(err instanceof ApiError && err.fromServer ? err.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  }

  async function discard() {
    setBusy(true); setProblem(null);
    try {
      await api.delete(`/pricing/admin/commission/rules/${ruleId}/`);
      onDone('The draft was discarded.', 'done');
    } catch (err) {
      setProblem(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  const rule = detail?.rule;
  const isDraft = rule?.status === 'draft';
  return (
    <Drawer open wide onClose={onClose}
      title={rule ? `${rule.country} · ${rule.city_name ?? 'whole country'} · ${rule.vehicle_type_name ?? 'all classes'}` : 'Commission rule'}
      footer={isDraft && may ? (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void discard()} disabled={busy}>Discard draft</button>
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setEditing((e) => !e)} disabled={busy}>
            {editing ? 'Stop editing' : 'Edit draft'}
          </button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy || editing}>
            {busy ? 'Working…' : 'Submit for approval'}
          </button>
        </>
      ) : undefined}>
      {error ? <ErrorState title="That rule could not be loaded" detail={error} onRetry={() => void load()} />
        : !detail || !rule ? (
          <div className="ops-skel-rows" aria-busy="true"><span className="sr-only">Loading the rule</span><Skeleton kind="row" count={4} /></div>
        ) : (
          <div className="grid gap-5">
            <Facts>
              <Fact label="Rate">{pct(rule.percent)} <span className="muted">kind: {rule.kind}</span></Fact>
              <Fact label="State"><StatusChip tone={RULE_TONE[rule.state]}>{STATE_WORDS[rule.state]}</StatusChip></Fact>
              <Fact label="Layer">{LEVEL_WORDS[rule.level]}</Fact>
              <Fact label="Version">v{rule.version}</Fact>
              <Fact label="Effective from">{stamp(rule.effective_from)}{rule.effective_from_adjusted ? ' (moved to honour the notice period)' : ''}</Fact>
              <Fact label="Until">{rule.effective_to ? stamp(rule.effective_to) : 'until replaced'}</Fact>
              <Fact label="Asked by">{rule.created_by.label || '—'}</Fact>
              <Fact label="Why">{rule.reason || '—'}</Fact>
              {rule.approval_request_id ? <Fact label="Approval request">#{rule.approval_request_id}</Fact> : null}
            </Facts>

            {isDraft && editing ? (
              <section aria-label="Edit the draft" className="ops-form">
                <label className="ops-form__label" htmlFor="rule-pct">Rate (%)</label>
                <input id="rule-pct" className="input" inputMode="decimal" value={draft.percent}
                  onChange={(e) => setDraft({ ...draft, percent: e.target.value })} />
                <label className="ops-form__label" htmlFor="rule-from">Effective from (blank: as soon as allowed)</label>
                <input id="rule-from" className="input" type="datetime-local" value={draft.effectiveFrom}
                  onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} />
                <label className="ops-form__label" htmlFor="rule-why">Why</label>
                <textarea id="rule-why" className="input" rows={2} value={draft.reason}
                  onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
                <div><button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void saveEdit()} disabled={busy}>Save draft</button></div>
              </section>
            ) : null}

            {isDraft ? (
              <section aria-label="Driver earnings preview">
                <h3 className="ops-subhead">What this would change for drivers</h3>
                {preview === null ? (
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => void loadPreview()}>
                    Preview driver earnings
                  </button>
                ) : preview === 'loading' ? (
                  <div className="ops-skel-rows" aria-busy="true"><span className="sr-only">Working out the preview</span><Skeleton kind="row" count={2} /></div>
                ) : preview === 'error' ? (
                  <ErrorState title="The preview could not be worked out" onRetry={() => void loadPreview()} />
                ) : (
                  <PreviewView p={preview} />
                )}
              </section>
            ) : null}

            {isDraft && may && !editing ? (
              <section aria-label="Submit for approval" className="ops-form">
                <label className="ops-form__label" htmlFor="rule-submit-why">Why (kept in the audit log)</label>
                <textarea id="rule-submit-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                {isIncrease(
                  matrixCurrent(detail), rule.percent) ? (
                  <p className="help m-0">
                    This raises the rate, so it cannot take effect sooner than {detail.config.notice_days} days after
                    approval. Drivers are notified through the outbox; sending is not built yet.
                  </p>
                ) : <p className="help m-0">A decrease may take effect as soon as it is approved.</p>}
              </section>
            ) : null}

            {rule.status === 'pending_approval' ? (
              <div className="ops-confirm" role="status">
                <b>Waiting for a second admin</b>
                <span>Request #{rule.approval_request_id}. The rate stays as it is until a different admin approves it.</span>
              </div>
            ) : null}

            {problem ? <div className="alert-error" role="alert">{problem}</div> : null}

            <section aria-label="History">
              <h3 className="ops-subhead">History of this scope</h3>
              <DataTable caption="Versions of this rule" density="compact" maxHeight={false}
                rows={detail.history} rowKey={(h) => h.id}
                columns={[
                  { key: 'v', label: 'Version', width: '6rem', render: (h) => `v${h.version}` },
                  { key: 'p', label: 'Rate', num: true, render: (h) => pct(h.percent) },
                  { key: 's', label: 'State', render: (h) => <StatusChip tone={RULE_TONE[h.state]}>{STATE_WORDS[h.state]}</StatusChip> },
                  { key: 'f', label: 'From', render: (h) => stamp(h.effective_from) },
                  { key: 't', label: 'Until', render: (h) => (h.effective_to ? stamp(h.effective_to) : '—') },
                  { key: 'b', label: 'Asked by', hideBelow: 1100, render: (h) => h.created_by.label || '—' },
                  { key: 'w', label: 'Why', hideBelow: 1280, render: (h) => h.reason || '—' },
                ]} />
            </section>

            {detail.driver_notices.length > 0 ? (
              <section aria-label="Driver notices">
                <h3 className="ops-subhead">Driver notice</h3>
                <p className="help m-0">{detail.driver_notice_note}</p>
                <ul className="m-0 pl-5">
                  {detail.driver_notices.map((n) => (
                    <li key={n.id}>{pct(n.old_percent)} to {pct(n.new_percent)} from {stamp(n.effective_from)}: {n.status}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
    </Drawer>
  );
}

/** The rate in force for this rule's scope before it: the previous version, if any. */
function matrixCurrent(d: RuleDetail): string | null {
  const prev = d.history.filter((h) => h.id !== d.rule.id && h.status !== 'draft' && h.status !== 'pending_approval')
    .sort((a, b) => b.version - a.version)[0];
  return prev ? prev.percent : null;
}

function PreviewView({ p }: { p: EarningsPreview }) {
  const lines = previewLines(p);
  if (lines.length === 0) {
    return (
      <p className="help m-0">
        No completed, settled trips in this scope in the last {p.window_days} days, so there is nothing to compare.
        {p.increase ? ` This raises the rate: drivers need ${p.notice_days} days notice.` : ''}
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      {lines.map((l) => (
        <div key={l.currency} className="ops-confirm">
          <b>{l.currency}</b>
          <span>{previewSentence(l, p.window_days)}</span>
          <dl className="ops-facts">
            <div className="ops-fact"><dt>Trips affected</dt><dd>{l.trips}</dd></div>
            <div className="ops-fact"><dt>Drivers affected</dt><dd>{l.drivers}</dd></div>
            <div className="ops-fact"><dt>Average change in driver net</dt><dd>{l.average}</dd></div>
            <div className="ops-fact"><dt>Total change in driver net</dt><dd>{l.total}</dd></div>
          </dl>
        </div>
      ))}
      <p className="help m-0">{p.note}</p>
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// New draft
// ---------------------------------------------------------------------------

function NewDraftDrawer({ matrix, onClose, onCreated }: {
  matrix: Matrix; onClose: () => void; onCreated: (id: number) => void;
}) {
  const countries = matrix.config.map((c) => c.country);
  const [scope, setScope] = useState({ country: countries[0] ?? '', city: '', vehicleType: '' });
  const [draft, setDraft] = useState<RuleDraft>({ percent: '', effectiveFrom: '', reason: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cities = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of matrix.rows) if (r.country === scope.country) seen.set(r.city, r.city_name);
    return Array.from(seen, ([code, name]) => ({ code, name }));
  }, [matrix.rows, scope.country]);
  const cfg = matrix.config.find((c) => c.country === scope.country);
  const current = matrix.rows.find((r) => r.country === scope.country
    && (!scope.city || r.city === scope.city)
    && (!scope.vehicleType || String(r.vehicle_type) === scope.vehicleType))?.percent
    ?? matrix.country_defaults.find((d) => d.country === scope.country)?.rule?.percent ?? null;
  const problem = ruleProblem(draft, cfg, { increase: isIncrease(current, draft.percent) });

  async function create() {
    if (problem) return;
    setBusy(true); setError(null);
    try {
      const rule = await api.post<Rule>('/pricing/admin/commission/rules/', draftBody(scope, draft));
      onCreated(rule.id);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The draft could not be created.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open title="New commission draft" onClose={onClose}
      footer={(
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void create()} disabled={busy || problem !== null}>
            {busy ? 'Working…' : 'Create draft'}
          </button>
        </>
      )}>
      <div className="ops-form">
        <p className="help m-0">A draft changes nothing. You will preview what it does to driver earnings, then send it for approval.</p>
        <label className="ops-form__label" htmlFor="nd-country">Country</label>
        <select id="nd-country" className="input" value={scope.country}
          onChange={(e) => setScope({ country: e.target.value, city: '', vehicleType: scope.vehicleType })}>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <label className="ops-form__label" htmlFor="nd-city">City (blank: the whole country)</label>
        <select id="nd-city" className="input" value={scope.city} onChange={(e) => setScope({ ...scope, city: e.target.value })}>
          <option value="">Whole country</option>
          {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </select>
        <label className="ops-form__label" htmlFor="nd-vt">Vehicle class (blank: all classes)</label>
        <select id="nd-vt" className="input" value={scope.vehicleType} onChange={(e) => setScope({ ...scope, vehicleType: e.target.value })}>
          <option value="">All classes</option>
          {matrix.vehicle_types.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <label className="ops-form__label" htmlFor="nd-pct">Rate (%)</label>
        <input id="nd-pct" className="input" inputMode="decimal" value={draft.percent}
          onChange={(e) => setDraft({ ...draft, percent: e.target.value })} aria-describedby="nd-pct-help" />
        <p id="nd-pct-help" className="help m-0">
          Kind: percentage of the fare. A flat fee and a driver subscription are not supported yet.
          Now in force for this scope: {pct(current)}. {capWords(cfg)}.
        </p>
        <label className="ops-form__label" htmlFor="nd-from">Effective from (blank: as soon as allowed)</label>
        <input id="nd-from" className="input" type="datetime-local" value={draft.effectiveFrom}
          onChange={(e) => setDraft({ ...draft, effectiveFrom: e.target.value })} />
        {cfg && isIncrease(current, draft.percent) ? (
          <p className="help m-0">This raises the rate: not before {cfg.notice_days} days after it is approved.</p>
        ) : null}
        <label className="ops-form__label" htmlFor="nd-why">Why (kept in the audit log)</label>
        <textarea id="nd-why" className="input" rows={3} value={draft.reason}
          onChange={(e) => setDraft({ ...draft, reason: e.target.value })} />
        {problem && (draft.percent || draft.reason) ? <p className="help m-0" role="note">{problem}</p> : null}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Cap and notice
// ---------------------------------------------------------------------------

function ConfigDrawer({ cfg, onClose, onDone }: {
  cfg: CountryConfig; onClose: () => void; onDone: (text: string, kind: Notice['kind']) => void;
}) {
  const [notice, setNotice] = useState(String(cfg.notice_days));
  const [cap, setCap] = useState(cfg.max_percent === null ? '' : String(Number(cfg.max_percent)));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bad = !/^\d{1,3}$/.test(notice) ? 'Notice is a whole number of days.'
    : cap !== '' && !/^\d{1,3}(\.\d{1,2})?$/.test(cap) ? 'The cap is a percentage like 20 or 22.5.'
      : reason.trim().length < 5 ? 'Say why, in a few words.' : null;

  async function submit() {
    if (bad) return;
    setBusy(true); setError(null);
    try {
      const body = await api.put<{ approval_request?: { id: number; status?: string } | null; state?: string }>(
        `/pricing/admin/commission/config/${cfg.country}/`,
        { notice_days: Number(notice), ...(cap === '' ? { clear_cap: true } : { max_percent: cap }), reason: reason.trim() });
      const result = interpretWrite(body as never, 'The commission settings changed.');
      onDone(result.message, result.kind);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open title={`Cap and notice · ${cfg.country}`} onClose={onClose}
      footer={(
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy || bad !== null}>
            {busy ? 'Working…' : 'Send for approval'}
          </button>
        </>
      )}>
      <div className="ops-form">
        <label className="ops-form__label" htmlFor="cfg-notice">Driver notice for an increase (days)</label>
        <input id="cfg-notice" className="input" inputMode="numeric" value={notice} onChange={(e) => setNotice(e.target.value)} />
        <label className="ops-form__label" htmlFor="cfg-cap">Maximum commission (%), blank if not confirmed</label>
        <input id="cfg-cap" className="input" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} aria-describedby="cfg-cap-help" />
        <p id="cfg-cap-help" className="help m-0">
          Legal has not confirmed the aggregator commission cap for this country, so it can stay blank; activation
          is allowed meanwhile. Once set, any rule above it is refused.
        </p>
        <label className="ops-form__label" htmlFor="cfg-why">Why (kept in the audit log)</label>
        <textarea id="cfg-why" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        {bad && reason ? <p className="help m-0" role="note">{bad}</p> : null}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}

export default function PricingPage() {
  return <PricingInner />;
}
