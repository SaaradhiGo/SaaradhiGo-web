'use client';

import { PageButtonLink, PageLink } from '@/components/console/PageLink';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import {
  type DriverActionKey, type DriverActions, KYC_LABEL, REVIEW_LABEL, driverName, visibleDriverActions,
} from '@/lib/drivers';
import { cityTime, words } from '@/lib/trips';
import { DocumentReviewDrawer, DriverActionDrawer, type ReviewTarget } from '@/components/console/DriverActionDrawer';
import { ButtonLink } from '@/components/sg/Button';
import { Revealable } from '@/components/console/Revealable';
import { LedgerLink } from '@/components/console/finance';
import {
  Column, DataTable, Drawer, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * One driver: the evidence, the decision, and the record.
 *
 * The documents come first, each with its own review state and its own
 * approve / reject, because a driver is approved on their paperwork and an
 * operator should not be able to approve somebody without having looked.
 * A rejection asks for the reason the driver will read in the app.
 *
 * The action rail is drawn from the server's per-driver answer (`actions`),
 * so a KYC Verifier sees review and approve, City Ops sees suspend and
 * reinstate, and nobody sees a button the server would refuse. Contact
 * details are masked by the server; `Revealable` is the logged way to them.
 * Times are in the driver's home city.
 */
type Doc = {
  key: string; label: string; description?: string; owner: 'driver' | 'vehicle';
  vehicle_id: number | null; present: boolean; recordable: boolean;
  url: string | null; url_withheld: boolean; review_state: string;
  review: { state: string; reason: string; reviewed_at: string | null; current: boolean;
    created_by?: { label?: string } | null } | null;
};
type AuditRow = { id: number; action: string; created_at: string | null; reason: string;
  created_by?: { label?: string; role?: string } | null };
type Vehicle = {
  id: number; type: string | null; brand: string | null; model: string | null; color: string | null;
  vehicle_number: string | null; status: string; is_active_vehicle: boolean;
  insurance_expiry: string | null; permit_expiry: string | null; fitness_expiry: string | null; puc_expiry: string | null;
};
type Trip = { id: number; status: string | null; pickup_address: string | null; destination_address: string | null;
  requested_at: string | null };

type DriverDetail = {
  id: number; status: string; approved: boolean; ratings: string; total_trips: number;
  doc_status?: string; doc_rejection_reason?: string;
  license_expiry: string | null; upi_id: string | null;
  user: { id: number; phone_number: string | null; full_name: string | null; email: string | null; is_active: boolean | null };
  vehicles: Vehicle[];
  fatigue: { locked: boolean; locked_until: string | null; active_seconds_24h: number } | null;
  cancellations: { last_24h: number; last_7d: number; last_30d: number };
  recent_trips: Trip[];
  earnings: { lifetime: string; today: string; this_month: string; wallet_balance: string; currency?: string };
  compliance?: { country: string; missing: string[] };
  home_city?: { code: string; name: string; timezone: string } | null;
  kyc_state?: string;
  documents_expired?: boolean;
  joined_at?: string | null;
  documents?: Doc[];
  approval_blockers?: Array<{ code: string; message: string }>;
  ratings_summary?: { average: string; count: number; distribution: Record<string, number> };
  counts?: { sos_total: number; sos_open: number; tickets_total: number; tickets_open: number };
  suspension?: { active: boolean; reason_label?: string; note?: string; created_at?: string | null;
    created_by?: { label?: string } | null; permanent?: boolean };
  status_history?: AuditRow[];
  notes?: Array<{ id: number; body: string; created_at: string | null; created_by?: { label?: string } | null }>;
  approval_requests?: Array<{ id: number; action_key: string; status: string; requested_at: string | null }>;
  audit_trail?: AuditRow[];
  actions?: DriverActions;
};

const TRIP_TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  completed: 'good', cancelled: 'bad', requested: 'wait', accepted: 'wait', reached: 'wait', in_progress: 'wait',
};
const RAIL_LABEL: Record<DriverActionKey, string> = {
  approve: 'Approve to drive', suspend: 'Suspend…', reinstate: 'Reinstate…', note: 'Add a note…',
  deactivate: 'Deactivate permanently…',
};

export default function DriverDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const access = useAdminAccess();
  const [data, setData] = useState<DriverDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [action, setAction] = useState<DriverActionKey | null>(null);
  const [review, setReview] = useState<{ doc: ReviewTarget; decision: 'approve' | 'reject' } | null>(null);
  const [vehicleChange, setVehicleChange] = useState<Vehicle | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<DriverDetail>(`/driver/admin/${id}/full/`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this driver.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) {
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

  const name = driverName(data.user, data.id);
  const tz = data.home_city?.timezone ?? null;
  const when = (iso: string | null | undefined) => cityTime(iso, tz, { zone: true });
  const target = { type: 'driver', id: data.id } as const;
  const suspended = Boolean(data.suspension?.active);
  const rail = visibleDriverActions(data.actions, access, { approved: data.approved, suspended });
  const mayReview = data.actions?.review_documents ?? false;
  const mayVehicles = data.actions?.vehicles ?? false;
  const [kycLabel, kycTone] = KYC_LABEL[data.kyc_state ?? ''] ?? [words(data.kyc_state), 'neutral'];
  const documents = data.documents ?? [];
  const blockers = data.approval_blockers ?? [];
  const done = (text: string, kind: 'pending' | 'done' = 'done') => { setNotice({ text, kind }); void load(); };

  const docGroups: Array<[string, Doc[]]> = [
    ['Driver documents', documents.filter((d) => d.owner === 'driver')],
    ...data.vehicles.map((v): [string, Doc[]] => [
      `Vehicle · ${v.vehicle_number || `#${v.id}`}${v.is_active_vehicle ? ' (active)' : ''}`,
      documents.filter((d) => d.owner === 'vehicle' && d.vehicle_id === v.id),
    ]),
  ];

  const openLink = (url: unknown) => (typeof url === 'string' && url
    ? <a className="ops-doc__open" href={url} target="_blank" rel="noopener noreferrer">Open</a>
    : <span className="ops-doc__missing">No link</span>);

  const tripColumns: Column<Trip>[] = [
    { key: 'id', label: 'Trip', width: '5rem', render: (t) => <PageLink page="trips" href={`/trips/${t.id}`}>#{t.id}</PageLink> },
    { key: 'status', label: 'Status', width: '8rem', render: (t) => <Pill tone={TRIP_TONE[t.status ?? ''] ?? 'neutral'}>{words(t.status)}</Pill> },
    { key: 'route', label: 'Pickup → drop', render: (t) => <span>{t.pickup_address || '—'} <span className="muted">→</span> {t.destination_address || '—'}</span> },
    { key: 'when', label: 'Requested', num: true, width: '10rem', render: (t) => cityTime(t.requested_at, tz) },
  ];
  const vehicleColumns: Column<Vehicle>[] = [
    { key: 'plate', label: 'Vehicle', render: (v) => <span>{v.vehicle_number || `#${v.id}`}{v.is_active_vehicle ? <> <Pill tone="good">active</Pill></> : null}</span> },
    { key: 'kind', label: 'Type', width: '7rem', render: (v) => v.type ?? '—' },
    { key: 'make', label: 'Make', hideBelow: 1280, render: (v) => [v.brand, v.model, v.color].filter(Boolean).join(' · ') || '—' },
    { key: 'status', label: 'Status', width: '8rem', render: (v) => <Pill tone={v.status === 'active' ? 'good' : 'neutral'}>{words(v.status)}</Pill> },
    ...(mayVehicles ? [{
      key: 'act', label: <span className="sr-only">Change</span>, width: '8.5rem',
      render: (v: Vehicle) => (
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setVehicleChange(v)}>
          {v.status === 'active' ? 'Deactivate…' : 'Activate…'}
          <span className="sr-only"> vehicle {v.vehicle_number || v.id}</span>
        </button>
      ),
    }] : []),
  ];
  const auditColumns: Column<AuditRow>[] = [
    { key: 'when', label: 'When', width: '10rem', render: (r) => when(r.created_at) },
    { key: 'what', label: 'What', width: '13rem', render: (r) => words(r.action) },
    { key: 'why', label: 'Reason', render: (r) => r.reason || <span className="muted">—</span> },
    { key: 'who', label: 'By', width: '10rem', hideBelow: 1100, render: (r) => r.created_by?.label || '—' },
  ];

  return (
    <>
      <PageHeader
        title={name}
        subtitle={
          <>
            Driver #{data.id} · <Revealable value={data.user.phone_number ?? '—'} label="driver phone" target={target} field="phone_number" compact />
            {data.user.email ? <> · <Revealable value={data.user.email} label="driver email" target={target} field="email" compact /></> : null}
            {data.home_city ? ` · ${data.home_city.name}` : ''}
            {data.compliance?.country ? ` · reviewed against ${data.compliance.country}` : ''}
          </>
        }
        actions={
          <>
            <Pill tone={kycTone}>{kycLabel}</Pill>
            {suspended ? <Pill tone="bad">{data.suspension?.permanent ? 'deactivated' : 'suspended'}</Pill> : null}
            <Pill tone={data.status === 'online' ? 'good' : 'neutral'}>{words(data.status)}</Pill>
            {/* Drawn only for finance.read (the link rule): the statement behind the balance. */}
            <LedgerLink driverId={data.id} />
            <ButtonLink href="/drivers" variant="ghost" size="sm">All drivers</ButtonLink>
          </>
        }
      />

      {notice && (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-5' : 'alert-success mb-5'} role="status">
          <b>{notice.text}</b>
        </div>
      )}

      <div className="ops-review">
        <div className="grid gap-5">
          {docGroups.map(([title, docs]) => (
            <Panel key={title} title={title}>
              {docs.length === 0 ? (
                <p className="help m-0">Nothing required here.</p>
              ) : docs.map((doc) => {
                const [label, tone] = REVIEW_LABEL[doc.review_state] ?? [words(doc.review_state), 'neutral'];
                const reviewTarget: ReviewTarget = { key: doc.key, label: doc.label, owner: doc.owner, vehicle_id: doc.vehicle_id };
                const linkField = doc.key === 'license_back' ? 'license_doc_back_url' : 'license_doc_url';
                return (
                  <div className="ops-doc ops-doc--review" key={`${doc.owner}-${doc.vehicle_id ?? 0}-${doc.key}`}>
                    <span className={`ops-doc__tick ${doc.present ? 'is-on' : 'is-off'}`} aria-hidden="true">{doc.present ? '✓' : '!'}</span>
                    <span className="ops-doc__text">
                      <b>{doc.label} <Pill tone={tone}>{label}</Pill></b>
                      <span>
                        {!doc.recordable ? 'Required, but there is nowhere to store it: cannot be satisfied'
                          : doc.review?.current && doc.review.state === 'rejected' ? `Rejected: ${doc.review.reason}`
                            : doc.present ? doc.description || 'On file' : 'Not uploaded'}
                      </span>
                    </span>
                    {doc.present && doc.url ? openLink(doc.url)
                      : doc.present && doc.url_withheld && doc.owner === 'driver' ? (
                        <Revealable value={null} label={`${doc.label} link`} target={target} field={linkField} render={openLink} compact />
                      ) : <span className="ops-doc__missing">{doc.present ? 'No link' : 'Missing'}</span>}
                    {mayReview && doc.present ? (
                      <span className="ops-form__row">
                        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={doc.review_state === 'approved'}
                          onClick={() => setReview({ doc: reviewTarget, decision: 'approve' })}>
                          Approve<span className="sr-only"> {doc.label}</span>
                        </button>
                        <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
                          onClick={() => setReview({ doc: reviewTarget, decision: 'reject' })}>
                          Reject…<span className="sr-only"> {doc.label}</span>
                        </button>
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </Panel>
          ))}

          <Panel title="Vehicles" flush>
            {data.vehicles.length === 0 ? (
              <Empty title="No vehicle on file" detail="A driver cannot be approved without one." />
            ) : (
              <DataTable caption="Vehicles" rows={data.vehicles} columns={vehicleColumns} rowKey={(v) => v.id} density="compact" maxHeight={false} />
            )}
          </Panel>

          <Panel title="Recent trips" flush>
            {data.recent_trips.length === 0 ? (
              <Empty title="No trips yet" />
            ) : (
              <DataTable caption="This driver's recent trips" rows={data.recent_trips.slice(0, 10)} columns={tripColumns} rowKey={(t) => t.id} density="compact" maxHeight={false} />
            )}
          </Panel>

          <Panel title="Status history" flush>
            {(data.status_history ?? []).length === 0 ? (
              <Empty title="No status changes recorded" />
            ) : (
              <DataTable caption="Status history" rows={data.status_history ?? []} columns={auditColumns} rowKey={(r) => r.id} density="compact" maxHeight={false} />
            )}
          </Panel>

          <Panel title="Audit trail" flush>
            {(data.audit_trail ?? []).length === 0 ? (
              <Empty title="No operator has acted on this driver" />
            ) : (
              <DataTable caption="Audit trail" rows={data.audit_trail ?? []} columns={auditColumns} rowKey={(r) => r.id} density="compact" maxHeight={false} />
            )}
          </Panel>
        </div>

        <div className="grid gap-5">
          <div className="ops-decide">
            <h2>Decision</h2>
            {data.doc_status === 'rejected' && data.doc_rejection_reason ? (
              <p className="ops-decide__why"><strong className="block">The driver reads:</strong>{data.doc_rejection_reason}</p>
            ) : null}
            {suspended ? (
              <p className="ops-decide__why">
                <strong className="block">{data.suspension?.permanent ? 'Permanently deactivated' : `Suspended: ${data.suspension?.reason_label ?? ''}`}</strong>
                {data.suspension?.note || 'No note.'} {data.suspension?.created_at ? `(${when(data.suspension.created_at)}${data.suspension.created_by?.label ? `, ${data.suspension.created_by.label}` : ''})` : ''}
              </p>
            ) : null}
            {!data.approved && blockers.length > 0 ? (
              <div className="ops-decide__why">
                <strong className="block">Approval is refused until:</strong>
                <ul>{blockers.map((b) => <li key={`${b.code}-${b.message}`}>{b.message}</li>)}</ul>
              </div>
            ) : null}
            {(data.approval_requests ?? []).filter((r) => r.status === 'requested').map((r) => (
              <p key={r.id} className="ops-confirm">Waiting for a checker · request #{r.id} ({words(r.action_key)})</p>
            ))}
            {rail.length === 0 ? (
              <p className="help m-0">You can view this driver but not change them.</p>
            ) : (
              <div className="ops-decide__actions">
                {rail.map((key) => (
                  <button
                    key={key} type="button"
                    className={key === 'approve' ? 'btn-primary' : key === 'deactivate' ? 'btn-ghost' : 'btn-secondary'}
                    disabled={key === 'approve' && blockers.length > 0}
                    onClick={() => setAction(key)}
                  >{RAIL_LABEL[key]}</button>
                ))}
              </div>
            )}
          </div>

          <Panel title="Record">
            <Facts>
              <Fact label="Rating">
                {Number(data.ratings) > 0 ? Number(data.ratings).toFixed(2) : 'No ratings yet'}
                {data.ratings_summary ? ` · ${data.ratings_summary.count} rating${data.ratings_summary.count === 1 ? '' : 's'}` : ''}
              </Fact>
              {data.ratings_summary && data.ratings_summary.count > 0 ? (
                <Fact label="Stars">{['5', '4', '3', '2', '1'].map((s) => `${s}★ ${data.ratings_summary?.distribution[s] ?? 0}`).join(' · ')}</Fact>
              ) : null}
              <Fact label="Trips">{data.total_trips}</Fact>
              <Fact label="Cancellations">{data.cancellations.last_24h} in 24h · {data.cancellations.last_7d} in 7d · {data.cancellations.last_30d} in 30d</Fact>
              <Fact label="SOS">
                <PageLink page="safety" href="/safety-ops">{data.counts?.sos_total ?? 0} total, {data.counts?.sos_open ?? 0} open</PageLink>
              </Fact>
              <Fact label="Tickets">
                <PageLink page="support" href="/support">{data.counts?.tickets_total ?? 0} total, {data.counts?.tickets_open ?? 0} open</PageLink>
              </Fact>
              <Fact label="Licence expiry">{data.license_expiry ?? 'Not set'}{data.documents_expired ? ' · a document has expired' : ''}</Fact>
              <Fact label="Joined">{when(data.joined_at)}</Fact>
              <Fact label="Account active">{data.user.is_active ? 'Yes' : 'No'}</Fact>
            </Facts>
          </Panel>

          <Panel title="Internal notes">
            {(data.notes ?? []).length === 0 ? (
              <p className="help m-0">No notes yet.</p>
            ) : (
              <Facts>
                {(data.notes ?? []).map((n) => (
                  <Fact key={n.id} label={`${when(n.created_at)}${n.created_by?.label ? ` · ${n.created_by.label}` : ''}`}>{n.body}</Fact>
                ))}
              </Facts>
            )}
          </Panel>

          <Panel title="Money">
            <Facts>
              <Fact label="Wallet">{data.earnings.wallet_balance}</Fact>
              <Fact label="This month">{data.earnings.this_month}</Fact>
              <Fact label="Lifetime">{data.earnings.lifetime}</Fact>
              <Fact label="UPI">
                {data.upi_id ? <Revealable value={data.upi_id} label="UPI handle" target={target} field="upi_id" /> : 'Not set'}
              </Fact>
            </Facts>
            <p className="help">{data.earnings.currency ? `Amounts in ${data.earnings.currency}.` : 'Currency not determined for these amounts.'}</p>
          </Panel>
        </div>
      </div>

      {action && (
        <DriverActionDrawer
          action={action} driverId={data.id} driverName={name} blockers={blockers}
          suspendReasons={data.actions?.suspend_reasons}
          onClose={() => setAction(null)}
          onDone={(text, kind) => done(text, kind)}
        />
      )}
      {review && (
        <DocumentReviewDrawer
          driverId={data.id} doc={review.doc} decision={review.decision}
          onClose={() => setReview(null)}
          onDone={(text) => done(text)}
        />
      )}
      {vehicleChange && (
        <VehicleDrawer driverId={data.id} vehicle={vehicleChange} onClose={() => setVehicleChange(null)} onDone={(text) => done(text)} />
      )}
    </>
  );
}

function VehicleDrawer({ driverId, vehicle, onClose, onDone }: {
  driverId: number; vehicle: Vehicle; onClose: () => void; onDone: (text: string) => void;
}) {
  const next = vehicle.status === 'active' ? 'inactive' : 'active';
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const plate = vehicle.vehicle_number || `#${vehicle.id}`;

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api.post(`/driver/admin/${driverId}/vehicles/${vehicle.id}/status/`, { status: next, note });
      const text = next === 'active' ? `Vehicle ${plate} activated.` : `Vehicle ${plate} deactivated.`;
      setResult(text);
      onDone(text);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      title={`${next === 'active' ? 'Activate' : 'Deactivate'} vehicle ${plate}`}
      onClose={onClose}
      footer={result ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()} disabled={busy}>
            {busy ? 'Working…' : next === 'active' ? 'Activate vehicle' : 'Deactivate vehicle'}
          </button>
        </>
      )}
    >
      <div className="ops-form">
        {result ? <div className="alert-success" role="status"><b>{result}</b></div> : (
          <>
            <div className="ops-confirm">
              <b>{next === 'active' ? 'Activate' : 'Deactivate'} {plate}</b>
              <span>{next === 'active'
                ? 'It becomes the driver’s active vehicle if they have none.'
                : vehicle.is_active_vehicle ? 'This is the active vehicle: the driver cannot accept rides until another is active.' : 'The driver cannot switch to it until it is activated again.'}</span>
            </div>
            <label className="ops-form__label" htmlFor="veh-note">Note (optional)</label>
            <textarea id="veh-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </>
        )}
        {error && <div className="alert-error" role="alert">{error}</div>}
      </div>
    </Drawer>
  );
}
