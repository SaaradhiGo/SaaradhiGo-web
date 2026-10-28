'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { currentScope, getCachedAccess, withScope } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  Column,
  DataTable,
  Drawer,
  Empty,
  ErrorState,
  Fact,
  Facts,
  MetricTile,
  PageHeader,
  Panel,
  Pill,
  Skeleton,
  TableToolbar,
  TileGrid,
} from '@/components/console/ui';

/**
 * Releasing a driver's money.
 *
 * The control itself was already right -- read the amount and the payee
 * back before it goes, and require a reason to reject, because the driver
 * reads it. It now happens in a drawer rather than a row that unfolds, so
 * the approver sees the KYC state, the UPI handle and the amount together
 * on one surface with one gold button on it, and nothing else on the page
 * is gold while it is open.
 *
 * TWO THINGS THIS SCREEN WILL NOT DO
 *
 * It does not add amounts across currencies. The total is per currency,
 * because a payout's currency comes from the driver's own wallet and a
 * single "pending total" across markets would be a made-up number.
 *
 * It does not let an unapproved driver be paid without saying so. The
 * server enforces it; the row and the drawer say it too, so nobody learns
 * it from a failure.
 */
type Withdrawal = {
  id: number;
  driver: number;
  driver_name?: string;
  driver_phone?: string;
  driver_upi_id?: string | null;
  driver_kyc_approved?: boolean;
  amount: string;
  currency?: string | null;
  status: string;
  requested_at: string;
  processed_at?: string | null;
  admin_notes?: string | null;
  payout_reference_id?: string | null;
};

type Page = { count?: number; next?: string | null; results?: Withdrawal[] };

const STATES = ['pending', 'approved', 'processing', 'completed', 'failed', 'rejected'] as const;

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good',
  approved: 'wait',
  processing: 'wait',
  pending: 'wait',
  failed: 'bad',
  rejected: 'neutral',
};

/** Amount with its own currency, never a symbol this page chose. */
function money(w: Withdrawal) {
  const amount = Number(w.amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return w.currency ? `${w.currency} ${amount}` : amount;
}

const payee = (w: Withdrawal) => w.driver_name?.trim() || `Driver #${w.driver}`;

function WithdrawalsInner() {
  const router = useRouter();
  const search = useSearchParams();
  const status = (search.get('status') || 'pending') as (typeof STATES)[number];

  const [density, setDensity] = useDensity();
  const [rows, setRows] = useState<Withdrawal[] | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<string>(status);
  const [selected, setSelected] = useState<Withdrawal | null>(null);
  const [acting, setActing] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => setDraft(status), [status]);

  const tz = timeZoneFor(currentScope(getCachedAccess())?.code);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const page = await api.get<Page>(withScope(
        `/driver/admin/withdrawals/?status=${encodeURIComponent(status)}&page_size=100`));
      const list = Array.isArray(page?.results) ? page.results
        : (Array.isArray(page) ? (page as unknown as Withdrawal[]) : []);
      setRows(list);
      setTotal(typeof page?.count === 'number' ? page.count : list.length);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the payout queue.');
      setRows([]);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  function open(w: Withdrawal) {
    setSelected(w);
    setActing(null);
    setNote('');
    setActionError(null);
  }

  async function send(kind: 'approve' | 'reject') {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/driver/admin/withdrawals/${selected.id}/${kind}/`, { admin_notes: note.trim() });
      setNotice(kind === 'approve'
        ? `Released ${money(selected)} to ${payee(selected)}.`
        : `Rejected ${money(selected)} for ${payee(selected)}; the driver can read your reason.`);
      setSelected(null);
      setActing(null);
      setNote('');
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer
        ? err.message : `The ${kind === 'approve' ? 'release' : 'rejection'} did not go through.`);
    } finally {
      setBusy(false);
    }
  }

  // One total per currency. Adding rupees to dollars would be a made-up
  // number on a screen about releasing money.
  const totals = (rows ?? [])
    .filter((r) => r.status === 'pending')
    .reduce<Record<string, { amount: number; n: number }>>((acc, r) => {
      const key = r.currency || 'unknown';
      acc[key] = { amount: (acc[key]?.amount ?? 0) + Number(r.amount || 0), n: (acc[key]?.n ?? 0) + 1 };
      return acc;
    }, {});

  const columns: Column<Withdrawal>[] = [
    {
      key: 'driver', label: 'Driver', sortValue: payee,
      render: (w) => (
        <>
          <Link href={`/drivers/${w.driver}`}>{payee(w)}</Link>
          {w.driver_phone ? <span className="muted"> · {w.driver_phone}</span> : null}
        </>
      ),
    },
    { key: 'payee', label: 'Payee (UPI)', width: '13rem', render: (w) => w.driver_upi_id || <span className="muted">No UPI on file</span> },
    {
      key: 'kyc', label: 'KYC', width: '9rem', sortValue: (w) => (w.driver_kyc_approved ? 1 : 0),
      render: (w) => (w.driver_kyc_approved ? <Pill tone="good">Approved</Pill> : <Pill tone="bad">Not approved</Pill>),
    },
    { key: 'amount', label: 'Amount', num: true, width: '9rem', sortValue: (w) => Number(w.amount || 0), render: money },
    { key: 'status', label: 'Status', width: '8.5rem', render: (w) => <Pill tone={TONE[w.status] ?? 'neutral'}>{w.status}</Pill> },
    { key: 'when', label: 'Requested', num: true, width: '9.5rem', sortValue: (w) => w.requested_at, render: (w) => stamp(w.requested_at, tz) },
  ];

  function apply() {
    router.push(draft === 'pending' ? '/withdrawals' : `/withdrawals?status=${draft}`);
    setFiltersOpen(false);
  }

  const summary = total === null ? null : `${total} ${status}`;

  return (
    <>
      <PageHeader
        title="Withdrawals"
        subtitle="Money leaving the platform. Releasing a payout dispatches it for real."
      />

      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}

      {status === 'pending' && rows && Object.keys(totals).length > 0 && (
        <TileGrid>
          {Object.entries(totals).map(([currency, t]) => (
            <MetricTile
              key={currency}
              label={`Pending · ${currency === 'unknown' ? 'currency not set' : currency}`}
              tone="money"
              value={t.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              note={`${t.n} request${t.n === 1 ? '' : 's'} waiting`}
            />
          ))}
        </TileGrid>
      )}

      <Panel flush>
        <TableToolbar
          summary={summary}
          density={density}
          onDensity={setDensity}
          onFilters={() => setFiltersOpen(true)}
          filtersActive={status === 'pending' ? 0 : 1}
        />
        {rows === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the payout queue</span>
            <Skeleton kind="row" count={6} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="The queue could not be loaded" detail={`${error} This is not the same as there being nothing to pay.`} onRetry={() => void load()} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title={`Nothing ${status}`} detail={status === 'pending' ? 'No driver is waiting to be paid.' : undefined} />
        ) : (
          <DataTable
            caption="Withdrawal requests"
            rows={rows}
            columns={columns}
            rowKey={(w) => w.id}
            density={density}
            onRow={open}
            selectedKey={selected?.id ?? null}
            defaultSort={{ key: 'when', dir: 'asc' }}
          />
        )}
      </Panel>

      <Drawer open={filtersOpen} title="Filter payouts" onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setDraft('pending')}>Reset</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={apply}>Show payouts</button>
          </>
        }
      >
        <div className="ops-filterset">
          <fieldset>
            <legend>Status</legend>
            {STATES.map((v) => (
              <label key={v}>
                <input type="radio" name="status" value={v} checked={draft === v} onChange={() => setDraft(v)} />
                <span className="capitalize">{v}</span>
              </label>
            ))}
          </fieldset>
        </div>
      </Drawer>

      {/* The payout, read back before it goes. One gold button, and only
          once the approver has chosen which way this is going. */}
      <Drawer
        open={selected !== null}
        title={selected ? `${money(selected)} · ${payee(selected)}` : ''}
        onClose={() => setSelected(null)}
        footer={selected && selected.status === 'pending' ? (
          acting === null ? (
            <>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => { setActing('reject'); setNote(''); }}>Reject</button>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => { setActing('approve'); setNote(''); }}>Release…</button>
            </>
          ) : (
            <>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={() => { setActing(null); setNote(''); }}>Back</button>
              <button
                type="button"
                className="sg-btn sg-btn--primary sg-btn--sm"
                disabled={busy || (acting === 'reject' && note.trim().length < 5)}
                onClick={() => void send(acting)}
              >
                {busy ? 'Working…' : acting === 'approve' ? `Release ${money(selected)}` : 'Reject with this reason'}
              </button>
            </>
          )
        ) : undefined}
      >
        {selected && (
          <div className="grid gap-4">
            <Facts>
              <Fact label="Driver"><Link href={`/drivers/${selected.driver}`}>{payee(selected)}</Link></Fact>
              <Fact label="Phone">{selected.driver_phone || '—'}</Fact>
              <Fact label="Pays to">{selected.driver_upi_id || 'No UPI on file'}</Fact>
              <Fact label="KYC">{selected.driver_kyc_approved ? <Pill tone="good">Approved</Pill> : <Pill tone="bad">Not approved</Pill>}</Fact>
              <Fact label="Amount"><b>{money(selected)}</b></Fact>
              <Fact label="Status"><Pill tone={TONE[selected.status] ?? 'neutral'}>{selected.status}</Pill></Fact>
              <Fact label="Requested">{stamp(selected.requested_at, tz)}</Fact>
              {selected.processed_at ? <Fact label="Processed">{stamp(selected.processed_at, tz)}</Fact> : null}
              {selected.payout_reference_id ? <Fact label="Reference">{selected.payout_reference_id}</Fact> : null}
              {selected.admin_notes ? <Fact label="Notes">{selected.admin_notes}</Fact> : null}
            </Facts>

            {acting && (
              <div className="ops-confirm">
                <b>
                  {acting === 'approve'
                    ? `Release ${money(selected)} to ${payee(selected)}`
                    : `Reject ${money(selected)} for ${payee(selected)}`}
                </b>
                <span>
                  {acting === 'approve' ? (
                    <>
                      This dispatches a real payout{selected.driver_upi_id ? ` to ${selected.driver_upi_id}` : ''} and cannot be undone from this console.
                      {!selected.driver_kyc_approved && (
                        <strong className="ops-confirm__warn"> This driver&rsquo;s KYC is not approved; the server will refuse it.</strong>
                      )}
                    </>
                  ) : 'The reason you write is shown to the driver.'}
                </span>
                <label className="sr-only" htmlFor="payout-note">{acting === 'approve' ? 'Note for the audit log' : 'Reason for rejecting'}</label>
                <textarea
                  id="payout-note"
                  className="input"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={acting === 'approve' ? 'Note for the audit log (optional)' : 'Why is this being rejected? At least a few words.'}
                />
                {actionError && <div className="alert-error" role="alert">{actionError}</div>}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  );
}

export default function WithdrawalsPage() {
  return (
    <Suspense fallback={<div className="ops-skel-rows" aria-busy="true"><Skeleton kind="row" count={6} /></div>}>
      <WithdrawalsInner />
    </Suspense>
  );
}
