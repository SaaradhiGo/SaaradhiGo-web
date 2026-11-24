'use client';

import { useEffect, useState } from 'react';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import { api } from '@/lib/api';
import { messageOf } from '@/components/console/notifications';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { Revealable } from '@/components/console/Revealable';

/**
 * Drivers › Applications (17 Nov): people who applied to drive before sign-up opened, in your
 * cities, newest first. Call each one when driver sign-up opens; they have no account yet.
 */
type Application = {
  id: number; full_name: string; phone_number: string; email: string; city: string;
  city_code: string; vehicle_type: string; created_at: string;
};

const COLUMNS: ListColumn<Application>[] = [
  { key: 'name', label: 'Name', primary: true, render: (a) => a.full_name },
  { key: 'phone', label: 'Mobile', render: (a) => (
    <Revealable value={a.phone_number} label="applicant phone" target={{ type: 'driver_application', id: a.id }} field="phone_number" compact
      render={(v) => (v ? <a href={`tel:${String(v)}`}>{String(v)}</a> : 'Not on file')} />
  ) },
  { key: 'city', label: 'City', render: (a) => a.city },
  { key: 'vehicle', label: 'Vehicle', render: (a) => a.vehicle_type },
  { key: 'email', label: 'Email', render: (a) => (a.email
    ? <Revealable value={a.email} label="applicant email" target={{ type: 'driver_application', id: a.id }} field="email" compact />
    : '—') },
  { key: 'when', label: 'Applied', render: (a) => stamp(a.created_at, timeZoneFor(a.city_code)) },
];

export default function DriverApplicationsPage() {
  const [rows, setRows] = useState<Application[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ count: number; results: Application[] }>('/platform/admin/driver-applications/')
      .then((d) => { setRows(d.results); setTotal(d.count); })
      .catch((err) => setError(messageOf(err, 'Applications could not be loaded.')))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ListPage<Application>
      pageKey="driver-applications"
      title="Driver applications"
      summary="People who applied to drive before sign-up opened. They have no account yet: call them when driver sign-up opens. Numbers are masked; Reveal is logged with your name."
      views={[{ key: 'all', label: 'All', count: total }]}
      view="all"
      onView={() => undefined}
      columns={COLUMNS}
      rows={rows}
      rowKey={(a) => a.id}
      total={total}
      page={1}
      pageSize={500}
      onPage={() => undefined}
      loading={loading}
      error={error}
      empty="No applications yet."
    />
  );
}
