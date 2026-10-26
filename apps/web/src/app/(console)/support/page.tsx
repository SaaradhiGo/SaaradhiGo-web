'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Empty, PageHeader, Panel, Pill, Table } from '@/components/console/ui';

/**
 * Riders and drivers waiting for an answer.
 *
 * THE STATUS VALUES ARE UPPERCASE and the backend validates nothing —
 * `servers/support/views.py` does `qs.filter(status=status_filter)` with no
 * check, so a lowercase value matches zero rows and returns a confident
 * empty list. The filters here send exactly what the model stores.
 */
type Ticket = {
  id: number;
  issue_type: string;
  status: string;
  description?: string;
  created_at?: string;
  assigned_to?: unknown;
  user_id?: number | { phone_number?: string; full_name?: string };
};

type Page = { count?: number; next?: string | null; results?: Ticket[] };

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'OPEN', label: 'Open' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'WAITING_USER', label: 'Waiting on them' },
  { key: 'CLOSED', label: 'Closed' },
] as const;

const TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  OPEN: 'bad',
  IN_PROGRESS: 'wait',
  WAITING_USER: 'neutral',
  CLOSED: 'good',
};

const when = (s?: string) => (s ? s.replace('T', ' ').slice(0, 16) : '—');

/** How long it has been waiting, which is the thing that matters. */
function waiting(iso?: string) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return '—';
  const hours = Math.floor(ms / 3600000);
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function raisedBy(t: Ticket) {
  const u = typeof t.user_id === 'object' && t.user_id ? t.user_id : null;
  return u?.full_name?.trim() || u?.phone_number
    || (typeof t.user_id === 'number' ? `#${t.user_id}` : '—');
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [status, setStatus] = useState('OPEN');
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTickets(null);
    setError(null);
    try {
      const query = new URLSearchParams({ page_size: '100' });
      if (status) query.set('status', status);
      const page = await api.get<Page>(`/support/admin/tickets/?${query}`);
      const list = Array.isArray(page?.results) ? page.results
        : (Array.isArray(page) ? (page as unknown as Ticket[]) : []);
      setTickets(list);
      setTotal(typeof page?.count === 'number' ? page.count : null);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the tickets.');
      setTickets([]);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHeader
        title="Support"
        subtitle={total !== null ? `${total} ticket${total === 1 ? '' : 's'}` : undefined}
        actions={FILTERS.map((f) => (
          <button
            key={f.key || 'all'}
            className={f.key === status ? 'btn-secondary' : 'btn-ghost'}
            onClick={() => setStatus(f.key)}
          >
            {f.label}
          </button>
        ))}
      />

      {error && <div className="alert-error mb-5" role="alert">{error}</div>}

      <Panel flush>
        {tickets === null ? (
          <Empty title="Loading…" />
        ) : tickets.length === 0 ? (
          <Empty
            error={Boolean(error)}
            title={error ? 'The tickets could not be loaded' : 'Nothing here'}
            detail={error
              ? 'This is not the same as there being no tickets.'
              : status === 'OPEN' ? 'Nobody is waiting for an answer.' : undefined}
          />
        ) : (
          <Table head={<>
            <th>Ticket</th><th>Issue</th><th>Raised by</th>
            <th>What they said</th><th>Status</th><th>Waiting</th>
          </>}>
            {tickets.map((t) => (
              <tr key={t.id}>
                <td><Link href={`/support/${t.id}`}>#{t.id}</Link></td>
                <td>{t.issue_type?.replace(/_/g, ' ') || '—'}</td>
                <td>{raisedBy(t)}</td>
                <td className="max-w-[26rem] truncate" title={t.description}>
                  {t.description || '—'}
                </td>
                <td><Pill tone={TONE[t.status] ?? 'neutral'}>{t.status?.replace(/_/g, ' ')}</Pill></td>
                <td title={when(t.created_at)}>
                  {t.status === 'CLOSED' ? '—' : waiting(t.created_at)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </>
  );
}
