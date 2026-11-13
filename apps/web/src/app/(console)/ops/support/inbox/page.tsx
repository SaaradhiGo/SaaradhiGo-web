'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { stamp } from '@/lib/consoleTime';
import type { InboxItem } from '@/lib/supportDesk';
import { ButtonLink } from '@/components/sg/Button';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';

/**
 * Your inbox: things that came back to you.
 *
 * Today that is one kind: a refund you asked for on a ticket was turned down
 * (or withdrawn, or lapsed) and the ticket is yours again. The rider was not
 * told anything; the reason is in the ticket's internal notes. Unread items
 * drive the badge in the header. Marking read is yours alone.
 */
type Inbox = { unread: number; results: InboxItem[] };

const failure = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.fromServer ? err.message : fallback;

export default function InboxPage() {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [view, setView] = useState('all');

  const load = useCallback(async () => {
    setInbox(null);
    setError(null);
    try {
      setInbox(await api.get<Inbox>('/support/admin/inbox/'));
    } catch (err) {
      setError(failure(err, 'We could not load your inbox.'));
      setInbox({ unread: 0, results: [] });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function markAllRead() {
    setBusy(true);
    setNotice(null);
    try {
      await api.post('/support/admin/inbox/read/', { all: true });
      setNotice('Marked as read.');
      await load();
    } catch (err) {
      setError(failure(err, 'They were not marked as read.'));
    } finally {
      setBusy(false);
    }
  }

  const all = inbox?.results ?? [];
  const items = view === 'unread' ? all.filter((i) => !i.read) : all;

  const columns: ListColumn<InboxItem>[] = [
    { key: 'state', label: 'State', width: '6rem', render: (i) => (i.read ? <StatusChip tone="neutral">Read</StatusChip> : <StatusChip tone="info">New</StatusChip>) },
    { key: 'when', label: 'When', width: '10rem', num: true, render: (i) => stamp(i.created_at) },
    { key: 'text', label: 'Message', primary: true, render: (i) => i.text },
    { key: 'ticket', label: 'Ticket', width: '9rem', render: (i) => (i.ticket_id ? <Link href={`/ops/support/${i.ticket_id}`}>Open ticket #{i.ticket_id}</Link> : <span className="muted">—</span>) },
  ];

  return (
    <>
      {notice && <div className="alert-success mb-5" role="status"><b>{notice}</b></div>}
      <ListPage<InboxItem>
        pageKey="support-inbox"
        title="Inbox"
        summary="Refund requests that came back to you. The rider was not told; the reason is in the ticket's internal notes."
        views={[
          { key: 'all', label: 'All', count: inbox ? all.length : null },
          { key: 'unread', label: 'Unread', count: inbox ? inbox.unread : null },
        ]}
        view={view}
        onView={setView}
        actionsSlot={(
          <>
            <button
              type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
              onClick={() => void markAllRead()} disabled={busy || !inbox || inbox.unread === 0}
            >{busy ? 'Marking…' : 'Mark all read'}</button>
            <ButtonLink href="/ops/support?queue=returned" variant="ghost" size="sm">Returned to you</ButtonLink>
          </>
        )}
        columns={columns}
        rows={items}
        rowKey={(i) => i.id}
        total={inbox ? items.length : null}
        page={1}
        pageSize={Math.max(items.length, 1)}
        onPage={() => undefined}
        loading={inbox === null}
        error={error ? `${error} This is not the same as it being empty.` : null}
        empty={view === 'unread' ? 'Nothing unread.' : 'Nothing here. No refund request has come back to you.'}
      />
    </>
  );
}
