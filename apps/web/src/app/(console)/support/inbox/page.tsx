'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { stamp } from '@/lib/consoleTime';
import type { InboxItem } from '@/lib/supportDesk';
import { ButtonLink } from '@/components/sg/Button';
import {
  Empty, ErrorState, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

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

  const items = inbox?.results ?? [];

  return (
    <>
      <PageHeader
        title="Inbox"
        subtitle="Refund requests that came back to you. The rider was not told; the reason is in the ticket's internal notes."
        actions={
          <>
            <button
              type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
              onClick={() => void markAllRead()} disabled={busy || !inbox || inbox.unread === 0}
            >{busy ? 'Marking…' : 'Mark all read'}</button>
            <ButtonLink href="/support?queue=returned" variant="ghost" size="sm">Returned to you</ButtonLink>
          </>
        }
      />
      {notice && <div className="alert-success mb-5" role="status"><b>{notice}</b></div>}

      <Panel flush>
        {inbox === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading your inbox</span>
            <Skeleton kind="row" count={4} />
          </div>
        ) : error ? (
          <div className="p-4">
            <ErrorState title="Your inbox could not be loaded" detail={`${error} This is not the same as it being empty.`} onRetry={() => void load()} />
          </div>
        ) : items.length === 0 ? (
          <Empty title="Nothing here" detail="No refund request has come back to you." />
        ) : (
          <ul className="ops-inbox" aria-label="Inbox">
            {items.map((item) => (
              <li key={item.id} className="ops-inbox__item">
                <div>
                  {item.read ? <Pill>Read</Pill> : <Pill tone="wait">New</Pill>}{' '}
                  <span className="ops-inbox__when">{stamp(item.created_at)}</span>
                </div>
                <p className="ops-inbox__text">{item.text}</p>
                {item.ticket_id ? <Link href={`/support/${item.ticket_id}`}>Open ticket #{item.ticket_id}</Link> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
