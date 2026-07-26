'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

// Driver payout approval queue.
//
// The backend has had maker-checker approve/reject endpoints since Phase-0,
// but no screen: the only way to release a driver's money was to POST to
// /driver/admin/withdrawals/<id>/approve/ by hand. This is the screen that
// makes the control real — an approver can see who they are paying, to
// which UPI handle, and whether that driver's KYC actually passed.

type Withdrawal = {
  id: number;
  driver: number;
  driver_name?: string;
  driver_phone?: string;
  driver_upi_id?: string;
  driver_kyc_approved?: boolean;
  amount: string;
  status: string;
  requested_at: string;
  processed_at?: string | null;
  admin_notes?: string;
  payout_reference_id?: string | null;
};

const STATUSES = ['pending', 'approved', 'processing', 'completed', 'failed', 'rejected'] as const;

const STATUS_STYLES: Record<string, string> = {
  pending: 'border-amber-500/40 text-amber-300',
  approved: 'border-sky-500/40 text-sky-300',
  processing: 'border-sky-500/40 text-sky-300',
  completed: 'border-emerald-500/40 text-emerald-300',
  failed: 'border-red-500/40 text-red-300',
  rejected: 'border-white/20 text-white/60',
};

export default function WithdrawalsPage() {
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const r = await api.get<any>(`/driver/admin/withdrawals/${qs}`);
      const list = (r?.results ?? r?.data?.results ?? r) as Withdrawal[];
      setRows(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load withdrawals');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(w: Withdrawal) {
    // Releasing money is irreversible once Cashfree accepts the payout, so
    // make the approver read the amount and payee back before it goes.
    const ok = window.confirm(
      `Release ₹${w.amount} to ${w.driver_name || `driver #${w.driver}`}` +
        `${w.driver_upi_id ? ` (UPI: ${w.driver_upi_id})` : ''}?\n\n` +
        'This dispatches a real payout and cannot be undone from this console.',
    );
    if (!ok) return;

    const note = window.prompt('Approval note (recorded in the audit log):', '') ?? '';
    setBusyId(w.id);
    try {
      await api.post(`/driver/admin/withdrawals/${w.id}/approve/`, { admin_notes: note });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Approve failed');
    } finally {
      setBusyId(null);
    }
  }

  async function reject(w: Withdrawal) {
    const reason = window.prompt(
      `Reject ₹${w.amount} for ${w.driver_name || `driver #${w.driver}`}?\nReason (shown to the driver):`,
    );
    if (reason === null) return;
    if (!reason.trim()) {
      alert('A reason is required — the driver sees it.');
      return;
    }
    setBusyId(w.id);
    try {
      await api.post(`/driver/admin/withdrawals/${w.id}/reject/`, { admin_notes: reason });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Reject failed');
    } finally {
      setBusyId(null);
    }
  }

  const pendingTotal = rows
    .filter((r) => r.status === 'pending')
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Withdrawals</h1>
        <button className="btn-ghost text-sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
            className={`tag capitalize ${
              s === statusFilter ? 'border-brand text-brand' : 'border-white/20 text-white/60'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {statusFilter === 'pending' && rows.length > 0 && (
        <p className="text-white/60 text-sm mb-3">
          {rows.length} pending · ₹{pendingTotal.toFixed(2)} awaiting release
        </p>
      )}

      {loading && <p className="text-white/60">Loading...</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {!loading && !error && (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-white/60">
              <tr>
                <th className="pb-3">#</th>
                <th className="pb-3">Driver</th>
                <th className="pb-3">Phone</th>
                <th className="pb-3">UPI</th>
                <th className="pb-3">KYC</th>
                <th className="pb-3">Amount</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Requested</th>
                <th className="pb-3">Payout ref</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w.id} className="table-row hover:bg-white/5">
                  <td className="py-2">#{w.id}</td>
                  <td className="py-2">
                    <Link href={`/drivers/${w.driver}`} className="text-brand hover:underline">
                      {w.driver_name || `#${w.driver}`}
                    </Link>
                  </td>
                  <td className="py-2">{w.driver_phone || '—'}</td>
                  <td className="py-2 font-mono text-xs">{w.driver_upi_id || '—'}</td>
                  <td className="py-2">
                    {w.driver_kyc_approved ? (
                      <span className="tag border-emerald-500/40 text-emerald-300">ok</span>
                    ) : (
                      <span className="tag border-red-500/40 text-red-300">not approved</span>
                    )}
                  </td>
                  <td className="py-2 font-semibold">₹{w.amount}</td>
                  <td className="py-2">
                    <span className={`tag capitalize ${STATUS_STYLES[w.status] ?? 'border-white/20'}`}>
                      {w.status}
                    </span>
                  </td>
                  <td className="py-2 text-white/60">
                    {w.requested_at ? new Date(w.requested_at).toLocaleString() : '—'}
                  </td>
                  <td className="py-2 font-mono text-xs text-white/50">
                    {w.payout_reference_id || '—'}
                  </td>
                  <td className="py-2 whitespace-nowrap">
                    {w.status === 'pending' && (
                      <>
                        <button
                          className="btn-ghost text-brand text-xs disabled:opacity-40"
                          disabled={busyId === w.id || !w.driver_kyc_approved}
                          title={
                            w.driver_kyc_approved
                              ? 'Approve and dispatch payout'
                              : 'Driver KYC is not approved — cannot pay out'
                          }
                          onClick={() => approve(w)}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-ghost text-red-300 text-xs ml-2 disabled:opacity-40"
                          disabled={busyId === w.id}
                          onClick={() => reject(w)}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-4 text-white/50">
                    No {statusFilter || ''} withdrawals.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
