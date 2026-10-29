'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import {
  DecisionPanel,
  DocumentList,
  ReviewDocument,
} from '@/components/console/DriverReview';
import { ButtonLink } from '@/components/sg/Button';
import { Revealable } from '@/components/console/Revealable';
import { currentScope, getCachedAccess } from '@/lib/adminScope';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  Column,
  DataTable,
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
 * One driver, as a decision.
 *
 * THE OLD SCREEN WAS A DATA DUMP. Three equal cards of label-over-value
 * pairs, a vehicle table of expiry dates, and "Approve KYC" as a text link
 * in the corner — next to "License doc —", because the console had no way
 * to open a document at all. An operator was asked to decide whether
 * somebody may carry paying passengers while looking at em-dashes, and the
 * rejection reason was collected with `window.prompt()`.
 *
 * This page is now organised around the one thing it is for. The decision
 * and the evidence sit together; everything else is supporting detail
 * below. The checklist is the server's, computed from the same compliance
 * rules the driver sees, so the two cannot disagree.
 */
type Doc = { key: string; label: string; description?: string; present: boolean; recordable: boolean };

type DriverDetail = {
  id: number;
  status: string;
  approved: boolean;
  doc_status?: string | null;
  doc_rejection_reason?: string | null;
  ratings: string;
  total_trips: number;
  license_expiry: string | null;
  license_doc_url: string | null;
  license_doc_back_url: string | null;
  upi_id: string | null;
  user: {
    id: number; phone_number: string | null; full_name: string | null;
    email: string | null; is_active: boolean | null;
  };
  active_vehicle_id: number | null;
  vehicles: Array<{
    id: number; type: string | null; brand: string | null; model: string | null;
    color: string | null; vehicle_number: string | null; status: string;
    insurance_expiry: string | null; permit_expiry: string | null;
    fitness_expiry: string | null; puc_expiry: string | null;
    is_active_vehicle: boolean;
    rc_doc_url?: string | null; insurance_doc_url?: string | null;
    permit_doc_url?: string | null; fitness_doc_url?: string | null;
    puc_doc_url?: string | null; inspection_doc_url?: string | null;
    vehicle_pic_url?: string | null;
  }>;
  compliance?: {
    country: string;
    driver_documents: Doc[];
    vehicle_documents: Doc[];
    missing: string[];
  };
  fatigue: {
    locked: boolean; reason: string; locked_until: string | null;
    active_seconds_24h: number; minutes_until_cap: number;
  } | null;
  cancellations: { last_24h: number; last_7d: number; last_30d: number };
  recent_trips: Array<{
    id: number; status: string | null;
    pickup_address: string | null; destination_address: string | null;
    final_fare: string | null; estimated_fare: string | null;
    requested_at: string | null;
  }>;
  earnings: {
    lifetime: string; today: string; this_month: string;
    wallet_balance: string; currency?: string;
  };
};

const hoursMins = (sec: number) => `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
const isExpired = (iso: string | null) => Boolean(iso) && new Date(iso!).getTime() < Date.now();
const isExpiringSoon = (iso: string | null) =>
  Boolean(iso) && new Date(iso!).getTime() - Date.now() < 1000 * 60 * 60 * 24 * 30;

/** Which signed URL belongs to which checklist row. */
const VEHICLE_DOC_URL: Record<string, string> = {
  rc: 'rc_doc_url',
  registration: 'rc_doc_url',
  insurance: 'insurance_doc_url',
  permit: 'permit_doc_url',
  fitness: 'fitness_doc_url',
  puc: 'puc_doc_url',
  inspection: 'inspection_doc_url',
};

export default function DriverDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<DriverDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const tz = timeZoneFor(currentScope(getCachedAccess())?.code);
  const fmt = (s: string | null | undefined) => stamp(s, tz);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<DriverDetail>(`/driver/admin/${id}/full/`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer
        ? err.message : 'We could not load this driver.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function decide(approved: boolean, reason?: string) {
    setBusy(true);
    setNotice(null);
    setActionError(null);
    try {
      await api.patch(`/driver/admin/${id}/update-kyc/`, {
        approved,
        ...(reason ? { reason } : {}),
      });
      setNotice(approved
        ? 'Approved. This driver can now be dispatched.'
        : 'Sent back. The driver can read your reason on their documents screen.');
      await load();
    } catch (err) {
      // The server refuses approval without the documents and says which
      // are missing. That message is for the operator; show it.
      setActionError(err instanceof ApiError && err.fromServer
        ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the driver</span>
        <PageHeader title={`Driver #${id}`} />
        <div className="ops-review"><Skeleton kind="block" /><Skeleton kind="block" /></div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <>
        <PageHeader title={`Driver #${id}`} actions={<ButtonLink href="/drivers" variant="ghost" size="sm">All drivers</ButtonLink>} />
        <ErrorState title="This driver could not be loaded" detail={error ?? undefined} onRetry={() => void load()} />
      </>
    );
  }

  const name = data.user.full_name?.trim() || data.user.phone_number || `Driver #${data.id}`;
  const tripTone: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
    completed: 'good', cancelled: 'bad', requested: 'wait', accepted: 'wait', in_progress: 'wait',
  };
  const tripColumns: Column<DriverDetail['recent_trips'][number]>[] = [
    { key: 'id', label: 'Trip', width: '5rem', render: (t) => <Link href={`/trips/${t.id}`}>#{t.id}</Link> },
    { key: 'status', label: 'Status', width: '8rem', render: (t) => <Pill tone={tripTone[t.status ?? ''] ?? 'neutral'}>{(t.status ?? '—').replace(/_/g, ' ')}</Pill> },
    { key: 'route', label: 'Pickup → drop', render: (t) => <span title={`${t.pickup_address ?? ''} → ${t.destination_address ?? ''}`}>{t.pickup_address || '—'} <span className="muted">→</span> {t.destination_address || '—'}</span> },
    { key: 'fare', label: 'Fare', num: true, width: '7rem', render: (t) => t.final_fare ?? (t.estimated_fare ? <>{t.estimated_fare}<span className="muted"> est.</span></> : '—') },
    { key: 'when', label: 'Requested', num: true, width: '9.5rem', render: (t) => fmt(t.requested_at) },
  ];
  const vehicle = data.vehicles.find((v) => v.is_active_vehicle) ?? data.vehicles[0] ?? null;
  const compliance = data.compliance;

  // Every reveal on this page is about this one driver.
  const driverTarget = { type: 'driver', id: data.id } as const;
  const openDoc = (url: unknown) => (typeof url === 'string' && url
    ? <a className="ops-doc__open" href={url} target="_blank" rel="noopener noreferrer">Open</a>
    : <span className="ops-doc__missing">No link</span>);

  const driverDocs: ReviewDocument[] = (compliance?.driver_documents ?? []).map((d) => {
    const back = d.key === 'license_back';
    const field = back ? 'license_doc_back_url' : 'license_doc_url';
    return {
      ...d,
      url: back ? data.license_doc_back_url : data.license_doc_url,
      // The server withholds the link from roles without `pii.view`; a
      // holder whose response still carried none can ask for it, logged.
      withheld: (
        <Revealable
          value={null}
          label={back ? 'licence (back) link' : 'licence link'}
          target={driverTarget}
          field={field}
          render={openDoc}
          compact
        />
      ),
    };
  });

  const vehicleDocs: ReviewDocument[] = (compliance?.vehicle_documents ?? []).map((d) => ({
    ...d,
    url: vehicle
      ? ((vehicle as unknown as Record<string, string | null>)[VEHICLE_DOC_URL[d.key] ?? ''] ?? null)
      : null,
  }));

  return (
    <>
      <PageHeader
        title={name}
        subtitle={
          <>
            Driver #{data.id} · <Revealable value={data.user.phone_number ?? '—'} label="driver phone" target={driverTarget} field="phone_number" compact />
            {data.user.email ? <> · <Revealable value={data.user.email} label="driver email" target={driverTarget} field="email" compact /></> : null}
            {compliance?.country ? ` · reviewed against ${compliance.country}` : ''}
          </>
        }
        actions={
          <>
            <Pill tone={data.status === 'online' ? 'good' : 'neutral'}>{data.status}</Pill>
            {data.fatigue?.locked && (
              <Pill tone="bad">Locked until {fmt(data.fatigue.locked_until)}</Pill>
            )}
            <ButtonLink href="/drivers" variant="ghost" size="sm">All drivers</ButtonLink>
          </>
        }
      />

      {notice && <div className="alert-success mb-5" role="status">{notice}</div>}
      {actionError && <div className="alert-error mb-5" role="alert">{actionError}</div>}

      <div className="ops-review">
        {/* ---- the evidence -------------------------------------------- */}
        <div className="grid gap-5">
          <Panel title="Driver documents">
            {compliance
              ? <DocumentList documents={driverDocs} />
              : <Empty error title="The checklist is unavailable"
                       detail="Approve only when you can see what is required." />}
            <div className="ops-fact mt-4" style={{ borderBottom: 0 }}>
              <dt>Licence expiry</dt>
              <dd style={{
                color: isExpired(data.license_expiry) ? 'var(--danger)'
                  : isExpiringSoon(data.license_expiry) ? 'var(--gold-text)' : undefined,
              }}>
                {data.license_expiry ?? 'Not set'}
                {isExpired(data.license_expiry) && ' — expired, approval will be refused'}
                {!isExpired(data.license_expiry) && isExpiringSoon(data.license_expiry)
                  && ' — expires within 30 days'}
              </dd>
            </div>
          </Panel>

          <Panel
            title={vehicle
              ? `Vehicle · ${vehicle.vehicle_number || 'no registration number'}`
              : 'Vehicle'}
          >
            {vehicle ? (
              <>
                <Facts>
                  <Fact label="Make and model">
                    {[vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(' · ') || '—'}
                  </Fact>
                  <Fact label="Category">{vehicle.type || '—'}</Fact>
                  <Fact label="Set as active">
                    {vehicle.is_active_vehicle
                      ? 'Yes'
                      : 'No — approval is refused until the driver selects it'}
                  </Fact>
                </Facts>
                <div className="mt-4">
                  <DocumentList documents={vehicleDocs} />
                </div>
              </>
            ) : (
              <Empty title="No vehicle on file"
                     detail="A driver cannot be approved without one." />
            )}
          </Panel>

          <Panel title="Recent trips" flush>
            {data.recent_trips.length === 0 ? (
              <Empty title="No trips yet" />
            ) : (
              <DataTable
                caption="This driver's recent trips"
                rows={data.recent_trips.slice(0, 10)}
                columns={tripColumns}
                rowKey={(t) => t.id}
                density="compact"
                maxHeight={false}
              />
            )}
          </Panel>
        </div>

        {/* ---- the decision, and the context for it -------------------- */}
        <div className="grid gap-5">
          <DecisionPanel
            approved={data.approved}
            docStatus={data.doc_status}
            rejectionReason={data.doc_rejection_reason}
            missing={compliance?.missing ?? []}
            busy={busy}
            onApprove={() => decide(true)}
            onReject={(reason) => decide(false, reason)}
          />

          <Panel title="Record">
            <Facts>
              <Fact label="Rating">
                {Number(data.ratings) > 0 ? Number(data.ratings).toFixed(2) : 'No ratings yet'}
              </Fact>
              <Fact label="Trips">{data.total_trips}</Fact>
              <Fact label="Cancellations">
                {data.cancellations.last_24h} in 24h · {data.cancellations.last_7d} in 7d
                · {data.cancellations.last_30d} in 30d
              </Fact>
              {data.fatigue && (
                <Fact label="Driving time">
                  {hoursMins(data.fatigue.active_seconds_24h)} of 12h in the last 24h
                </Fact>
              )}
              <Fact label="Account active">{data.user.is_active ? 'Yes' : 'No'}</Fact>
            </Facts>
          </Panel>

          <Panel title="Money">
            <Facts>
              <Fact label="Wallet">{data.earnings.wallet_balance}</Fact>
              <Fact label="Today">{data.earnings.today}</Fact>
              <Fact label="This month">{data.earnings.this_month}</Fact>
              <Fact label="Lifetime">{data.earnings.lifetime}</Fact>
              <Fact label="UPI">
                {data.upi_id
                  ? <Revealable value={data.upi_id} label="UPI handle" target={driverTarget} field="upi_id" />
                  : 'Not set'}
              </Fact>
            </Facts>
            {data.earnings.currency ? (
              <p className="help">Amounts in {data.earnings.currency}.</p>
            ) : (
              // The server says null when a driver's trips span currencies,
              // rather than adding them together. Repeat that honestly
              // instead of picking a symbol.
              <p className="help">Currency not determined for these amounts.</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
