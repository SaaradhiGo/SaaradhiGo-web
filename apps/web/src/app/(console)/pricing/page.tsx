'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import {
  LEVEL_WORDS, STATE_WORDS, canDraftPricing, capWords, draftBody, gridOf, isIncrease, noticeWords, pct,
  previewLines, previewSentence, ruleProblem, unconfiguredCells,
  type CountryConfig, type EarningsPreview, type Matrix, type MatrixRow, type Rule, type RuleDetail,
  type RuleDraft,
} from '@/lib/pricing';
import { interpretWrite } from '@/lib/trips';
import { PricingNav } from '@/components/console/pricing';
import {
  DataTable, Drawer, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton, TableToolbar,
  type PillTone,
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

const TONE: Record<Rule['state'], PillTone> = {
  draft: 'neutral', pending_approval: 'wait', scheduled: 'wait', live: 'good', superseded: 'neutral',
};

function PricingInner() {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const [matrix, setMatrix] = useState<Matrix | null>(null);
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openRule, setOpenRule] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingConfig, setEditingConfig] = useState<CountryConfig | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const may = canDraftPricing(access);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [m, r] = await Promise.all([
        api.get<Matrix>(withScope('/pricing/admin/commission/matrix/')),
        api.get<RulesPayload>(withScope('/pricing/admin/commission/rules/')),
      ]);
      setMatrix(m);
      setRules(r.results);
    } catch (err) {
      setMatrix(null);
      setRules([]);
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The commission rates could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const loading = matrix === null && !error;
  const done = (text: string, kind: Notice['kind']) => { setNotice({ text, kind }); void load(); };

  const ruleColumns = useMemo(() => [
    { key: 'scope', label: 'Scope', sortValue: (r: Rule) => `${r.country} ${r.city ?? ''} ${r.vehicle_type_name ?? ''}`,
      render: (r: Rule) => <><b>{r.country}</b> {r.city_name ?? 'whole country'} · {r.vehicle_type_name ?? 'all classes'}</> },
    { key: 'level', label: 'Layer', hideBelow: 1100 as const, render: (r: Rule) => LEVEL_WORDS[r.level] },
    { key: 'pct', label: 'Rate', num: true, width: '6rem', sortValue: (r: Rule) => Number(r.percent), render: (r: Rule) => pct(r.percent) },
    { key: 'v', label: 'Version', num: true, width: '6rem', render: (r: Rule) => `v${r.version}` },
    { key: 'state', label: 'State', width: '12rem', sortValue: (r: Rule) => r.state,
      render: (r: Rule) => <Pill tone={TONE[r.state]}>{STATE_WORDS[r.state]}</Pill> },
    { key: 'from', label: 'Effective from', width: '9rem', sortValue: (r: Rule) => r.effective_from, render: (r: Rule) => stamp(r.effective_from) },
  ], []);

  return (
    <>
      <PageHeader title="Pricing"
        subtitle="Commission by country, city and vehicle class. A change is a request a second admin approves, and never reaches a trip already booked." />
      <PricingNav />
      {notice && (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-4' : 'alert-success mb-4'} role="status">
          <b>{notice.text}</b>
        </div>
      )}

      {loading ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the commission rates</span>
          <Skeleton kind="row" count={5} />
        </div>
      ) : error ? (
        <ErrorState title="The commission rates could not be loaded" detail={error} onRetry={() => void load()} />
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

          <Panel title="Rule types">
            <ul className="ops-kinds m-0 p-0 list-none flex flex-wrap gap-3">
              {matrix.kinds.map((k) => (
                <li key={k.kind} className={k.supported ? '' : 'muted'}>
                  <b>kind: {k.kind}</b>{' '}
                  {k.supported ? <span>in use</span> : <span>{k.note ?? 'not supported yet'}</span>}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Rules and drafts" flush
            action={may ? (
              <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setCreating(true)}>
                New draft…
              </button>
            ) : undefined}>
            <TableToolbar summary={rules ? `${rules.length} rule${rules.length === 1 ? '' : 's'}` : null}
              density={density} onDensity={setDensity} />
            {rules && rules.length === 0 ? (
              <Empty title="No commission rules yet"
                detail="Without a rule, trips in this scope cannot be settled and a city cannot go live. Start a draft." />
            ) : rules ? (
              <DataTable caption="Commission rules" rows={rules} columns={ruleColumns} rowKey={(r) => r.id}
                density={density} onRow={(r) => setOpenRule(r.id)} selectedKey={openRule}
                defaultSort={{ key: 'from', dir: 'desc' }} maxHeight={false} />
            ) : null}
          </Panel>
        </div>
      ) : null}

      {openRule !== null ? (
        <RuleDrawer ruleId={openRule} may={may} onClose={() => setOpenRule(null)}
          onDone={(text, kind) => { setOpenRule(null); done(text, kind); }} />
      ) : null}
      {creating && matrix ? (
        <NewDraftDrawer matrix={matrix} onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); void load(); setOpenRule(id); }} />
      ) : null}
      {editingConfig ? (
        <ConfigDrawer cfg={editingConfig} onClose={() => setEditingConfig(null)}
          onDone={(text, kind) => { setEditingConfig(null); done(text, kind); }} />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// One country: its default, its cap and notice, and the grid
// ---------------------------------------------------------------------------

function CountryPanel({ cfg, matrix, onCell, onDefault, onEditConfig }: {
  cfg: CountryConfig; matrix: Matrix; onCell: (r: MatrixRow) => void; onDefault: (ruleId: number) => void;
  onEditConfig?: () => void;
}) {
  const grid = gridOf(matrix.rows, cfg.country);
  const def = matrix.country_defaults.find((d) => d.country === cfg.country)?.rule ?? null;
  const missing = unconfiguredCells(matrix.rows, cfg.country);
  return (
    <Panel title={`${cfg.country} · commission`} action={onEditConfig ? (
      <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={onEditConfig}>
        Cap and notice…
      </button>
    ) : undefined}>
      <Facts>
        <Fact label="Country default">
          {def ? (
            <button type="button" className="ops-linkbtn" onClick={() => onDefault(def.id)}>
              {pct(def.percent)} · v{def.version}
            </button>
          ) : <Pill tone="bad">No rule</Pill>}
        </Fact>
        <Fact label="Maximum allowed">{cfg.max_percent === null ? <span className="muted">{capWords(cfg)}</span> : pct(cfg.max_percent)}</Fact>
        <Fact label="Driver notice">{noticeWords(cfg.notice_days)}</Fact>
      </Facts>
      {!def ? (
        <div className="ops-note ops-note--warn mt-3" role="status">
          <b>No active commission rule for {cfg.country}.</b> Trips cannot be settled there and no city in it can
          go live until a country rule is approved.
        </div>
      ) : missing > 0 ? (
        <div className="ops-note ops-note--warn mt-3" role="status">
          <b>{missing} cell{missing === 1 ? '' : 's'} below have no rule.</b>
        </div>
      ) : null}

      {grid.cities.length === 0 ? (
        <p className="help mt-3 mb-0">No cities in {cfg.country} are in your scope yet, so there is no grid to show. The country default above applies to all of them.</p>
      ) : (
        <div className="ops-table-wrap mt-3">
          <table className="ops-table ops-table--compact ops-table--auto">
            <caption className="sr-only">Effective commission by city and vehicle class in {cfg.country}</caption>
            <thead>
              <tr>
                <th scope="col">City</th>
                {grid.classes.map((c) => <th scope="col" key={c.id} className="num">{c.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.cities.map((city) => (
                <tr key={city.code}>
                  <th scope="row">{city.name}</th>
                  {grid.classes.map((c) => {
                    const cell = grid.cell(city.code, c.id);
                    return (
                      <td key={c.id} className="num">
                        {cell && cell.percent !== null ? (
                          <button type="button" className="ops-linkbtn" onClick={() => onCell(cell)}
                            aria-label={`${city.name}, ${c.name}: ${pct(cell.percent)}, ${cell.source}, version ${cell.version}`}>
                            <b>{pct(cell.percent)}</b>
                          </button>
                        ) : <Pill tone="bad">none</Pill>}
                        {cell && cell.percent !== null ? (
                          <span className="block muted text-xs">
                            {cell.source}<br />v{cell.version} · since {stamp(cell.effective_from)}
                          </span>
                        ) : null}
                        {cell?.next_change ? (
                          <span className="block text-xs">
                            then {pct(cell.next_change.percent)} on {stamp(cell.next_change.effective_from)}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
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
              <Fact label="State"><Pill tone={TONE[rule.state]}>{STATE_WORDS[rule.state]}</Pill></Fact>
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
                  { key: 's', label: 'State', render: (h) => <Pill tone={TONE[h.state]}>{STATE_WORDS[h.state]}</Pill> },
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
