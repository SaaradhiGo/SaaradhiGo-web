'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { RECON_KIND_LABEL, canResolve, cityName } from '@/lib/finance';
import { PageLink } from '@/components/console/PageLink';
import { FinanceNav, Pager } from '@/components/console/finance';
import {
  Column, DataTable, Drawer, Empty, ErrorState, Fact, Facts, MetricTile, PageHeader, Panel, Pill,
  Skeleton, TableToolbar, TileGrid,
} from '@/components/console/ui';

/**
 * Reconciliation: where our own records disagree with each other.
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
type ItemPage = { count: number; page: number; total_pages: number; results: Item[] };

const STATES = [['open', 'Open'], ['resolved', 'Resolved'], ['all', 'All']] as const;

function ReconciliationInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const state = (search.get('state') || 'open') as 'open' | 'resolved' | 'all';
  const kind = search.get('kind') || '';
  const page = Math.max(1, Number(search.get('page')) || 1);

  const [density, setDensity] = useDensity();
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

  const go = (patch: { state?: string; kind?: string; page?: number }) => {
    const q = new URLSearchParams();
    const s = patch.state ?? state;
    const k = patch.kind ?? kind;
    if (s !== 'open') q.set('state', s);
    if (k) q.set('kind', k);
    if ((patch.page ?? 1) > 1) q.set('page', String(patch.page));
    router.push(`/finance/reconciliation${q.toString() ? `?${q}` : ''}`);
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

  const itemColumns: Column<Item>[] = [
    { key: 'kind', label: 'Finding', render: (i) => i.kind_label },
    { key: 'city', label: 'City', hideBelow: 1280, render: (i) => cityName(i.city) },
    { key: 'ccy', label: 'Currency', width: '5.5rem', render: (i) => i.currency },
    { key: 'expected', label: 'Expected', hideBelow: 1500, render: (i) => i.expected || '—' },
    { key: 'seen', label: 'Seen', hideBelow: 1500, render: (i) => i.seen || '—' },
    {
      key: 'state', label: 'State', width: '7rem',
      render: (i) => (i.resolved_at ? <Pill tone="good">Resolved</Pill> : <Pill tone="wait">Open</Pill>),
    },
    { key: 'when', label: 'Raised', num: true, width: '9.5rem', sortValue: (i) => i.created_at, render: (i) => stamp(i.created_at, timeZoneFor(i.city?.code)) },
  ];
  const runColumns: Column<Run>[] = [
    { key: 'date', label: 'Day', width: '8rem', sortValue: (r) => r.date, render: (r) => r.date },
    { key: 'country', label: 'Country', width: '6rem', render: (r) => `${r.country} · ${r.currency}` },
    { key: 'gateway', label: 'Gateway', hideBelow: 1100, render: (r) => r.gateway },
    {
      key: 'status', label: 'Run', width: '8rem',
      render: (r) => <Pill tone={r.status === 'ok' ? 'good' : r.status === 'error' ? 'bad' : 'wait'}>
        {r.status === 'ok' ? 'No findings' : r.status === 'issues' ? 'Findings' : 'Failed'}</Pill>,
    },
    { key: 'new', label: 'Raised', num: true, width: '6rem', render: (r) => Object.values(r.new_findings).reduce((a, b) => a + b, 0) },
    { key: 'open', label: 'Still open', num: true, width: '7rem', render: (r) => r.open_items },
    {
      key: 'checks', label: 'Skipped checks', hideBelow: 1280,
      render: (r) => {
        const skipped = Object.entries(r.checks).filter(([, v]) => v === 'not_configured').map(([k]) => k.replace(/_/g, ' '));
        return skipped.length ? `${skipped.join(', ')}: not configured` : '—';
      },
    },
  ];

  const mayResolve = canResolve(access);
  const unconfigured = overview?.stuck_payout_check.filter((c) => !c.configured) ?? [];

  return (
    <>
      <PageHeader title="Finance" subtitle="Where our own records disagree with each other. Local data only." />
      <FinanceNav />
      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}

      {overview && (
        <div className="grid gap-3 mb-4">
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
      )}

      {overview && (
        <TileGrid>
          <MetricTile label="Open findings" value={overview.open_total} tone={overview.open_total > 0 ? 'wait' : 'good'}
            note={overview.open_total > 0 ? 'Waiting for someone to look' : 'Nothing waiting'} />
          {overview.kinds.filter((k) => overview.open_by_kind[k.key]).map((k) => (
            <MetricTile key={k.key} label={k.label} value={overview.open_by_kind[k.key]} tone="wait"
              href={`/finance/reconciliation?kind=${k.key}`} />
          ))}
        </TileGrid>
      )}

      <Panel title="Findings" flush>
        <div className="ops-tabs" role="group" aria-label="Finding state">
          {STATES.map(([v, label]) => (
            <button key={v} type="button" className="ops-tab" aria-pressed={state === v}
              onClick={() => go({ state: v, page: 1 })}>
              {label}
            </button>
          ))}
        </div>
        <TableToolbar
          summary={items ? `${items.count} ${state === 'all' ? '' : state} finding${items.count === 1 ? '' : 's'}${kind ? ` · ${RECON_KIND_LABEL[kind] ?? kind}` : ''}` : null}
          density={density}
          onDensity={setDensity}
        >
          {kind && (
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => go({ kind: '', page: 1 })}>
              Clear kind
            </button>
          )}
        </TableToolbar>
        {items === null && !itemsError ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading findings</span>
            <Skeleton kind="row" count={5} />
          </div>
        ) : itemsError ? (
          <div className="p-4">
            <ErrorState title="The findings could not be loaded"
              detail={`${itemsError} This is not the same as there being none.`} onRetry={() => void loadItems()} />
          </div>
        ) : (items?.results.length ?? 0) === 0 ? (
          <Empty title={state === 'open' ? 'No open findings' : 'No findings'}
            detail={state === 'open' ? 'Every check that ran found our records in agreement.' : undefined} />
        ) : (
          <>
            <DataTable caption="Reconciliation findings" rows={items!.results} columns={itemColumns}
              rowKey={(i) => i.id} density={density} onRow={(i) => { setSelected(i); setNote(''); setActionError(null); }}
              selectedKey={selected?.id ?? null} />
            <Pager page={items!.page} totalPages={items!.total_pages} onPage={(p) => go({ page: p })} />
          </>
        )}
      </Panel>

      <div className="mt-4">
        <Panel title="Recent runs" flush>
          {overview === null && !overviewError ? (
            <div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={3} /></div>
          ) : overviewError ? (
            <div className="p-4"><ErrorState title="Runs could not be loaded" detail={overviewError} onRetry={() => void loadOverview()} /></div>
          ) : overview!.results.length === 0 ? (
            <Empty title="No runs yet" detail="The daily reconciliation has not run for your countries." />
          ) : (
            <DataTable caption="Reconciliation runs" rows={overview!.results} columns={runColumns}
              rowKey={(r) => r.id} density="compact" maxHeight={false} />
          )}
        </Panel>
      </div>

      <Drawer
        open={selected !== null}
        title={selected ? selected.kind_label : ''}
        onClose={() => setSelected(null)}
        footer={selected && !selected.resolved_at && mayResolve ? (
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
            disabled={busy || note.trim().length < 3} onClick={() => void resolve()}>
            {busy ? 'Working…' : 'Resolve with this note'}
          </button>
        ) : undefined}
      >
        {selected && (
          <div className="grid gap-4">
            <Facts>
              <Fact label="Finding">{selected.kind_label}</Fact>
              <Fact label="State">{selected.resolved_at ? <Pill tone="good">Resolved</Pill> : <Pill tone="wait">Open</Pill>}</Fact>
              <Fact label="City">{cityName(selected.city)}</Fact>
              <Fact label="Currency">{selected.currency}</Fact>
              <Fact label="Expected">{selected.expected || '—'}</Fact>
              <Fact label="Seen">{selected.seen || '—'}</Fact>
              {selected.reference ? <Fact label="Gateway reference">{selected.reference}</Fact> : null}
              {selected.payment_id ? <Fact label="Payment"><Link href={`/finance/payments/${selected.payment_id}`}>Payment #{selected.payment_id}</Link></Fact> : null}
              {selected.trip_id ? <Fact label="Trip"><PageLink page="trips" href={`/trips/${selected.trip_id}`}>Trip #{selected.trip_id}</PageLink></Fact> : null}
              {selected.withdrawal_id ? <Fact label="Payout"><Link href="/finance/payouts">Payout #{selected.withdrawal_id}</Link></Fact> : null}
              <Fact label="Raised">{stamp(selected.created_at, timeZoneFor(selected.city?.code))}</Fact>
              {selected.resolved_at ? (
                <>
                  <Fact label="Resolved">{stamp(selected.resolved_at, timeZoneFor(selected.city?.code))}</Fact>
                  <Fact label="Resolved by">{selected.resolved_by_label || '—'}</Fact>
                  <Fact label="Note">{selected.resolution_note}</Fact>
                </>
              ) : null}
            </Facts>
            {!selected.resolved_at && mayResolve && (
              <div className="ops-confirm">
                <b>Resolve this finding</b>
                <span>Say what you checked or did. This records that a person looked; it moves no money.</span>
                <label className="sr-only" htmlFor="recon-note">Resolution note</label>
                <textarea id="recon-note" className="input" rows={4} value={note}
                  onChange={(e) => setNote(e.target.value)} placeholder="What did you check, and what did you find?" />
                {actionError && <div className="alert-error" role="alert">{actionError}</div>}
              </div>
            )}
          </div>
        )}
      </Drawer>
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
