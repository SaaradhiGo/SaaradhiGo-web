'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { RECON_KIND_LABEL, canResolve, cityName } from '@/lib/finance';
import { PageLink } from '@/components/console/PageLink';
import { FinanceNav } from '@/components/console/finance';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { History, RecordPanel } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { Fact, Facts, Skeleton } from '@/components/console/ui';

/**
 * Reconciliation: where our own records disagree with each other. The
 * exceptions come first; the runs that found them sit underneath.
 *
 * LOCAL DATA ONLY. The daily run compares payments with the webhooks we
 * stored, trips with their settlements, settlements with the final fare, and
 * payouts with their webhooks and with how long they have sat in processing.
 * It never calls a gateway, and a gateway statement import is not connected:
 * the page says so rather than implying a check that does not exist.
 *
 * Resolving a finding needs a note and `finance.adjust`. It records that a
 * person looked; it moves no money.
 */
type Run = {
  id: number; date: string; country: string; currency: string; gateway: string; status: string;
  new_findings: Record<string, number>; open_items: number; checks: Record<string, string | number>;
  finished_at: string | null; error: string;
};
type Item = {
  id: number; run_id: number; kind: string; kind_label: string; country: string; currency: string;
  city: { code: string; name: string } | null;
  payment_id: number | null; withdrawal_id: number | null; trip_id: number | null;
  reference: string | null; expected: string; seen: string;
  created_at: string; resolved_at: string | null; resolved_by_label: string; resolution_note: string;
};
type Overview = {
  count: number; page: number; total_pages: number; results: Run[];
  statement_import: { connected: boolean; message: string | null };
  kinds: Array<{ key: string; label: string }>;
  open_by_kind: Record<string, number>;
  open_total: number;
  stuck_payout_check: Array<{ country: string; configured: boolean; stuck_payout_hours: number | null }>;
};
type ItemPage = { count: number; page: number; page_size?: number; total_pages: number; results: Item[] };

const STATES = [['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']] as const;

function FindingChip({ item }: { item: { resolved_at: string | null } }) {
  return item.resolved_at ? <StatusChip tone="good">Resolved</StatusChip> : <StatusChip tone="caution">Open</StatusChip>;
}

function RunChip({ status }: { status: string }) {
  if (status === 'ok') return <StatusChip tone="good">No findings</StatusChip>;
  if (status === 'issues') return <StatusChip tone="caution">Findings</StatusChip>;
  return <StatusChip tone="critical">Failed</StatusChip>;
}

function ReconciliationInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const state = (search.get('state') || 'open') as 'open' | 'resolved' | 'all';
  const kind = search.get('kind') || '';
  const page = Math.max(1, Number(search.get('page')) || 1);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [items, setItems] = useState<ItemPage | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Item | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    setOverview(null);
    setOverviewError(null);
    try {
      setOverview(await api.get<Overview>(withScope('/payments/admin/reconciliation/')));
    } catch (err) {
      setOverviewError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load reconciliation.');
    }
  }, []);

  const loadItems = useCallback(async () => {
    setItems(null);
    setItemsError(null);
    const q = new URLSearchParams({ state });
    if (kind) q.set('kind', kind);
    if (page > 1) q.set('page', String(page));
    try {
      setItems(await api.get<ItemPage>(withScope(`/payments/admin/reconciliation/items/?${q}`)));
    } catch (err) {
      setItemsError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the findings.');
    }
  }, [state, kind, page]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => { void loadItems(); }, [loadItems]);

  const queryFor = (s: string, k: string, p = 1) => {
    const q = new URLSearchParams();
    if (s !== 'open') q.set('state', s);
    if (k) q.set('kind', k);
    if (p > 1) q.set('page', String(p));
    return q.toString();
  };
  const go = (patch: { state?: string; kind?: string; page?: number }) => {
    const q = queryFor(patch.state ?? state, patch.kind ?? kind, patch.page ?? 1);
    router.push(`/finance/reconciliation${q ? `?${q}` : ''}`);
  };

  async function resolve() {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/payments/admin/reconciliation/items/${selected.id}/resolve/`, { note: note.trim() });
      setNotice('Finding resolved. Your note is on the record.');
      setSelected(null);
      setNote('');
      await Promise.all([loadItems(), loadOverview()]);
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer ? err.message : 'The finding could not be resolved.');
    } finally {
      setBusy(false);
    }
  }

  const columns: ListColumn<Item>[] = [
    { key: 'kind', label: 'Finding', primary: true, render: (i) => i.kind_label },
    { key: 'city', label: 'City', render: (i) => cityName(i.city) },
    { key: 'ccy', label: 'Currency', render: (i) => i.currency },
    { key: 'expected', label: 'Expected', render: (i) => i.expected || '—' },
    { key: 'seen', label: 'Seen', render: (i) => i.seen || '—' },
    { key: 'state', label: 'State', render: (i) => <FindingChip item={i} /> },
    { key: 'when', label: 'Raised', num: true, render: (i) => stamp(i.created_at, timeZoneFor(i.city?.code)) },
  ];

  const mayResolve = canResolve(access);
  const unconfigured = overview?.stuck_payout_check.filter((c) => !c.configured) ?? [];
  const views = STATES.map(([v, label]) => ({
    key: v,
    label,
    count: v === 'open' && overview ? overview.open_total : v === state ? items?.count ?? null : undefined,
  }));
  const chips = kind ? [{ key: 'kind', label: RECON_KIND_LABEL[kind] ?? kind, onRemove: () => go({ kind: '', page: 1 }) }] : [];
  const kinds = overview?.kinds ?? Object.entries(RECON_KIND_LABEL).map(([key, label]) => ({ key, label }));
  const pageSize = items?.page_size
    ?? (items && items.total_pages > 1 ? Math.ceil(items.count / items.total_pages) : Math.max(1, items?.results.length ?? 25));
  const savedQ = queryFor(state, kind);
  const tz = selected ? timeZoneFor(selected.city?.code) : undefined;

  return (
    <>
      <FinanceNav />
      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}

      <div className={selected ? 'ops-split' : undefined}>
        <ListPage<Item>
          pageKey="finance-reconciliation"
          title="Reconciliation"
          summary="Where our own records disagree with each other. Local data only."
          views={views}
          view={state}
          onView={(v) => go({ state: v, page: 1 })}
          chips={chips}
          filterSlot={(
            <>
              <label className="sr-only" htmlFor="recon-kind">Kind of finding</label>
              <select id="recon-kind" className="ops-select ops-list__select" value={kind}
                onChange={(e) => go({ kind: e.target.value, page: 1 })}>
                <option value="">Every kind of finding</option>
                {kinds.map((k) => (
                  <option key={k.key} value={k.key}>
                    {k.label}{overview?.open_by_kind[k.key] ? ` (${overview.open_by_kind[k.key]} open)` : ''}
                  </option>
                ))}
              </select>
            </>
          )}
          columns={columns}
          rows={items?.results ?? []}
          rowKey={(i) => i.id}
          total={items ? items.count : null}
          page={items?.page ?? page}
          pageSize={pageSize}
          onPage={(p) => go({ page: p })}
          onRow={(i) => { setSelected(i); setNote(''); setActionError(null); }}
          activeKey={selected?.id ?? null}
          loading={items === null && !itemsError}
          error={itemsError ? `The findings could not be loaded. ${itemsError} This is not the same as there being none.` : null}
          empty={state === 'open' ? 'No open findings. Every check that ran found our records in agreement.' : 'No findings.'}
          currentQuery={savedQ || undefined}
          onSavedView={(q) => router.push(`/finance/reconciliation?${q}`)}
        />

        {selected ? (
          <RecordPanel
            label="Finding"
            title={selected.kind_label}
            refId={`#${selected.id}`}
            subtitle={<>{cityName(selected.city)} · raised {stamp(selected.created_at, tz)}</>}
            status={<FindingChip item={selected} />}
            onClose={() => setSelected(null)}
            tabs={[
              {
                key: 'finding', label: 'Finding', content: (
                  <div className="grid gap-4">
                    <Facts>
                      <Fact label="Currency">{selected.currency}</Fact>
                      <Fact label="Expected">{selected.expected || '—'}</Fact>
                      <Fact label="Seen">{selected.seen || '—'}</Fact>
                      {selected.reference ? <Fact label="Gateway reference">{selected.reference}</Fact> : null}
                      {selected.payment_id ? <Fact label="Payment"><Link href={`/finance/payments/${selected.payment_id}`}>Payment #{selected.payment_id}</Link></Fact> : null}
                      {selected.trip_id ? <Fact label="Trip"><PageLink page="trips" href={`/trips/${selected.trip_id}`}>T-{selected.trip_id}</PageLink></Fact> : null}
                      {selected.withdrawal_id ? <Fact label="Payout"><PageLink page="withdrawals" href={`/finance/payouts?id=${selected.withdrawal_id}`}>PO-{selected.withdrawal_id}</PageLink></Fact> : null}
                    </Facts>
                    {!selected.resolved_at && mayResolve && (
                      <div className="ops-confirm">
                        <b>Resolve this finding</b>
                        <span>Say what you checked or did. This records that a person looked; it moves no money.</span>
                        <label className="sr-only" htmlFor="recon-note">Resolution note</label>
                        <textarea id="recon-note" className="input" rows={4} value={note}
                          onChange={(e) => setNote(e.target.value)} placeholder="What did you check, and what did you find?" />
                        {actionError && <div className="alert-error" role="alert">{actionError}</div>}
                        <div>
                          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
                            disabled={busy || note.trim().length < 3} onClick={() => void resolve()}>
                            {busy ? 'Working…' : 'Resolve with this note'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'history', label: 'History', content: (
                  <History entries={[
                    ...(selected.resolved_at
                      ? [{ at: stamp(selected.resolved_at, tz), text: `Resolved: ${selected.resolution_note || 'no note'}`, who: selected.resolved_by_label || null }]
                      : []),
                    { at: stamp(selected.created_at, tz), text: `Raised by the daily run (run #${selected.run_id})` },
                  ]} />
                ),
              },
            ]}
          />
        ) : null}
      </div>

      {overview && (!overview.statement_import.connected || unconfigured.length > 0) ? (
        <div className="grid gap-3 mt-4">
          {!overview.statement_import.connected && (
            <div className="ops-note" role="note">
              <b>Gateway statement import is not connected.</b> Reconciliation compares our local records only.
            </div>
          )}
          {unconfigured.length > 0 && (
            <div className="ops-note" role="note">
              <b>Stuck-payout check: not configured</b> for {unconfigured.map((c) => c.country).join(', ')}.
              Payouts there are not checked for sitting in processing until the owner sets the number of hours.
            </div>
          )}
        </div>
      ) : null}

      <section className="ops-card mt-4" aria-labelledby="recon-runs">
        <header className="ops-card__head"><h2 id="recon-runs">Recent runs</h2></header>
        {overview === null && !overviewError ? (
          <div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={3} /></div>
        ) : overviewError ? (
          <div>
            <p className="alert-error" role="alert">Runs could not be loaded. {overviewError}</p>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void loadOverview()}>Try again</button>
          </div>
        ) : overview!.results.length === 0 ? (
          <p className="ops-list__empty">The daily reconciliation has not run for your countries.</p>
        ) : (
          <div className="ops-list__table">
            <table className="ops-table ops-table--compact">
              <caption className="sr-only">Reconciliation runs</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th><th scope="col">Country</th><th scope="col">Gateway</th><th scope="col">Run</th>
                  <th scope="col" className="num">Raised</th><th scope="col" className="num">Still open</th><th scope="col">Skipped checks</th>
                </tr>
              </thead>
              <tbody>
                {overview!.results.map((r) => {
                  const skipped = Object.entries(r.checks).filter(([, v]) => v === 'not_configured').map(([k]) => k.replace(/_/g, ' '));
                  return (
                    <tr key={r.id}>
                      <td>{r.date}</td>
                      <td>{r.country} · {r.currency}</td>
                      <td>{r.gateway}</td>
                      <td><RunChip status={r.status} /></td>
                      <td className="num">{Object.values(r.new_findings).reduce((a, b) => a + b, 0)}</td>
                      <td className="num">{r.open_items}</td>
                      <td>{skipped.length ? `${skipped.join(', ')}: not configured` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function ReconciliationPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <ReconciliationInner />
    </Suspense>
  );
}
