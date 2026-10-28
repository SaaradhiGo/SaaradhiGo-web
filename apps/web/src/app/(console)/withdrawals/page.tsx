'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Empty, PageHeader, Panel, Pill, Stat, StatStrip, Table } from '@/components/console/ui';

/**
 * Releasing a driver's money.
 *
 * The control itself was already right — read the amount and the payee
 * back before it goes, and require a reason to reject, because the driver
 * reads it. What it did with `window.confirm` and `window.prompt` it now
 * does in the page, where the approver can see the KYC state and the UPI
 * handle at the same time as the amount.
 *
 * TWO THINGS THIS SCREEN WILL NOT DO
 *
 * It does not add amounts across currencies. The total is per currency,
 * because a payout's currency comes from the driver's own wallet and a
 * single "pending total" across markets would be a made-up number.
 *
 * It does not let an unapproved driver be paid without saying so. The
 * server enforces it; the row says it too, so nobody learns it from a
 * failure.
 */
type Withdrawal = {
  id: number;
  driver: number;
  driver_name?: string;
  driver_phone?: string;
  driver_upi_id?: string;
  driver_kyc_approved?: boolean;
  amount: string;
  currency?: string | null;
  status: string;
  requested_at: string;
  processed_at?: string | null;
  admin_notes?: string;
  payout_reference_id?: string | null;
};

type Page = { count?: number; results?: Withdrawal[] };

const FILTERS = ['pending', 'approved', 'processing', 'completed', 'failed', 'rejected'] as const;

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good',
  approved: 'wait',
  processing: 'wait',
  pending: 'wait',
  failed: 'bad',
  rejected: 'neutral',
};

const when = (s?: string | null) => (s ? s.replace('T', ' ').slice(0, 16) : '—');

/** Amount with its own currency, never a symbol this page chose. */
function money(w: Withdrawal) {
  const amount = Number(w.amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return w.currency ? `${w.currency} ${amount}` : amount;
}

export default function WithdrawalsPage() {
  const [rows, setRows] = useState<Withdrawal[] | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [acting, setActing] = useState<{ id: number; kind: 'approve' | 'reject' } | null>(null);
  const [note, setNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const page = await api.get<Page>(
        `/driver/admin/withdrawals/?status=${encodeURIComponent(status)}&page_size=100`);
      const list = Array.isArray(page?.results) ? page.results
        : (Array.isArray(page) ? (page as unknown as Withdrawal[]) : []);
      setRows(list);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the payout queue.');
      setRows([]);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  async function send(w: Withdrawal, kind: 'approve' | 'reject') {
    setBusyId(w.id);
    setActionError(null);
    try {
      await api.post(`/driver/admin/withdrawals/${w.id}/${kind}/`,
        { admin_notes: note.trim() });
      setActing(null);
      setNote('');
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer
        ? err.message : `The ${kind} did not go through.`);
    } finally {
      setBusyId(null);
    }
  }

  // One total per currency. Adding rupees to dollars would be a made-up
  // number on a screen about releasing money.
  const totals = (rows ?? [])
    .filter((r) => r.status === 'pending')
    .reduce<Record<string, number>>((acc, r) => {
      const key = r.currency || 'unknown';
      acc[key] = (acc[key] ?? 0) + Number(r.amount || 0);
      return acc;
    }, {});

  return (
    <>
      <PageHeader
        title="Withdrawals"
        subtitle="Money leaving the platform. Approving dispatches a real payout."
        actions={FILTERS.map((f) => (
          <button
            key={f}
            className={f === status ? 'btn-secondary' : 'btn-ghost'}
            onClick={() => setStatus(f)}
          >
            {f}
          </button>
        ))}
      />

      {error && <div className="alert-error mb-5" role="alert">{error}</div>}
      {actionError && <div className="alert-error mb-5" role="alert">{actionError}</div>}

      {status === 'pending' && Object.keys(totals).length > 0 && (
        <div className="mb-5">
          <StatStrip>
            {Object.entries(totals).map(([currency, amount]) => (
              <Stat
                key={currency}
                money
                label={`Pending · ${currency === 'unknown' ? 'currency not set' : currency}`}
                value={amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                note={`${(rows ?? []).filter((r) => r.status === 'pending'
                  && (r.currency || 'unknown') === currency).length} request(s)`}
              />
            ))}
          </StatStrip>
        </div>
      )}

      <Panel flush>
        {rows === null ? (
          <Empty title="Loading…" />
        ) : rows.length === 0 ? (
          <Empty
            error={Boolean(error)}
            title={error ? 'The queue could not be loaded' : `Nothing ${status}`}
            detail={error
              ? 'This is not the same as there being nothing to pay.'
              : undefined}
          />
        ) : (
          <Table head={<>
            <th>Driver</th><th>Payee</th><th>KYC</th>
            <th className="num">Amount</th><th>Status</th>
            <th>Requested</th><th />
          </>}>
            {rows.map((w) => (
              // A keyed Fragment, not `<>`: a bare fragment cannot take a
              // key, so React would lose track of which row is which and
              // the confirmation panel could reattach to the wrong payout.
              <Fragment key={w.id}>
                <tr>
                  <td>
                    <Link href={`/drivers/${w.driver}`}>
                      {w.driver_name?.trim() || `Driver #${w.driver}`}
                    </Link>
                    {w.driver_phone ? (
                      <div className="text-ink-subtle text-xs">{w.driver_phone}</div>
                    ) : null}
                  </td>
                  <td>
                    {w.driver_upi_id || <span className="text-ink-subtle">No UPI on file</span>}
                  </td>
                  <td>
                    {w.driver_kyc_approved
                      ? <Pill tone="good">Approved</Pill>
                      : <Pill tone="bad">Not approved</Pill>}
                  </td>
                  <td className="num">{money(w)}</td>
                  <td><Pill tone={TONE[w.status] ?? 'neutral'}>{w.status}</Pill></td>
                  <td>{when(w.requested_at)}</td>
                  <td className="num">
                    {w.status === 'pending' && acting?.id !== w.id && (
                      <>
                        <button
                          className="btn-ghost"
                          disabled={busyId !== null}
                          onClick={() => { setActing({ id: w.id, kind: 'approve' }); setNote(''); }}
                        >
                          Release
                        </button>
                        {' · '}
                        <button
                          className="btn-ghost"
                          disabled={busyId !== null}
                          onClick={() => { setActing({ id: w.id, kind: 'reject' }); setNote(''); }}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>

                {/* The confirmation, in the page rather than a browser
                    dialog, so the amount and the payee stay visible while
                    the approver reads them back. */}
                {acting?.id === w.id && (
                  <tr>
                    <td colSpan={7} style={{ background: 'var(--bg-200)' }}>
                      <div className="grid gap-3" style={{ maxWidth: '44rem' }}>
                        <b>
                          {acting.kind === 'approve'
                            ? `Release ${money(w)} to ${w.driver_name?.trim() || `driver #${w.driver}`}`
                            : `Reject ${money(w)} for ${w.driver_name?.trim() || `driver #${w.driver}`}`}
                        </b>
                        <span className="text-ink-muted text-sm">
                          {acting.kind === 'approve' ? (
                            <>
                              This dispatches a real payout
                              {w.driver_upi_id ? ` to ${w.driver_upi_id}` : ''} and
                              cannot be undone from this console.
                              {!w.driver_kyc_approved && (
                                <strong style={{ color: 'var(--danger)' }}>
                                  {' '}This driver&rsquo;s KYC is not approved.
                                </strong>
                              )}
                            </>
                          ) : (
                            'The reason you write is shown to the driver.'
                          )}
                        </span>
                        <textarea
                          className="input"
                          rows={2}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder={acting.kind === 'approve'
                            ? 'Note for the audit log (optional)'
                            : 'Why is this being rejected?'}
                        />
                        <div className="flex gap-3">
                          <button
                            className="btn-primary"
                            disabled={busyId === w.id
                              || (acting.kind === 'reject' && note.trim().length < 5)}
                            onClick={() => send(w, acting.kind)}
                          >
                            {busyId === w.id ? 'Working…'
                              : acting.kind === 'approve' ? 'Release the payout' : 'Reject'}
                          </button>
                          <button
                            className="btn-ghost"
                            onClick={() => { setActing(null); setNote(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
