'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';

type Message = {
  id: number;
  author: number | null;
  author_role: 'user' | 'support' | 'system';
  author_name: string | null;
  body: string;
  created_at: string;
};

type Ticket = {
  id: number;
  user_id: number | { phone_number?: string; full_name?: string } | null;
  trip_id: number | null;
  issue_type: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_USER' | 'CLOSED';
  description: string | null;
  assigned_to: number | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  messages: Message[];
};

const STATUS_OPTIONS: Ticket['status'][] = ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'CLOSED'];

const fmt = (s: string | null | undefined) => (s ? s.replace('T', ' ').slice(0, 19) : '—');

export default function SupportTicketDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [replyStatus, setReplyStatus] = useState<Ticket['status'] | ''>('');
  const [assignTo, setAssignTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Admin uses the user-side detail endpoint; backend already
      // grants access when request.user.is_staff (see ticket_detail
      // in servers/support/views.py).
      const t = await api.get<Ticket>(`/support/tickets/${id}/`);
      setTicket(t);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load ticket');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function postReply() {
    if (!reply.trim()) return;
    setBusy(true); setActionMsg(null); setActionErr(null);
    try {
      const body: { body: string; status?: string } = { body: reply.trim() };
      if (replyStatus) body.status = replyStatus;
      await api.post(`/support/admin/tickets/${id}/reply/`, body);
      setReply('');
      setReplyStatus('');
      setActionMsg('Reply posted.');
      load();
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : 'Reply failed');
    } finally {
      setBusy(false);
    }
  }

  async function assign() {
    if (!assignTo) return;
    setBusy(true); setActionMsg(null); setActionErr(null);
    try {
      await api.post(`/support/admin/tickets/${id}/assign/`, {
        assigned_to: Number(assignTo),
      });
      setAssignTo('');
      setActionMsg('Assigned.');
      load();
    } catch (err) {
      setActionErr(err instanceof ApiError ? err.message : 'Assign failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-white/60">Loading...</p>;
  if (error) return <p className="text-red-400">{error}</p>;
  if (!ticket) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/support" className="btn-ghost text-xs">&larr; Back to tickets</Link>
        <h1 className="text-2xl font-semibold mt-1">
          Ticket #{ticket.id} &mdash; {ticket.issue_type}
          <span className="ml-3 tag border-white/20 text-sm">{ticket.status}</span>
        </h1>
        <p className="text-white/50 text-sm mt-1">
          Opened {fmt(ticket.created_at)} &middot; last updated {fmt(ticket.updated_at)}
          {ticket.resolved_at && <> &middot; resolved {fmt(ticket.resolved_at)}</>}
          {ticket.trip_id && (
            <> &middot; <Link href={`/trips/${ticket.trip_id}`} className="text-brand hover:underline">Trip #{ticket.trip_id}</Link></>
          )}
        </p>
      </div>
      {actionMsg && <p className="text-emerald-400 text-sm">{actionMsg}</p>}
      {actionErr && <p className="text-red-400 text-sm">{actionErr}</p>}

      {/* Description */}
      {ticket.description && (
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-2">Description</h2>
          <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      {/* Thread */}
      <div className="card">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">
          Thread ({ticket.messages.length} messages)
        </h2>
        <div className="space-y-3">
          {ticket.messages.map((m) => {
            const isSupport = m.author_role === 'support';
            const isSystem = m.author_role === 'system';
            return (
              <div key={m.id} className={`text-sm rounded-lg p-3 ${
                isSystem ? 'bg-white/5 italic text-white/60 text-center text-xs'
                : isSupport ? 'bg-brand/10 border border-brand/30'
                : 'bg-ink-800 border border-white/5'
              }`}>
                <div className="flex justify-between items-baseline">
                  <span className={`text-xs uppercase tracking-widest ${isSupport ? 'text-brand' : 'text-white/50'}`}>
                    {isSupport ? 'Support' : isSystem ? 'System' : (m.author_name || 'User')}
                  </span>
                  <span className="text-xs text-white/40">{fmt(m.created_at)}</span>
                </div>
                <div className="mt-1 whitespace-pre-wrap">{m.body}</div>
              </div>
            );
          })}
          {ticket.messages.length === 0 && (
            <p className="text-white/50 text-sm">No messages yet.</p>
          )}
        </div>
      </div>

      {/* Reply form */}
      {ticket.status !== 'CLOSED' && (
        <div className="card">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Post a reply</h2>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type your reply to the user..."
            rows={4}
            className="input w-full resize-y"
          />
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <label className="text-sm text-white/60">Move to:</label>
            <select
              className="input"
              value={replyStatus}
              onChange={(e) => setReplyStatus(e.target.value as Ticket['status'])}
            >
              <option value="">— no status change —</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={postReply}
              disabled={busy || !reply.trim()}
              className="btn-primary"
            >
              {busy ? 'Posting...' : 'Post reply'}
            </button>
          </div>
        </div>
      )}

      {/* Assign */}
      <div className="card">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-white/70 mb-3">Assign</h2>
        <p className="text-white/50 text-sm mb-3">
          {ticket.assigned_to ? `Currently assigned to user #${ticket.assigned_to}.` : 'Unassigned.'}
        </p>
        <div className="flex gap-3">
          <input
            type="number"
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
            placeholder="Staff user ID"
            className="input flex-1 max-w-xs"
          />
          <button
            onClick={assign}
            disabled={busy || !assignTo}
            className="btn-primary"
          >
            {busy ? 'Assigning...' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}
