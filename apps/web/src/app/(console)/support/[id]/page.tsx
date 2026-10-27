'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { currentScope, getCachedAccess } from '@/lib/adminScope';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { ButtonLink } from '@/components/sg/Button';
import {
  Empty,
  ErrorState,
  Fact,
  Facts,
  PageHeader,
  Panel,
  Pill,
  Skeleton,
} from '@/components/console/ui';

/**
 * One ticket: what they said, what has been said back, and the reply.
 *
 * The thread reads like a conversation -- theirs on the left, ours on the
 * right in the gold wash, the system's in the middle -- because that is
 * how the person on the other end sees it. The reply box is the one gold
 * action on the page; assigning is a quieter, secondary thing.
 */
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

const STATUSES: Array<[Ticket['status'], string]> = [
  ['OPEN', 'Open'],
  ['IN_PROGRESS', 'In progress'],
  ['WAITING_USER', 'Waiting on them'],
  ['CLOSED', 'Closed'],
];

const TONE: Record<Ticket['status'], 'good' | 'bad' | 'wait' | 'neutral'> = {
  OPEN: 'bad', IN_PROGRESS: 'wait', WAITING_USER: 'neutral', CLOSED: 'good',
};

const words = (s: string) => s.replace(/_/g, ' ').toLowerCase();

function raisedBy(t: Ticket) {
  const u = typeof t.user_id === 'object' && t.user_id ? t.user_id : null;
  return u?.full_name?.trim() || u?.phone_number
    || (typeof t.user_id === 'number' ? `User #${t.user_id}` : '—');
}

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
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const tz = timeZoneFor(currentScope(getCachedAccess())?.code);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Admin uses the user-side detail endpoint; the backend grants access
      // when request.user.is_staff (ticket_detail in servers/support/views.py).
      setTicket(await api.get<Ticket>(`/support/tickets/${id}/`));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this ticket.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function postReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true); setNotice(null); setActionError(null);
    try {
      const body: { body: string; status?: string } = { body: reply.trim() };
      if (replyStatus) body.status = replyStatus;
      await api.post(`/support/admin/tickets/${id}/reply/`, body);
      setReply('');
      setReplyStatus('');
      setNotice('Reply posted. They will see it in the app.');
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer ? err.message : 'The reply did not go through.');
    } finally {
      setBusy(false);
    }
  }

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignTo) return;
    setBusy(true); setNotice(null); setActionError(null);
    try {
      await api.post(`/support/admin/tickets/${id}/assign/`, { assigned_to: Number(assignTo) });
      setAssignTo('');
      setNotice('Assigned.');
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError && err.fromServer ? err.message : 'The assignment did not go through.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the ticket</span>
        <PageHeader title={`Ticket #${id}`} />
        <div className="ops-review">
          <Skeleton kind="block" />
          <Skeleton kind="block" />
        </div>
      </div>
    );
  }
  if (error || !ticket) {
    return (
      <>
        <PageHeader title={`Ticket #${id}`} actions={<ButtonLink href="/support" variant="ghost" size="sm">All tickets</ButtonLink>} />
        <ErrorState title="This ticket could not be loaded" detail={error ?? undefined} onRetry={() => void load()} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Ticket #${ticket.id}`}
        subtitle={
          <>
            <span className="capitalize">{words(ticket.issue_type)}</span>
            {' · raised by '}{raisedBy(ticket)}
            {' · opened '}{stamp(ticket.created_at, tz)}
            {ticket.trip_id ? <> · <Link href={`/trips/${ticket.trip_id}`} className="sg-link">Trip #{ticket.trip_id}</Link></> : null}
          </>
        }
        actions={
          <>
            <Pill tone={TONE[ticket.status]}>{words(ticket.status)}</Pill>
            <ButtonLink href="/support" variant="ghost" size="sm">All tickets</ButtonLink>
          </>
        }
      />

      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}
      {actionError && <div className="alert-error mb-4" role="alert">{actionError}</div>}

      <div className="ops-review">
        <div className="grid gap-4">
          <Panel title={`Conversation · ${ticket.messages.length} message${ticket.messages.length === 1 ? '' : 's'}`}>
            {ticket.description ? (
              <div className="ops-msg mb-3">
                <div className="ops-msg__meta">
                  <span>{raisedBy(ticket)} · opened the ticket</span>
                  <time dateTime={ticket.created_at}>{stamp(ticket.created_at, tz)}</time>
                </div>
                <p className="ops-msg__body">{ticket.description}</p>
              </div>
            ) : null}
            {ticket.messages.length === 0 && !ticket.description ? (
              <Empty title="Nothing said yet" />
            ) : (
              <div className="ops-thread">
                {ticket.messages.map((m) => {
                  const kind = m.author_role === 'support' ? 'support' : m.author_role === 'system' ? 'system' : 'user';
                  return (
                    <div key={m.id} className={`ops-msg ops-msg--${kind}`}>
                      <div className="ops-msg__meta">
                        <span>{kind === 'support' ? 'Support' : kind === 'system' ? 'System' : (m.author_name || raisedBy(ticket))}</span>
                        <time dateTime={m.created_at}>{stamp(m.created_at, tz)}</time>
                      </div>
                      <p className="ops-msg__body">{m.body}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          {ticket.status !== 'CLOSED' ? (
            <Panel title="Reply">
              <form className="ops-form" onSubmit={postReply}>
                <label className="sr-only" htmlFor="ticket-reply">Your reply</label>
                <textarea
                  id="ticket-reply"
                  className="input"
                  rows={4}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Write to them the way you would want to be written to."
                />
                <div className="ops-form__row">
                  <label className="ops-form__label" htmlFor="ticket-status">Then mark as</label>
                  <select
                    id="ticket-status"
                    className="ops-select"
                    value={replyStatus}
                    onChange={(e) => setReplyStatus(e.target.value as Ticket['status'])}
                  >
                    <option value="">No change</option>
                    {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <span style={{ flex: 1 }} />
                  <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || !reply.trim()}>
                    {busy ? 'Posting…' : 'Post reply'}
                  </button>
                </div>
              </form>
            </Panel>
          ) : (
            <Panel title="Reply">
              <p className="help m-0">This ticket is closed. Reopen it by replying with a new status from the list? Not yet — ask the person to raise a new one.</p>
            </Panel>
          )}
        </div>

        <div className="grid gap-4">
          <Panel title="Ticket">
            <Facts>
              <Fact label="Status"><Pill tone={TONE[ticket.status]}>{words(ticket.status)}</Pill></Fact>
              <Fact label="Issue"><span className="capitalize">{words(ticket.issue_type)}</span></Fact>
              <Fact label="Raised by">{raisedBy(ticket)}</Fact>
              <Fact label="Opened">{stamp(ticket.created_at, tz)}</Fact>
              <Fact label="Last update">{stamp(ticket.updated_at, tz)}</Fact>
              {ticket.resolved_at ? <Fact label="Resolved">{stamp(ticket.resolved_at, tz)}</Fact> : null}
              <Fact label="Trip">{ticket.trip_id ? <Link href={`/trips/${ticket.trip_id}`}>#{ticket.trip_id}</Link> : 'None attached'}</Fact>
              <Fact label="Assigned to">{ticket.assigned_to ? `Staff #${ticket.assigned_to}` : 'Nobody yet'}</Fact>
            </Facts>
          </Panel>

          <Panel title="Assign">
            <form className="ops-form" onSubmit={assign}>
              <label className="ops-form__label" htmlFor="ticket-assign">Staff user ID</label>
              <div className="ops-form__row">
                <input
                  id="ticket-assign"
                  type="number"
                  inputMode="numeric"
                  className="input"
                  style={{ maxWidth: '12rem' }}
                  value={assignTo}
                  onChange={(e) => setAssignTo(e.target.value)}
                  placeholder="e.g. 42"
                />
                <button type="submit" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy || !assignTo}>
                  {busy ? 'Assigning…' : 'Assign'}
                </button>
              </div>
              <p className="help m-0">By ID until the console has a staff picker.</p>
            </form>
          </Panel>
        </div>
      </div>
    </>
  );
}
