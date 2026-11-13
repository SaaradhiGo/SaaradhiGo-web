'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  DEFAULT_SUPPORT_FILTERS, ISSUE_LABEL, PRIORITY_LABEL, STATUS_LABEL,
  SUPPORT_PAGE_SIZES, SUPPORT_SORT_OPTIONS, type QueueCounts, type QueueKey, type Sla, type SupportActions,
  type SupportFilters, activeSupportFilterCount, canEditSla, canManageMacros, canViewDashboard,
  slaSentence, supportApiPath, supportFiltersFromSearch, supportFiltersToQuery, visibleSupportActions,
} from '@/lib/supportDesk';
import { canCreditWallet } from '@/lib/financeActions';
import { formatMinor, words } from '@/lib/trips';
import { downloadCsv, fetchAllPages, toCsv } from '@/lib/listViews';
import { ButtonLink } from '@/components/sg/Button';
import { SlaChip } from '@/components/console/SlaChip';
import { ActionDrawer } from '@/components/console/TripActionDrawer';
import { CreditWalletDrawer } from '@/components/console/FinanceActionDrawers';
import { PageLink } from '@/components/console/PageLink';
import { Revealable } from '@/components/console/Revealable';
import { ListPage, type FilterChip, type ListColumn } from '@/components/console/kit/ListPage';
import { History, RecordPanel, RecordStat } from '@/components/console/kit/RecordPanel';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import {
  ActionNotice, MoreFilters, RecordFacts, RecordFailed, RecordLoading, RecordSection,
} from '@/components/console/kit/ListBits';
import { Skeleton } from '@/components/console/ui';

/**
 * Support: the queue, as a list with the ticket beside it (design board B).
 *
 * The views are the questions an agent asks in order: everything open, what
 * is past its SLA, what is mine, what nobody has picked up, what came back
 * to me, and what is done. Their counts come from the server in the same
 * response as the rows, over the operator's whole scope, so a count is never
 * the size of the page. Every filter is server-side and lives in the URL.
 * The SLA chip says the next deadline in words and turns red only once one
 * has passed.
 *
 * The record shows the conversation summary, the requester behind the
 * logged reveal, and "Refund the fare" for a trip ticket: the SAME refund the
 * Trips page makes (same limits; over the limit it goes to a second approver,
 * decided on the server). Replies, notes and reassignment are on the ticket
 * page.
 */
type City = { code: string; name: string; country?: string } | null;

type TicketRow = {
  id: number;
  status: string;
  priority: string;
  issue_type: string;
  issue_label?: string;
  description?: string | null;
  created_at: string;
  assignee?: { id: number; label: string } | null;
  requester?: { id: number; role: string; full_name?: string | null } | null;
  city: City;
  sla: Sla;
};

type Page = {
  count: number; page: number; total_pages: number;
  queues?: QueueCounts; results: TicketRow[];
};

type Message = { id: number; author_role: string; author_name: string | null; internal: boolean; body: string; created_at: string };
type Ticket = {
  id: number; status: string; priority: string; issue_type: string; issue_label?: string;
  description: string | null; trip_id: number | null; assigned_to: number | null;
  assignee: { id: number; label: string } | null;
  requester: {
    id: number; role: string; full_name: string | null; phone_number: string | null;
    email: string | null; page: { type: 'rider' | 'driver'; id: number } | null;
  };
  city: City;
  created_at: string; updated_at: string; resolved_at: string | null; first_responded_at: string | null;
  returned_at?: string | null;
  returned_reason?: string | null;
  sla: Sla;
  messages: Message[];
  trip: {
    id: number; status: string | null; currency: string;
    fare: { charged_minor: number | null } | null;
    payment: { method: string | null; status: string | null; paid_minor: number; refunded_minor: number; refundable_minor: number } | null;
  } | null;
  refund: {
    may_refund: boolean; refundable_minor: number; currency: string;
    action_key: 'support.refund' | 'finance.refund' | null;
    requests: Array<{ id: number; status: string; amount_minor: number; currency: string; requested_at: string | null }>;
  } | null;
  audit_trail: Array<{ id: number; action: string; created_at: string | null; reason: string; created_by?: { label?: string } | null }>;
  allowed_actions: SupportActions;
};

const STATUS_TONE: Record<string, ChipTone> = {
  OPEN: 'info', IN_PROGRESS: 'info', WAITING_USER: 'neutral', CLOSED: 'good',
};
const PRIORITY_TONE: Record<string, ChipTone> = { urgent: 'critical', high: 'caution', normal: 'neutral', low: 'info' };

const VIEWS: Array<{ key: QueueKey; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'breaching', label: 'Past SLA' },
  { key: 'mine', label: 'Mine' },
  { key: 'unassigned', label: 'Unassigned' },
  { key: 'returned', label: 'Returned to you' },
  { key: 'closed', label: 'Closed' },
];

const requesterName = (t: { requester?: { id: number; role: string; full_name?: string | null } | null }) =>
  t.requester?.full_name?.trim() || `${t.requester?.role === 'driver' ? 'Driver' : 'Rider'} #${t.requester?.id ?? '—'}`;
const requesterRef = (t: { requester?: { id: number; role: string } | null }) =>
  (t.requester ? `${t.requester.role === 'driver' ? 'D' : 'R'}-${t.requester.id}` : '');

function SupportInner() {
  const router = useRouter();
  const search = useSearchParams();
  const access = useAdminAccess();
  const filters = useMemo(() => supportFiltersFromSearch(new URLSearchParams(search.toString())), [search]);

  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<SupportFilters>(filters);
  const [open, setOpen] = useState<TicketRow | null>(null);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [exporting, setExporting] = useState(false);
  useEffect(() => setDraft(filters), [filters]);

  const cities = (access?.scopes ?? []).filter((s) => s.kind === 'city');
  const scoped = useCallback((path: string) => (filters.scope ? path : withScope(path)), [filters.scope]);

  const load = useCallback(async () => {
    setPage(null);
    setError(null);
    try {
      setPage(await api.get<Page>(scoped(supportApiPath(filters))));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load the tickets.');
      setPage({ count: 0, page: 1, total_pages: 1, results: [] });
    }
  }, [filters, scoped]);

  useEffect(() => { void load(); }, [load]);

  const go = (next: SupportFilters) => {
    const q = supportFiltersToQuery(next);
    router.push(q ? `/ops/support?${q}` : '/ops/support');
  };
  const apply = (patch: Partial<SupportFilters>) => go({ ...draft, ...patch, page: 1 });

  const counts = page?.queues ?? {};
  const rows = page?.results ?? [];
  const active = activeSupportFilterCount(filters);

  const chips: FilterChip[] = [];
  const drop = (patch: Partial<SupportFilters>) => () => go({ ...filters, ...patch, page: 1 });
  if (filters.q) chips.push({ key: 'q', label: `Find: ${filters.q}`, onRemove: drop({ q: '' }) });
  if (filters.scope) chips.push({ key: 'scope', label: `City: ${cities.find((c) => c.code === filters.scope)?.name ?? filters.scope}`, onRemove: drop({ scope: '' }) });
  if (filters.country) chips.push({ key: 'country', label: filters.country === 'IN' ? 'India' : filters.country === 'US' ? 'United States' : filters.country, onRemove: drop({ country: '' }) });
  if (filters.priority) chips.push({ key: 'pri', label: `${PRIORITY_LABEL[filters.priority] ?? filters.priority} priority`, onRemove: drop({ priority: '' }) });
  if (filters.issueType) chips.push({ key: 'issue', label: ISSUE_LABEL[filters.issueType] ?? filters.issueType, onRemove: drop({ issueType: '' }) });
  if (filters.dueSoon) chips.push({ key: 'due', label: 'Due within the hour', onRemove: drop({ dueSoon: false }) });
  if (filters.dateFrom || filters.dateTo) chips.push({ key: 'dates', label: `Opened ${filters.dateFrom || '…'} to ${filters.dateTo || '…'}`, onRemove: drop({ dateFrom: '', dateTo: '' }) });

  const columns: ListColumn<TicketRow>[] = [
    { key: 'id', label: 'Ticket', primary: true, render: (t) => <span className="sg-num">TKT-{t.id}</span> },
    {
      key: 'priority', label: 'Priority', sortKey: 'priority',
      render: (t) => <StatusChip tone={PRIORITY_TONE[t.priority] ?? 'neutral'}>{PRIORITY_LABEL[t.priority] ?? t.priority}</StatusChip>,
    },
    { key: 'sla', label: 'SLA', sortKey: 'resolution_due', render: (t) => <SlaChip sla={t.sla} /> },
    { key: 'issue', label: 'Issue', render: (t) => t.issue_label ?? ISSUE_LABEL[t.issue_type] ?? t.issue_type },
    { key: 'who', label: 'Raised by', render: (t) => <span title={requesterName(t)}>{requesterName(t)} <span className="ops-ref sg-num">{requesterRef(t)}</span></span> },
    { key: 'city', label: 'City', render: (t) => t.city?.name ?? <span className="muted">Unplaced</span> },
    { key: 'assignee', label: 'Assignee', render: (t) => (t.assignee ? t.assignee.label : <span className="muted">Unassigned</span>) },
    { key: 'status', label: 'Status', render: (t) => <StatusChip tone={STATUS_TONE[t.status] ?? 'neutral'}>{STATUS_LABEL[t.status] ?? t.status}</StatusChip> },
    { key: 'opened', label: 'Opened', num: true, sortKey: 'created', render: (t) => stamp(t.created_at, timeZoneFor(t.city?.code)) },
  ];

  async function exportView() {
    setExporting(true);
    try {
      const { rows: all, truncated } = await fetchAllPages<TicketRow>((p, size) => scoped(supportApiPath({ ...filters, page: p, pageSize: size })));
      const header = ['Ticket', 'Priority', 'SLA', 'Issue', 'Raised by', 'City', 'Assignee', 'Status', 'Opened'];
      const body = all.map((t) => [
        `TKT-${t.id}`, PRIORITY_LABEL[t.priority] ?? t.priority, slaSentence(t.sla),
        t.issue_label ?? ISSUE_LABEL[t.issue_type] ?? t.issue_type, `${requesterName(t)} ${requesterRef(t)}`.trim(),
        t.city?.name ?? '', t.assignee?.label ?? '', STATUS_LABEL[t.status] ?? t.status,
        stamp(t.created_at, timeZoneFor(t.city?.code)),
      ]);
      downloadCsv(`support-${filters.queue}.csv`, toCsv(header, body));
      if (truncated) setNotice({ kind: 'done', text: `Exported the first ${all.length.toLocaleString('en-IN')} tickets. Narrow the view to export the rest.` });
    } catch (err) {
      setNotice({ kind: 'done', text: err instanceof ApiError && err.fromServer ? err.message : 'The export did not complete.' });
    } finally {
      setExporting(false);
    }
  }

  const empty = active ? 'No tickets match. Try fewer filters.'
    : filters.queue === 'mine' ? 'Nothing is assigned to you.'
      : filters.queue === 'returned' ? 'No refund request has come back to you.'
        : 'Nothing is waiting in this queue.';

  return (
    <>
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
      <div className={open ? 'ops-split' : undefined}>
        <ListPage<TicketRow>
          pageKey="support"
          title="Support"
          summary="Contact details are masked. Each ticket sits in the city of its trip, a driver's home city, or where its rider is visible."
          actionsSlot={(
            <>
              {canViewDashboard(access) ? <ButtonLink href="/ops/support/dashboard" variant="secondary" size="sm">SLA dashboard</ButtonLink> : null}
              {canManageMacros(access) ? <ButtonLink href="/ops/support/macros" variant="secondary" size="sm">Macros</ButtonLink> : null}
              <ButtonLink href="/ops/support/sla" variant="ghost" size="sm">{canEditSla(access) ? 'SLA policy' : 'SLA policy (read only)'}</ButtonLink>
            </>
          )}
          views={VIEWS.map((v) => ({ key: v.key, label: v.label, count: counts[v.key] ?? null }))}
          view={filters.queue}
          onView={(key) => go({ ...filters, queue: key as QueueKey, page: 1 })}
          chips={chips}
          filterSlot={(
            <MoreFilters count={active}>
              <form className="ops-form" aria-label="Filter tickets" onSubmit={(e) => { e.preventDefault(); apply({}); }}>
                <div className="ops-form__row">
                  <label className="ops-form__label" htmlFor="f-q">Find</label>
                  <input id="f-q" className="ops-select" value={draft.q} placeholder="Ticket # or last 4 of phone"
                    onChange={(e) => setDraft({ ...draft, q: e.target.value.replace(/^tkt-?/i, '') })} size={24} />
                  {cities.length > 1 ? (
                    <>
                      <label className="ops-form__label" htmlFor="f-city">City</label>
                      <select id="f-city" className="ops-select" value={draft.scope} onChange={(e) => setDraft({ ...draft, scope: e.target.value })}>
                        <option value="">All I hold</option>
                        {cities.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </select>
                    </>
                  ) : null}
                  <label className="ops-form__label" htmlFor="f-country">Country</label>
                  <select id="f-country" className="ops-select" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })}>
                    <option value="">Any</option>
                    <option value="IN">India</option>
                    <option value="US">United States</option>
                  </select>
                  <label className="ops-form__label" htmlFor="f-priority">Priority</label>
                  <select id="f-priority" className="ops-select" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                    <option value="">Any</option>
                    {Object.entries(PRIORITY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <label className="ops-form__label" htmlFor="f-issue">Issue</label>
                  <select id="f-issue" className="ops-select" value={draft.issueType} onChange={(e) => setDraft({ ...draft, issueType: e.target.value })}>
                    <option value="">Any</option>
                    {Object.entries(ISSUE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="ops-form__row">
                  <label className="ops-form__label" htmlFor="f-from">Opened from</label>
                  <input id="f-from" type="date" className="ops-select" value={draft.dateFrom} onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} />
                  <label className="ops-form__label" htmlFor="f-to">to</label>
                  <input id="f-to" type="date" className="ops-select" value={draft.dateTo} onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} />
                  <label className="ops-form__row">
                    <input type="checkbox" checked={draft.dueSoon} onChange={(e) => apply({ dueSoon: e.target.checked })} /> Due within the hour
                  </label>
                  <label className="ops-form__label" htmlFor="f-sort">Sort</label>
                  <select id="f-sort" className="ops-select" value={draft.ordering} onChange={(e) => apply({ ordering: e.target.value })}>
                    {SUPPORT_SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <label className="ops-form__label" htmlFor="f-size">Per page</label>
                  <select id="f-size" className="ops-select" value={draft.pageSize} onChange={(e) => apply({ pageSize: Number(e.target.value) })}>
                    {SUPPORT_PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Show tickets</button>
                  <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
                    onClick={() => go({ ...DEFAULT_SUPPORT_FILTERS, queue: filters.queue })} disabled={active === 0}>Clear</button>
                </div>
              </form>
            </MoreFilters>
          )}
          columns={columns}
          rows={rows}
          rowKey={(t) => t.id}
          total={page?.count ?? null}
          page={filters.page}
          pageSize={filters.pageSize}
          onPage={(p) => go({ ...filters, page: p })}
          ordering={filters.ordering}
          onOrdering={(o) => go({ ...filters, ordering: o, page: 1 })}
          onExport={exporting ? undefined : () => void exportView()}
          onRow={setOpen}
          activeKey={open?.id ?? null}
          loading={page === null}
          error={error ? `${error} This is not the same as there being none.` : null}
          empty={empty}
          currentQuery={supportFiltersToQuery({ ...filters, page: 1 })}
          onSavedView={(q) => router.push(q ? `/ops/support?${q}` : '/ops/support')}
        />
        {open ? (
          <TicketRecord
            key={open.id}
            id={open.id}
            onClose={() => setOpen(null)}
            onChanged={(text, kind) => { setNotice({ text, kind }); void load(); }}
          />
        ) : null}
      </div>
    </>
  );
}

function TicketRecord({ id, onClose, onChanged }: {
  id: number; onClose: () => void; onChanged: (text: string, kind: 'pending' | 'done') => void;
}) {
  const access = useAdminAccess();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState(false);
  const [crediting, setCrediting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setTicket(await api.get<Ticket>(`/support/admin/tickets/${id}/`));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this ticket.');
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (error) return <RecordFailed label="Ticket" message={error} onRetry={() => void load()} onClose={onClose} />;
  if (!ticket) return <RecordLoading label="Ticket" />;

  const tz = timeZoneFor(ticket.city?.code);
  const visible = visibleSupportActions(ticket.allowed_actions, access);
  const has = (k: (typeof visible)[number]) => visible.includes(k);
  const target = { type: 'support_ticket', id: ticket.id } as const;
  const name = requesterName(ticket);
  const pageHref = ticket.requester.page
    ? (ticket.requester.page.type === 'driver' ? `/ops/drivers/${ticket.requester.page.id}` : `/ops/riders/${ticket.requester.page.id}`)
    : null;
  const mayRefund = has('refund') && ticket.trip !== null && ticket.refund !== null;
  const mayCredit = canCreditWallet(access) && ticket.requester.page?.type === 'rider';
  const waitingRefunds = (ticket.refund?.requests ?? []).filter((r) => r.status === 'requested');
  const recent = ticket.messages.slice(-6);
  const done = (text: string, kind: 'pending' | 'done' = 'done') => { onChanged(text, kind); void load(); };

  async function assignToMe() {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/support/admin/tickets/${id}/assign/`, { assigned_to: 'me' });
      done('Assigned to you.');
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <RecordPanel
        label="Ticket"
        title={ticket.issue_label ?? ISSUE_LABEL[ticket.issue_type] ?? words(ticket.issue_type)}
        refId={`TKT-${ticket.id}`}
        onClose={onClose}
        subtitle={<>Raised by {name} {requesterRef(ticket)} · opened {stamp(ticket.created_at, tz)}{ticket.city ? ` · ${ticket.city.name}` : ''}</>}
        status={(
          <>
            <StatusChip tone={PRIORITY_TONE[ticket.priority] ?? 'neutral'}>{PRIORITY_LABEL[ticket.priority] ?? ticket.priority}</StatusChip>
            <SlaChip sla={ticket.sla} />
            <StatusChip tone={STATUS_TONE[ticket.status] ?? 'neutral'}>{STATUS_LABEL[ticket.status] ?? ticket.status}</StatusChip>
            {ticket.returned_at ? <StatusChip tone="caution">Returned to you</StatusChip> : null}
          </>
        )}
        actions={(
          <>
            {mayRefund ? (
              <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setRefunding(true)}>Refund the fare…</button>
            ) : null}
            {mayCredit ? (
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setCrediting(true)}>Credit wallet…</button>
            ) : null}
            {has('assign') && !ticket.assignee ? (
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => void assignToMe()}>Assign to me</button>
            ) : null}
            <Link className="sg-btn sg-btn--ghost sg-btn--sm" href={`/ops/support/${ticket.id}`}>{has('reply') ? 'Open and reply' : 'Open ticket'}</Link>
          </>
        )}
        tabs={[
          {
            key: 'conversation', label: 'Conversation', content: (
              <>
                {actionError ? <div className="alert-error" role="alert">{actionError}</div> : null}
                {ticket.returned_at ? (
                  <div className="ops-confirm" role="status">
                    <b>Returned to you</b>
                    <span>The refund asked for on this ticket was turned down{ticket.returned_reason ? `: ${ticket.returned_reason}` : '.'} Nothing was sent.</span>
                  </div>
                ) : null}
                <p className="help">{slaSentence(ticket.sla)}</p>
                {ticket.description ? (
                  <RecordSection title="What they said">
                    <p className="ops-record__note">{ticket.description}</p>
                  </RecordSection>
                ) : null}
                <RecordSection title={`Latest messages · ${ticket.messages.length} in all`}>
                  {recent.length === 0 ? <p className="ops-record__empty">No replies yet.</p> : (
                    <ol className="ops-thread">
                      {recent.map((m) => (
                        <li key={m.id} className={`${m.author_role === 'user' ? '' : 'is-ours'}${m.internal ? ' is-internal' : ''}`}>
                          <span className="ops-thread__meta">
                            <span>{m.internal ? 'Internal note · ' : ''}{m.author_role === 'user' ? name : m.author_name || words(m.author_role)}</span>
                            <time dateTime={m.created_at}>{stamp(m.created_at, tz)}</time>
                          </span>
                          <p>{m.body}</p>
                        </li>
                      ))}
                    </ol>
                  )}
                </RecordSection>
                <p className="help">Contact details in the text are masked. The full conversation and the reply box are on the ticket page.</p>
              </>
            ),
          },
          {
            key: 'details', label: 'Details', content: (
              <>
                <RecordFacts rows={[
                  ['Name', <Revealable key="n" value={ticket.requester.full_name ?? '—'} label="requester name" target={target} field="requester_name" />],
                  ['Phone', <Revealable key="p" value={ticket.requester.phone_number ?? '—'} label="requester phone" target={target} field="requester_phone" />],
                  ['Is a', ticket.requester.role],
                  ['Page', pageHref ? (
                    <PageLink key="pg" page={ticket.requester.page?.type === 'driver' ? 'drivers' : 'riders'} href={pageHref}>
                      Open the {ticket.requester.page?.type} page
                    </PageLink>
                  ) : 'None'],
                  ['Assigned to', ticket.assignee?.label ?? 'Nobody yet'],
                  ['First reply due', `${stamp(ticket.sla.first_response.due_at, tz)}${ticket.first_responded_at ? ` · answered ${stamp(ticket.first_responded_at, tz)}` : ''}`],
                  ['Resolution due', `${stamp(ticket.sla.resolution.due_at, tz)}${ticket.resolved_at ? ` · resolved ${stamp(ticket.resolved_at, tz)}` : ''}`],
                ]} />
                {ticket.trip ? (
                  <RecordSection title="Trip">
                    <RecordFacts rows={[
                      ['Trip', <PageLink key="t" page="trips" href={`/ops/trips/${ticket.trip.id}`}><span className="sg-num">T-{ticket.trip.id}</span></PageLink>],
                      ['Status', words(ticket.trip.status)],
                    ]} />
                    {ticket.trip.payment ? (
                      <div className="ops-recstats">
                        <RecordStat label="Paid" value={formatMinor(ticket.trip.payment.paid_minor, ticket.trip.currency)} />
                        <RecordStat label="Refunded" value={formatMinor(ticket.trip.payment.refunded_minor, ticket.trip.currency)} />
                        <RecordStat label="Refundable" value={formatMinor(ticket.refund?.refundable_minor ?? ticket.trip.payment.refundable_minor, ticket.trip.currency)} />
                      </div>
                    ) : null}
                    {waitingRefunds.map((r) => (
                      <p key={r.id} className="ops-confirm">
                        Refund of {formatMinor(r.amount_minor, r.currency)} waiting for a second approver · <PageLink page="approvals" href={`/ops/approvals?id=${r.id}`}>APR-{r.id}</PageLink>
                      </p>
                    ))}
                  </RecordSection>
                ) : <p className="ops-record__empty">No trip attached to this ticket.</p>}
              </>
            ),
          },
          {
            key: 'history', label: 'History', content: (
              <History
                entries={ticket.audit_trail.map((a) => ({
                  at: stamp(a.created_at, tz),
                  text: <>{words(a.action.replace(/^support_ticket_/, ''))}{a.reason ? ` · ${a.reason}` : ''}</>,
                  who: a.created_by?.label ?? null,
                }))}
                empty="No operator has acted on this ticket."
              />
            ),
          },
        ]}
      />
      {refunding && ticket.trip && ticket.refund ? (
        <ActionDrawer
          action="refund" tripId={ticket.trip.id} ticketId={ticket.id}
          currency={ticket.refund.currency} refundable={ticket.refund.refundable_minor}
          refundKey={ticket.refund.action_key} riderName={name}
          onClose={() => setRefunding(false)}
          onDone={(text, kind) => done(text, kind)}
        />
      ) : null}
      {crediting && ticket.requester.page?.type === 'rider' ? (
        <CreditWalletDrawer
          riderId={ticket.requester.page.id} riderName={name} ticketId={ticket.id}
          onClose={() => setCrediting(false)}
          onDone={(text, kind) => done(text, kind)}
        />
      ) : null}
    </>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <SupportInner />
    </Suspense>
  );
}
