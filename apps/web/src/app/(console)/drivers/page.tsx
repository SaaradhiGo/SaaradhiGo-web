'use client';

import Link from 'next/link';
import { withScope } from '@/lib/adminScope';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Empty, PageHeader, Panel, Pill, Table, Filters } from '@/components/console/ui';

/**
 * The fleet, and who is waiting on a decision.
 *
 * WHAT CHANGED
 * It read page one and stopped — the backend paginates at 10, so an
 * eleventh driver was invisible with nothing on screen to say so. It also
 * offered an inline "Approve" button that approved a driver from a list
 * row, without the operator having seen a single document. That is the
 * action this product most needs somebody to think before taking, so it is
 * gone: the decision lives on the driver's own page, next to the evidence.
 *
 * The filter is in the URL so the dashboard can link straight to the
 * queue that matters — `/drivers?approved=false`.
 */
type Person = { phone_number?: string; full_name?: string; email?: string };

type Driver = {
  id: number;
  /**
   * `DriverAdminListSerializer` returns the person as `user_details`.
   * This page read `user_id`, which on that payload is absent -- so every
   * row rendered as "Driver #<id>" with a dash for the phone number, and
   * the drivers queue has never shown a single name. Found by driving the
   * console in a browser; no test noticed, because the page rendered
   * perfectly well with nothing in it.
   *
   * Both are accepted: other admin payloads nest the person under
   * `user_id`, and a console that works against one shape and silently
   * blanks on the other is how this happened in the first place.
   */
  user_details?: Person;
  user_id?: Person | number;
  status?: string;
  approved?: boolean;
  doc_status?: string | null;
  ratings?: string | number;
  total_trips?: number;
  fatigue_lockout_until?: string | null;
};

type Page = { count?: number; next?: string | null; results?: Driver[] };

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'false', label: 'Awaiting review' },
  { key: 'true', label: 'Approved' },
] as const;

function who(d: Driver) {
  const u = d.user_details
    ?? (typeof d.user_id === 'object' && d.user_id ? d.user_id : null);
  return {
    name: u?.full_name?.trim() || null,
    phone: u?.phone_number || null,
    email: u?.email || null,
  };
}

function DriversInner() {
  const router = useRouter();
  const search = useSearchParams();
  const approved = search.get('approved') ?? '';

  const [drivers, setDrivers] = useState<Driver[] | null>(null);

  // Whether the SERVER masked what it sent, not whether we think it should
  // have. The payload is the only honest source: an operator holding
  // `pii.view` receives the real number and there is nothing to announce.
  const maskedContacts = (drivers ?? []).some(
    (d) => (who(d).phone ?? '').includes('•'),
  );
  const [total, setTotal] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDrivers(null);
    setError(null);
    try {
      const query = new URLSearchParams({ page_size: '50' });
      if (approved) query.set('approved', approved);
      const page = await api.get<Page>(withScope(`/driver/admin/?${query}`));
      const list = Array.isArray(page?.results) ? page.results
        : (Array.isArray(page) ? (page as unknown as Driver[]) : []);
      setDrivers(list);
      setTotal(typeof page?.count === 'number' ? page.count : null);
      // Said out loud rather than silently truncating, which is what the
      // previous version did at ten rows.
      setMore(Boolean(page?.next));
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load the drivers.');
      setDrivers([]);
    }
  }, [approved]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHeader
        title="Drivers"
        subtitle={total !== null
          ? `${total} ${approved === 'false' ? 'awaiting review' : approved === 'true' ? 'approved' : 'on file'}`
          : undefined}
        actions={
          <Filters
            value={approved as (typeof FILTERS)[number]['key']}
            options={FILTERS}
            onChange={(key) => router.push(key ? `/drivers?approved=${key}` : '/drivers')}
          />
        }
      />

      {error && <div className="alert-error mb-5" role="alert">{error}</div>}

      <Panel flush>
        {drivers === null ? (
          <Empty title="Loading…" />
        ) : drivers.length === 0 ? (
          <Empty
            error={Boolean(error)}
            title={error ? 'The list could not be loaded' : 'No drivers here'}
            detail={error
              ? 'This is not the same as there being none.'
              : approved === 'false'
                ? 'Nothing is waiting on a decision.'
                : undefined}
          />
        ) : (
          <Table head={<>
            <th>Driver</th>
            <th>
              Contact
              {/* Said once in the header rather than decorating every
                  row: an operator who cannot see contact details needs
                  to know that the dots are policy, not missing data. */}
              {maskedContacts && (
                <span className="th-note" title="Your role cannot see full contact details">
                  masked
                </span>
              )}
            </th>
            <th>Review</th>
            <th>State</th>
            <th className="num">Trips</th>
            <th className="num">Rating</th>
          </>}>
            {drivers.map((d) => {
              const person = who(d);
              const locked = Boolean(d.fatigue_lockout_until
                && new Date(d.fatigue_lockout_until).getTime() > Date.now());
              return (
                <tr key={d.id}>
                  <td>
                    <Link href={`/drivers/${d.id}`}>
                      {person.name || `Driver #${d.id}`}
                    </Link>
                  </td>
                  <td>{person.phone || person.email || '—'}</td>
                  <td>
                    {d.approved
                      ? <Pill tone="good">Approved</Pill>
                      : d.doc_status === 'rejected'
                        ? <Pill tone="bad">Sent back</Pill>
                        : <Pill tone="wait">Awaiting review</Pill>}
                  </td>
                  <td>
                    {locked
                      ? <Pill tone="bad">Rest period</Pill>
                      : <Pill tone={d.status === 'online' ? 'good' : 'neutral'}>
                          {d.status || 'off'}
                        </Pill>}
                  </td>
                  <td className="num">{d.total_trips ?? 0}</td>
                  <td className="num">
                    {Number(d.ratings ?? 0) > 0 ? Number(d.ratings).toFixed(2) : '—'}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      {more && (
        <p className="help mt-3">
          Showing the first 50. Narrow the list with the filters above —
          this page does not yet page through a larger fleet.
        </p>
      )}
    </>
  );
}

export default function DriversPage() {
  return (
    <Suspense fallback={<p className="text-ink-subtle">Loading…</p>}>
      <DriversInner />
    </Suspense>
  );
}
