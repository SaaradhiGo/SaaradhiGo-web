'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import { FRAUD_KIND_WORDS, SIGNAL_WORDS, canReadFraud, type FraudFlag } from '@/lib/promotions';
import { NoAccess, PromotionsNav } from '@/components/console/promotions';
import { messageOf } from '@/components/console/notifications';
import {
  DataTable, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Promotions: fraud flags (read-only).
 *
 * Today the one producer is a blocked referral reward. The list names the person by a masked
 * reference and the signals that matched (the same device, phone number or payment instrument);
 * it never shows a value. Reviewing and actioning a flag arrives with Fraud & Risk.
 */
type Payload = { count: number; results: FraudFlag[] };

const TONE = { open: 'wait', dismissed: 'neutral', confirmed: 'bad' } as const;
const WORDS = { open: 'Open', dismissed: 'Dismissed', confirmed: 'Confirmed' } as const;

function evidenceWords(f: FraudFlag): string {
  const signals = (f.evidence.signals ?? []).map((s) => SIGNAL_WORDS[s] ?? s.replace(/_/g, ' '));
  const list = signals.length ? signals.join(', ') : 'no signal named';
  const trips = f.evidence.trips_completed != null ? ` · ${f.evidence.trips_completed} trips completed` : '';
  const ref = f.evidence.referral_id != null ? `Referral #${f.evidence.referral_id}: ` : '';
  return `${ref}${list}${trips}`;
}

export default function FraudFlagsPage() {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const [rows, setRows] = useState<FraudFlag[] | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const may = canReadFraud(access);

  const load = useCallback(async () => {
    setError(null);
    const query = new URLSearchParams({ limit: '100' });
    if (status) query.set('status', status);
    try {
      const data = await api.get<Payload>(withScope(`/fraud/admin/flags/?${query.toString()}`));
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      setRows(null);
      setError(messageOf(err, 'The flags could not be loaded.'));
    }
  }, [status]);
  useEffect(() => { if (may) void load(); }, [load, may]);

  const columns = useMemo(() => [
    { key: 'who', label: 'Person', width: '11rem', sortValue: (f: FraudFlag) => f.subject.ref, render: (f: FraudFlag) => <b>{f.subject.ref}</b> },
    { key: 'kind', label: 'Kind', width: '11rem', sortValue: (f: FraudFlag) => f.kind, render: (f: FraudFlag) => FRAUD_KIND_WORDS[f.kind] ?? f.kind },
    { key: 'what', label: 'What matched', render: (f: FraudFlag) => <span className="pm-wrap">{evidenceWords(f)}</span> },
    { key: 'where', label: 'Where', width: '9rem', hideBelow: 1100 as const, sortValue: (f: FraudFlag) => f.scope_name ?? '', render: (f: FraudFlag) => f.scope_name ?? 'Unplaced' },
    { key: 'status', label: 'Status', width: '9rem', sortValue: (f: FraudFlag) => f.status,
      render: (f: FraudFlag) => <Pill tone={TONE[f.status]}>{WORDS[f.status]}</Pill> },
    { key: 'when', label: 'Raised', width: '10rem', hideBelow: 1280 as const, sortValue: (f: FraudFlag) => f.created_at, render: (f: FraudFlag) => stamp(f.created_at) },
  ], []);

  if (!canOpen(access, 'promotions') || !may) {
    return (<><PageHeader title="Promotions" /><NoAccess what="Fraud flags" /></>);
  }

  return (
    <>
      <PageHeader title="Promotions"
        subtitle="Fraud flags raised by promotions. A blocked referral reward lands here, with the signals that matched. Read-only for now." />
      <PromotionsNav />

      <Panel title="Fraud flags" flush>
        <TableToolbar summary={rows ? `${rows.length} of ${count} flag${count === 1 ? '' : 's'}` : null}
          density={density} onDensity={setDensity}>
          <div className="nf-filters">
            <label className="sr-only" htmlFor="ff-status">Status</label>
            <select id="ff-status" className="ops-select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Any status</option>
              <option value="open">Open</option>
              <option value="dismissed">Dismissed</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </div>
        </TableToolbar>
        {error ? (
          <ErrorState title="The flags could not be loaded" detail={error} onRetry={() => void load()} />
        ) : rows === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the flags</span>
            <Skeleton kind="row" count={4} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title={status ? 'No flags match' : 'No flags'}
            detail={status ? 'Nothing matches that status in your scope.' : 'Nothing has been flagged in your scope.'} />
        ) : (
          <DataTable caption="Fraud flags" rows={rows} columns={columns} rowKey={(f) => f.id} density={density}
            defaultSort={{ key: 'when', dir: 'desc' }} maxHeight={false} />
        )}
      </Panel>
    </>
  );
}
