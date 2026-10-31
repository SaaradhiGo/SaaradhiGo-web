'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import {
  KIND_WORDS, STATE_ORDER, STATE_WORDS, canStart, termsWords, totalsByCurrency, type Audience, type Campaign, type Kind, type State,
} from '@/lib/promotions';
import { formatMinor } from '@/lib/trips';
import {
  BudgetBar, NoAccess, PromotionsNav, StateTag,
} from '@/components/console/promotions';
import { CampaignEditor } from '@/components/console/promotions/CampaignEditor';
import { NoticeBanner, messageOf, type Notice } from '@/components/console/notifications';
import {
  DataTable, Empty, ErrorState, PageHeader, Panel, Skeleton, Stat, StatStrip, TableToolbar,
} from '@/components/console/ui';

/**
 * One tab of Promotions: a list of campaigns of one kind, each with its state and budget bar, and
 * the drawer that creates, edits, submits, pauses, cancels and reads one.
 *
 * The rulings the page has to say out loud (owner, 2026-10-31): a rider promo is paid by the
 * platform, never by the driver; a budget is a hard cap; going live and raising a budget need a
 * second admin. Finance and the Analyst see the same budgets read-only.
 */
type Payload = { count: number; results: Campaign[] };

const STATES: State[] = ['draft', 'pending_approval', 'scheduled', 'live', 'paused', 'exhausted', 'ended', 'cancelled'];

export function CampaignList({ kind, subtitle, newLabel, emptyDetail, audienceFilter = false }: {
  kind: Kind;
  subtitle: string;
  newLabel: string;
  emptyDetail: string;
  audienceFilter?: boolean;
}) {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const may = canStart(access, kind);
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'' | State>('');
  const [audience, setAudience] = useState<'' | Audience>('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const query = new URLSearchParams({ kind, limit: '100' });
    if (state) query.set('state', state);
    if (audience) query.set('audience', audience);
    if (q.trim()) query.set('q', q.trim());
    try {
      const data = await api.get<Payload>(withScope(`/promotions/admin/campaigns/?${query.toString()}`));
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      setRows(null);
      setError(messageOf(err, 'The campaigns could not be loaded.'));
    }
  }, [kind, state, audience, q]);
  useEffect(() => { void load(); }, [load]);

  const columns = useMemo(() => [
    { key: 'name', label: 'Campaign', sortValue: (c: Campaign) => c.name,
      render: (c: Campaign) => (
        <>
          <b>{c.name}</b>{c.is_legacy ? <span className="muted"> · existing</span> : null}
          <span className="pm-sub">{termsWords(c)}</span>
        </>
      ) },
    { key: 'state', label: 'State', width: '12rem', sortValue: (c: Campaign) => STATE_ORDER[c.state],
      render: (c: Campaign) => <StateTag state={c.state} /> },
    { key: 'place', label: 'Where', width: '9rem', hideBelow: 1100 as const, sortValue: (c: Campaign) => c.scope_name ?? '',
      render: (c: Campaign) => c.scope_name ?? '—' },
    { key: 'window', label: 'Runs', width: '11rem', hideBelow: 1280 as const, sortValue: (c: Campaign) => c.starts_at ?? '',
      render: (c: Campaign) => <span className="pm-window">{stamp(c.starts_at)}<br />to {stamp(c.ends_at)}</span> },
    { key: 'budget', label: 'Budget', width: '19rem', sortValue: (c: Campaign) => c.budget.budget_minor ?? -1,
      render: (c: Campaign) => <BudgetBar budget={c.budget} compact /> },
  ], []);

  if (!canOpen(access, 'promotions')) {
    return (<><PageHeader title="Promotions" /><NoAccess /></>);
  }

  const totals = rows ? totalsByCurrency(rows) : [];

  return (
    <>
      <PageHeader title="Promotions" subtitle={subtitle}
        actions={may ? (
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setOpen('new')}>{newLabel}</button>
        ) : undefined} />
      <PromotionsNav />
      <NoticeBanner notice={notice} />

      {totals.length > 0 ? (
        <StatStrip>
          {totals.map((t) => (
            <Stat key={t.currency} label={`Launched budget · ${t.currency}`} value={formatMinor(t.budget, t.currency)} money
              note={`${formatMinor(t.spent, t.currency)} spent · ${formatMinor(t.committed, t.currency)} reserved`} />
          ))}
        </StatStrip>
      ) : null}

      <Panel title={`${KIND_WORDS[kind]}s`} flush>
        <TableToolbar summary={rows ? `${rows.length} of ${count} campaign${count === 1 ? '' : 's'}` : null}
          density={density} onDensity={setDensity}>
          <div className="nf-filters">
            <label className="sr-only" htmlFor="pm-state">State</label>
            <select id="pm-state" className="ops-select" value={state} onChange={(e) => setState(e.target.value as '' | State)}>
              <option value="">Any state</option>
              {STATES.map((s) => <option key={s} value={s}>{STATE_WORDS[s]}</option>)}
            </select>
            {audienceFilter ? (
              <>
                <label className="sr-only" htmlFor="pm-audience">Who is referred</label>
                <select id="pm-audience" className="ops-select" value={audience}
                  onChange={(e) => setAudience(e.target.value as '' | Audience)}>
                  <option value="">Riders and drivers</option>
                  <option value="rider">Rider referrals</option>
                  <option value="driver">Driver referrals</option>
                </select>
              </>
            ) : null}
            <label className="sr-only" htmlFor="pm-q">Search by name</label>
            <input id="pm-q" className="input" type="search" placeholder="Search by name" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </div>
        </TableToolbar>
        {error ? (
          <ErrorState title="The campaigns could not be loaded" detail={error} onRetry={() => void load()} />
        ) : rows === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the campaigns</span>
            <Skeleton kind="row" count={5} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title={state || q || audience ? 'No campaigns match' : 'No campaigns yet'}
            detail={state || q || audience ? 'Nothing matches those filters in your scope.' : emptyDetail} />
        ) : (
          <DataTable caption={`${KIND_WORDS[kind]} campaigns`} rows={rows} columns={columns} rowKey={(c) => c.id}
            density={density} onRow={(c) => setOpen(c.id)} selectedKey={typeof open === 'number' ? open : null}
            defaultSort={{ key: 'state', dir: 'asc' }} maxHeight={false} />
        )}
      </Panel>

      {open !== null ? (
        <CampaignEditor key={String(open)} kind={kind} campaignId={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onOpen={(id) => { setOpen(id); void load(); }}
          onDone={(n) => { setOpen(null); setNotice(n); void load(); }} />
      ) : null}
    </>
  );
}
