'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  KIND_WORDS, STATE_WORDS, canStart, termsWords, totalsByCurrency, type Audience, type Campaign, type Kind, type State,
} from '@/lib/promotions';
import { formatWhole } from '@/lib/trips';
import { BudgetBar, NoAccess, PromotionsNav } from '@/components/console/promotions';
import { CampaignEditor } from '@/components/console/promotions/CampaignEditor';
import { CampaignChip, CampaignRecord } from '@/components/console/promotions/CampaignRecord';
import { NoticeBanner, messageOf, type Notice } from '@/components/console/notifications';
import { ListPage, type ListColumn, type ListView } from '@/components/console/kit/ListPage';
import { PageHeader } from '@/components/console/ui';

/**
 * One tab of Promotions: the campaigns of one kind as a list with views
 * (Live, Draft, Waiting for approval, Ended...), the campaign opened beside
 * it with its budget, rules and history, and the drawer that creates, edits,
 * submits, pauses, cancels and raises one.
 *
 * The rulings the page has to say out loud (owner, 2026-10-31): a rider promo is paid by the
 * platform, never by the driver; a budget is a hard cap; going live and raising a budget need a
 * second admin. Finance and the Analyst see the same budgets read-only.
 */
type Payload = { count: number; limit?: number; offset?: number; results: Campaign[] };

const PAGE_SIZE = 25;
const VIEW_STATES: Array<'' | State> = ['', 'live', 'draft', 'pending_approval', 'scheduled', 'paused', 'exhausted', 'ended', 'cancelled'];
const VIEW_WORDS: Partial<Record<State, string>> = { pending_approval: 'Waiting for approval' };

export function CampaignList({ kind, subtitle, newLabel, emptyDetail, audienceFilter = false }: {
  kind: Kind;
  subtitle: string;
  newLabel: string;
  emptyDetail: string;
  audienceFilter?: boolean;
}) {
  const access = useAdminAccess();
  const may = canStart(access, kind);
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'' | State>('');
  const [audience, setAudience] = useState<'' | Audience>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<number | null>(null);
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    const query = new URLSearchParams({ kind, limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
    if (state) query.set('state', state);
    if (audience) query.set('audience', audience);
    if (q.trim()) query.set('q', q.trim());
    try {
      const data = await api.get<Payload>(withScope(`/promotions/admin/campaigns/?${query.toString()}`));
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      setRows([]);
      setCount(null);
      setError(messageOf(err, 'The campaigns could not be loaded.'));
    }
  }, [kind, state, audience, q, page]);
  useEffect(() => { void load(); }, [load]);

  const changed = () => { setRefresh((n) => n + 1); void load(); };

  if (!canOpen(access, 'promotions')) {
    return (<><PageHeader title="Promotions" /><NoAccess /></>);
  }

  const columns: ListColumn<Campaign>[] = [
    {
      key: 'name', label: 'Campaign', primary: true,
      render: (c) => <>{c.name}{c.is_legacy ? <span className="muted"> · existing</span> : null}</>,
    },
    { key: 'terms', label: 'Terms', render: (c) => termsWords(c) },
    { key: 'state', label: 'Status', render: (c) => <CampaignChip state={c.state} /> },
    { key: 'place', label: 'Where', render: (c) => c.scope_name ?? '—' },
    {
      key: 'window', label: 'Runs',
      render: (c) => {
        const tz = timeZoneFor(c.scope) ?? timeZoneFor(c.country);
        return `${stamp(c.starts_at, tz)} to ${stamp(c.ends_at, tz)}`;
      },
    },
    { key: 'budget', label: 'Budget', width: '16rem', render: (c) => <BudgetBar budget={c.budget} compact /> },
  ];

  const views: ListView[] = VIEW_STATES.map((s) => ({
    key: s,
    label: s === '' ? 'All' : VIEW_WORDS[s] ?? STATE_WORDS[s],
    count: s === state ? count : undefined,
  }));
  const chips = [
    ...(audience ? [{ key: 'audience', label: audience === 'rider' ? 'Rider referrals' : 'Driver referrals', onRemove: () => { setAudience(''); setPage(1); } }] : []),
    ...(q.trim() ? [{ key: 'q', label: `Name: ${q.trim()}`, onRemove: () => { setQ(''); setPage(1); } }] : []),
  ];
  // Totals only when the whole view is on screen: a page of a longer list would undercount.
  const totals = rows && count !== null && rows.length >= count ? totalsByCurrency(rows) : [];
  const saved = new URLSearchParams();
  if (state) saved.set('state', state);
  if (audience) saved.set('audience', audience);
  if (q.trim()) saved.set('q', q.trim());

  return (
    <>
      <PromotionsNav />
      <NoticeBanner notice={notice} />
      <div className={selected !== null ? 'ops-split' : undefined}>
        <ListPage<Campaign>
          pageKey={`promotions-${kind}`}
          title={`${KIND_WORDS[kind]}s`}
          summary={(
            <>
              {subtitle}
              {totals.map((t) => (
                <span key={t.currency} className="ops-list__total">
                  {formatWhole(t.budget, t.currency)} launched budget · {formatWhole(t.spent, t.currency)} spent · {formatWhole(t.committed, t.currency)} reserved
                </span>
              ))}
            </>
          )}
          actionsSlot={may ? (
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setOpen('new')}>{newLabel}</button>
          ) : undefined}
          views={views}
          view={state}
          onView={(v) => { setState(v as '' | State); setPage(1); }}
          chips={chips}
          filterSlot={(
            <div className="ops-list__filters">
              {audienceFilter ? (
                <>
                  <label className="sr-only" htmlFor="pm-audience">Who is referred</label>
                  <select id="pm-audience" className="ops-select ops-list__select" value={audience}
                    onChange={(e) => { setAudience(e.target.value as '' | Audience); setPage(1); }}>
                    <option value="">Riders and drivers</option>
                    <option value="rider">Rider referrals</option>
                    <option value="driver">Driver referrals</option>
                  </select>
                </>
              ) : null}
              <label className="sr-only" htmlFor="pm-q">Search by name</label>
              <input id="pm-q" className="input ops-list__search" type="search" placeholder="Search by name" value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }} />
            </div>
          )}
          columns={columns}
          rows={rows ?? []}
          rowKey={(c) => c.id}
          total={count}
          page={page}
          pageSize={PAGE_SIZE}
          onPage={setPage}
          onRow={(c) => setSelected(c.id)}
          activeKey={selected}
          loading={rows === null}
          error={error}
          empty={state || q || audience ? 'Nothing matches those filters in your scope.' : emptyDetail}
          currentQuery={saved.toString() || undefined}
          onSavedView={(query) => {
            const p = new URLSearchParams(query);
            setState((p.get('state') ?? '') as '' | State);
            setAudience((p.get('audience') ?? '') as '' | Audience);
            setQ(p.get('q') ?? '');
            setPage(1);
          }}
        />
        {selected !== null ? (
          <CampaignRecord id={selected} refreshKey={refresh} onClose={() => setSelected(null)} onManage={() => setOpen(selected)} />
        ) : null}
      </div>

      {open !== null ? (
        <CampaignEditor key={String(open)} kind={kind} campaignId={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onOpen={(id) => { setOpen(id); setSelected(id); changed(); }}
          onDone={(n) => { setOpen(null); setNotice(n); changed(); }} />
      ) : null}
    </>
  );
}
