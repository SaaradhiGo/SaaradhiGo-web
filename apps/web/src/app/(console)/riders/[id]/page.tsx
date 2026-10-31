'use client';

import { PageButtonLink, PageLink } from '@/components/console/PageLink';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { type RiderActionKey, type RiderActions, riderName, visibleRiderActions } from '@/lib/riders';
import { cityTime, formatMinor, words } from '@/lib/trips';
import { RiderActionDrawer } from '@/components/console/RiderActionDrawer';
import { CreditWalletDrawer } from '@/components/console/FinanceActionDrawers';
import { ClearRestrictionDrawer } from '@/components/console/ClearRestrictionDrawer';
import { ButtonLink } from '@/components/sg/Button';
import { Revealable } from '@/components/console/Revealable';
import {
  Column, DataTable, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * One rider: who they are, what they have done, and what operators did.
 *
 * The wallet is shown here. The only change offered is "Credit wallet", a
 * closed-loop credit that always needs a second admin (finance.adjust); there
 * is no debit of a rider wallet. Amounts are integer minor units with their currency.
 * Trips, tickets and SOS link to their own pages. The action rail is drawn
 * from the server's per-rider answer (`actions`), so an operator without
 * a rider capability (`rider.note`, `flag`, `signout`, `block`) sees no
 * buttons the server would refuse. Contact details are masked by the
 * server; `Revealable` is the logged way to them. Times are in the rider's
 * city (their latest trip's, else home city, else country).
 */
type AuditRow = { id: number; action: string; created_at: string | null; reason: string;
  created_by?: { label?: string; role?: string } | null };
type WalletRow = { id: number; txn_type: string; amount_minor: number; currency: string; status: string;
  purpose: string; reference_id: string; created_at: string | null };
type TripRow = { id: number; status: string | null; requested_at: string | null; fare_minor: number | null;
  currency: string | null; city_code: string | null };
type TicketRow = { id: number; status: string; issue_type: string; trip_id: number | null; created_at: string | null };
type SosRow = { id: number; status: string; event_type: string; trip_id: number | null; created_at: string | null };

type RiderDetail = {
  id: number;
  user_details: { id: number; full_name: string | null; phone_number: string | null; email: string | null; is_active: boolean };
  city: { code: string; name: string; timezone: string } | null;
  joined_at: string | null;
  last_trip_at: string | null;
  blocked: boolean;
  flagged: boolean;
  block: { active: boolean; reason_label?: string; note?: string; created_at?: string | null; created_by?: { label?: string } | null };
  flags: Array<{ id: number; reason: string; reason_label?: string; note: string; created_at: string | null; created_by?: { label?: string } | null }>;
  // Operator restrictions that are not a block: today, online payment only (AUDIT 27.56).
  restrictions?: Array<{ id: number; kind: string; label: string; reason: string; set_at: string | null; set_by?: { label?: string } | null; flag_id: number | null }>;
  wallet: { balances: Array<{ currency: string; balance_minor: number }>; transactions: Record<string, WalletRow[]>; rows_per_currency: number };
  trips: { total: number; by_status: Record<string, number>; recent: TripRow[] };
  tickets: { total: number; open: number; recent: TicketRow[] };
  sos: { total: number; open: number; recent: SosRow[] };
  ratings_summary: {
    rating: string; rating_count: number; low_rating: boolean; soft_blocked: boolean;
    given: { count: number; average: number | null };
    received: { count: number; average: number | null; distribution: Record<string, number> };
  };
  saved_places_count: number;
  sessions: { active_sessions: number; push_device: boolean };
  status_history: AuditRow[];
  notes: Array<{ id: number; body: string; created_at: string | null; created_by?: { label?: string } | null }>;
  approval_requests: Array<{ id: number; action_key: string; status: string; requested_at: string | null }>;
  audit_trail: AuditRow[];
  actions?: RiderActions & { wallet_credit?: boolean; clear_restriction?: boolean };
};

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good', cancelled: 'bad', requested: 'wait', accepted: 'wait', reached: 'wait', in_progress: 'wait',
  open: 'bad', acknowledged: 'wait', resolved: 'good', OPEN: 'wait', IN_PROGRESS: 'wait', CLOSED: 'neutral',
  failed: 'bad', pending: 'wait',
};
const RAIL_LABEL: Record<RiderActionKey, string> = {
  block: 'Block…', unblock: 'Unblock…', flag: 'Flag…', unflag: 'Clear flags…',
  sign_out: 'Sign out everywhere…', note: 'Add a note…',
};

export default function RiderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const access = useAdminAccess();
  const [data, setData] = useState<RiderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [action, setAction] = useState<RiderActionKey | null>(null);
  const [crediting, setCrediting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<RiderDetail>(`/rider/admin/${id}/`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this rider.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the rider</span>
        <PageHeader title={`Rider #${id}`} />
        <div className="ops-review"><Skeleton kind="block" /><Skeleton kind="block" /></div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <>
        <PageHeader title={`Rider #${id}`} actions={<ButtonLink href="/riders" variant="ghost" size="sm">All riders</ButtonLink>} />
        <ErrorState title="This rider could not be loaded" detail={error ?? undefined} onRetry={() => void load()} />
      </>
    );
  }

  const name = riderName(data.user_details, data.id);
  const tz = data.city?.timezone ?? null;
  const when = (iso: string | null | undefined) => cityTime(iso, tz, { zone: true });
  const target = { type: 'rider', id: data.id } as const;
  const rail = visibleRiderActions(data.actions, access, { blocked: data.blocked, flagged: data.flagged });
  const r = data.ratings_summary;
  const done = (text: string, kind: 'pending' | 'done' = 'done') => { setNotice({ text, kind }); void load(); };
  const currencies = Object.keys(data.wallet.transactions);
  const pending = data.approval_requests.filter((a) => a.status === 'requested');

  const tripColumns: Column<TripRow>[] = [
    { key: 'id', label: 'Trip', width: '6rem', render: (t) => <PageLink page="trips" href={`/trips/${t.id}`}>#{t.id}</PageLink> },
    { key: 'status', label: 'Status', width: '8rem', render: (t) => <Pill tone={TONE[t.status ?? ''] ?? 'neutral'}>{words(t.status)}</Pill> },
    { key: 'city', label: 'City', width: '8rem', hideBelow: 1100, render: (t) => t.city_code ?? '—' },
    { key: 'fare', label: 'Fare', num: true, width: '8rem', render: (t) => formatMinor(t.fare_minor, t.currency) },
    { key: 'when', label: 'Requested', num: true, width: '10rem', render: (t) => cityTime(t.requested_at, tz) },
  ];
  const walletColumns: Column<WalletRow>[] = [
    { key: 'when', label: 'When', width: '10rem', render: (t) => cityTime(t.created_at, tz) },
    { key: 'what', label: 'What', render: (t) => <span>{words(t.txn_type)}{t.purpose ? <span className="muted"> · {t.purpose}</span> : null}</span> },
    { key: 'status', label: 'Status', width: '9rem', render: (t) => <Pill tone={TONE[t.status] ?? 'neutral'}>{words(t.status)}</Pill> },
    { key: 'amount', label: 'Amount', num: true, width: '8rem',
      render: (t) => formatMinor(t.txn_type === 'debit' ? -t.amount_minor : t.amount_minor, t.currency, { signed: true }) },
  ];
  const ticketColumns: Column<TicketRow>[] = [
    { key: 'id', label: 'Ticket', width: '6rem', render: (t) => <PageLink page="support" href={`/support/${t.id}`}>#{t.id}</PageLink> },
    { key: 'status', label: 'Status', width: '8rem', render: (t) => <Pill tone={TONE[t.status] ?? 'neutral'}>{words(t.status.toLowerCase())}</Pill> },
    { key: 'issue', label: 'Issue', render: (t) => words(t.issue_type) },
    { key: 'when', label: 'Opened', num: true, width: '10rem', render: (t) => cityTime(t.created_at, tz) },
  ];
  const sosColumns: Column<SosRow>[] = [
    { key: 'id', label: 'SOS', width: '6rem', render: (s) => <PageLink page="safety" href="/safety-ops">#{s.id}</PageLink> },
    { key: 'status', label: 'Status', width: '8rem', render: (s) => <Pill tone={TONE[s.status] ?? 'neutral'}>{words(s.status)}</Pill> },
    { key: 'trip', label: 'Trip', width: '6rem', render: (s) => (s.trip_id ? <PageLink page="trips" href={`/trips/${s.trip_id}`}>#{s.trip_id}</PageLink> : <span className="muted">none</span>) },
    { key: 'when', label: 'Raised', num: true, width: '10rem', render: (s) => cityTime(s.created_at, tz) },
  ];
  const auditColumns: Column<AuditRow>[] = [
    { key: 'when', label: 'When', width: '10rem', render: (a) => when(a.created_at) },
    { key: 'what', label: 'What', width: '12rem', render: (a) => words(a.action) },
    { key: 'why', label: 'Reason', render: (a) => a.reason || <span className="muted">—</span> },
    { key: 'who', label: 'By', width: '10rem', hideBelow: 1100, render: (a) => a.created_by?.label || '—' },
  ];

  return (
    <>
      <PageHeader
        title={name}
        subtitle={
          <>
            Rider #{data.id} · <Revealable value={data.user_details.phone_number ?? '—'} label="rider phone" target={target} field="phone_number" compact />
            {data.user_details.email ? <> · <Revealable value={data.user_details.email} label="rider email" target={target} field="email" compact /></> : null}
            {data.city ? ` · ${data.city.name} (latest trip)` : ' · no trips yet'}
          </>
        }
        actions={
          <>
            {data.blocked ? <Pill tone="bad">blocked</Pill> : <Pill tone="good">can book</Pill>}
            {data.flagged ? <Pill tone="wait">flagged</Pill> : null}
            {r.low_rating ? <Pill tone="wait">low rating</Pill> : null}
            {data.user_details.is_active ? null : <Pill tone="bad">account inactive</Pill>}
            <ButtonLink href="/riders" variant="ghost" size="sm">All riders</ButtonLink>
          </>
        }
      />

      {notice && (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-5' : 'alert-success mb-5'} role="status">
          <b>{notice.text}</b>
        </div>
      )}

      <div className="ops-review">
        <div className="grid gap-5">
          <Panel title="Wallet">
            {data.wallet.balances.length === 0 && currencies.length === 0 ? (
              <p className="help m-0">No wallet yet.</p>
            ) : (
              <>
                <Facts>
                  {data.wallet.balances.map((b) => (
                    <Fact key={b.currency} label={`Balance (${b.currency})`}>{formatMinor(b.balance_minor, b.currency)}</Fact>
                  ))}
                </Facts>
                {currencies.map((c) => (
                  data.wallet.transactions[c].length === 0 ? null : (
                    <DataTable
                      key={c} caption={`Latest ${c} wallet entries`} rows={data.wallet.transactions[c]}
                      columns={walletColumns} rowKey={(t) => t.id} density="compact" maxHeight={false}
                    />
                  )
                ))}
                <p className="help">The latest {data.wallet.rows_per_currency} entries per currency. Refunds are made on the trip.</p>
                {data.actions?.wallet_credit && data.wallet.balances.length > 0 ? (
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
                    onClick={() => setCrediting(true)}>Credit wallet…</button>
                ) : null}
              </>
            )}
          </Panel>

          <Panel title={`Trips · ${data.trips.total}`} flush>
            {data.trips.total === 0 ? (
              <Empty title="No trips yet" />
            ) : (
              <>
                <p className="help px-4 pt-3 m-0">
                  {Object.entries(data.trips.by_status).map(([s, n]) => `${words(s)} ${n}`).join(' · ')}
                </p>
                <DataTable caption="This rider's recent trips" rows={data.trips.recent} columns={tripColumns} rowKey={(t) => t.id} density="compact" maxHeight={false} />
              </>
            )}
          </Panel>

          <Panel title={`Support tickets · ${data.tickets.open} open of ${data.tickets.total}`} flush>
            {data.tickets.total === 0 ? (
              <Empty title="No tickets" />
            ) : (
              <DataTable caption="This rider's tickets" rows={data.tickets.recent} columns={ticketColumns} rowKey={(t) => t.id} density="compact" maxHeight={false} />
            )}
          </Panel>

          <Panel title={`SOS · ${data.sos.open} open of ${data.sos.total}`} flush>
            {data.sos.total === 0 ? (
              <Empty title="No SOS raised" />
            ) : (
              <DataTable caption="SOS this rider raised" rows={data.sos.recent} columns={sosColumns} rowKey={(s) => s.id} density="compact" maxHeight={false} />
            )}
          </Panel>

          <Panel title="Status history" flush>
            {data.status_history.length === 0 ? (
              <Empty title="No status changes recorded" />
            ) : (
              <DataTable caption="Status history" rows={data.status_history} columns={auditColumns} rowKey={(a) => a.id} density="compact" maxHeight={false} />
            )}
          </Panel>

          <Panel title="Audit trail" flush>
            {data.audit_trail.length === 0 ? (
              <Empty title="No operator has acted on this rider" />
            ) : (
              <DataTable caption="Audit trail" rows={data.audit_trail} columns={auditColumns} rowKey={(a) => a.id} density="compact" maxHeight={false} />
            )}
          </Panel>
        </div>

        <div className="grid gap-5">
          <div className="ops-decide">
            <h2>Standing</h2>
            {data.block.active ? (
              <p className="ops-decide__why">
                <strong className="block">Blocked: {data.block.reason_label ?? ''}</strong>
                {data.block.note || 'No note.'} {data.block.created_at ? `(${when(data.block.created_at)}${data.block.created_by?.label ? `, ${data.block.created_by.label}` : ''})` : ''}
              </p>
            ) : (
              <p className="help m-0">Can request rides.</p>
            )}
            {data.flags.map((f) => (
              <p key={f.id} className="ops-decide__why">
                <strong className="block">Flagged: {f.reason_label ?? words(f.reason)}</strong>
                {f.note || 'No note.'} ({when(f.created_at)}{f.created_by?.label ? `, ${f.created_by.label}` : ''})
              </p>
            ))}
            {(data.restrictions ?? []).map((r) => (
              <p key={r.id} className="ops-decide__why">
                <strong className="block">{r.label}</strong>
                Cash is switched off for this rider; they can still book and pay online.{' '}
                {r.reason || 'No note.'} ({when(r.set_at)}{r.set_by?.label ? `, ${r.set_by.label}` : ''})
                {data.actions?.clear_restriction ? (
                  <>
                    {' '}
                    <button type="button" className="btn-secondary" onClick={() => setClearing(true)}>Clear…</button>
                  </>
                ) : null}
              </p>
            ))}
            {pending.map((a) => (
              <p key={a.id} className="ops-confirm">Waiting for a checker · request #{a.id} ({words(a.action_key)})</p>
            ))}
            {rail.length === 0 ? (
              <p className="help m-0">You can view this rider but not change them.</p>
            ) : (
              <div className="ops-decide__actions">
                {rail.map((key) => (
                  <button
                    key={key} type="button"
                    className={key === 'block' ? 'btn-primary' : key === 'note' ? 'btn-ghost' : 'btn-secondary'}
                    onClick={() => setAction(key)}
                  >{RAIL_LABEL[key]}</button>
                ))}
              </div>
            )}
          </div>

          <Panel title="Record">
            <Facts>
              <Fact label="Rating">
                {Number(r.rating).toFixed(2)} · {r.rating_count} rating{r.rating_count === 1 ? '' : 's'} from drivers
                {r.soft_blocked ? ' · below the booking threshold' : ''}
              </Fact>
              {r.received.count > 0 ? (
                <Fact label="Stars received">{['5', '4', '3', '2', '1'].map((s) => `${s}★ ${r.received.distribution[s] ?? 0}`).join(' · ')}</Fact>
              ) : null}
              <Fact label="Ratings given">{r.given.count}{r.given.average !== null ? ` · average ${r.given.average.toFixed(2)}` : ''}</Fact>
              <Fact label="Saved places">{data.saved_places_count}</Fact>
              <Fact label="Sessions">{data.sessions.active_sessions} signed in{data.sessions.push_device ? ' · push device registered' : ''}</Fact>
              <Fact label="City">{data.city ? `${data.city.name} (latest trip)` : 'None: no trips yet'}</Fact>
              <Fact label="Last trip">{when(data.last_trip_at)}</Fact>
              <Fact label="Joined">{when(data.joined_at)}</Fact>
            </Facts>
          </Panel>

          <Panel title="Internal notes">
            {data.notes.length === 0 ? (
              <p className="help m-0">No notes yet.</p>
            ) : (
              <Facts>
                {data.notes.map((n) => (
                  <Fact key={n.id} label={`${when(n.created_at)}${n.created_by?.label ? ` · ${n.created_by.label}` : ''}`}>{n.body}</Fact>
                ))}
              </Facts>
            )}
          </Panel>
        </div>
      </div>

      {action && (
        <RiderActionDrawer
          action={action} riderId={data.id} riderName={name}
          blockReasons={data.actions?.block_reasons} flagReasons={data.actions?.flag_reasons}
          onClose={() => setAction(null)}
          onDone={(text, kind) => done(text, kind)}
        />
      )}
      {clearing ? (
        <ClearRestrictionDrawer riderId={data.id} riderName={name}
          onClose={() => setClearing(false)} onDone={(text, kind) => done(text, kind)} />
      ) : null}
      {crediting && data.wallet.balances.length > 0 ? (
        <CreditWalletDrawer
          riderId={data.id} riderName={name} currency={data.wallet.balances[0].currency}
          onClose={() => setCrediting(false)}
          onDone={(text, kind) => done(text, kind)}
        />
      ) : null}
    </>
  );
}
