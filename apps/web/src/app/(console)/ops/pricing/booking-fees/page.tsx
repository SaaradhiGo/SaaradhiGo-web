'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import { canDraftPricing } from '@/lib/pricing';
import { PricingNav } from '@/components/console/pricing';
import { ChangePreview, type ChangeDisplay } from '@/components/console/edit/ChangePreview';
import { usePreview } from '@/components/console/edit/usePreview';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { DataTable, Drawer, ErrorState, Skeleton } from '@/components/console/ui';

/**
 * Pricing > Booking fees (owner ruling, 26 Nov): the rider booking fee per place and class, its own
 * setting. A change shows before/after and the rider's side, needs a reason and a second person, and
 * starts the next local day. No fee by default, and none by default where drivers pay a daily fee.
 */
type FeeClass = { vehicle_type: string; name: string; minor: number; words: string; source: 'here' | 'inherited' | 'default'; source_name: string };
type Version = { id: number; version: number; amounts: Record<string, number>; status: string; effective_from: string;
  effective_to: string | null; created_by: string; reason: string; created_at: string };
type Req = { id: number; ref: string | null; status: string; maker: string; reason: string; decision_reason: string;
  checker: string; requested_at: string; amounts: Record<string, number> | null; requested_from: string | null };
type Place = { country: string; scope_code: string; name: string; currency: string; classes: FeeClass[];
  daily_fee_place: boolean; in_force: Version | null; history: Version[]; requests: Req[] };

const DECISION: Record<string, string> = {
  requested: 'Waiting for approval', executed: 'Approved', approved: 'Approved', rejected: 'Rejected',
  returned: 'Sent back', cancelled: 'Withdrawn', expired: 'Expired', failed: 'Approved, but it failed',
};

/** Money words for a booking fee: "No booking fee" at 0, whole rupees in India. */
function feeWords(minor: number, currency: string): string {
  if (!minor) return 'No booking fee';
  const units = minor / 100;
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : `${currency} `;
  return `${sym}${currency === 'INR' ? units.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : units.toFixed(2)}`;
}

const waiting = (p: Place) => p.requests.find((r) => r.status === 'requested') ?? null;

export default function BookingFeesPage() {
  const access = useAdminAccess();
  const may = canDraftPricing(access);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Place | null>(null);
  const [viewing, setViewing] = useState<Place | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPlaces((await api.get<{ results: Place[] }>('/pricing/admin/booking-fees/')).results);
    } catch (err) {
      setPlaces(null);
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The booking fees could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function withdraw(p: Place) {
    const r = waiting(p);
    if (!r) return;
    try {
      await api.post(`/approvals/admin/requests/${r.id}/cancel/`, { reason: 'Withdrawn by the editor' });
      setNotice(`The change for ${p.name} was withdrawn. The booking fee in force is unchanged.`);
      setViewing(null);
      await load();
    } catch (err) {
      setNotice(err instanceof ApiError && err.fromServer ? err.message : 'The withdrawal did not go through.');
    }
  }

  return (
    <>
      <PricingNav />
      <header className="ops-list__head mb-3">
        <div>
          <h1>Booking fees</h1>
          <p>What a rider pays per booking, per place and class, shown on the fare breakdown only when above 0.
          The driver keeps none of it and pays no fee on it. None by default, and none by default where drivers pay a daily fee.</p>
        </div>
      </header>
      {notice ? <div className="ops-confirm mb-3" role="status"><b>{notice}</b></div> : null}
      {error ? <ErrorState title="The booking fees could not be loaded" detail={error} onRetry={() => void load()} /> : null}
      {!places && !error ? <Skeleton kind="row" count={4} /> : null}
      {places ? (
        <DataTable caption="Booking fees by place" rows={places} rowKey={(p) => `${p.country}:${p.scope_code}`} wrap maxHeight={false}
          columns={[
            { key: 'place', label: 'Place', render: (p) => <>{p.name}{p.daily_fee_place ? <span className="muted"> · daily-fee plan</span> : null}</> },
            { key: 'fees', label: 'Booking fee per class', render: (p) => (
              <ul className="m-0 p-0 list-none grid gap-1">
                {p.classes.map((c) => (
                  <li key={c.vehicle_type}>{c.name}: <b>{c.words}</b>
                    {c.source === 'inherited' ? <span className="muted"> (from {c.source_name})</span> : null}</li>
                ))}
              </ul>) },
            { key: 'state', label: 'Status', render: (p) => {
              const r = waiting(p);
              return r ? <StatusChip tone="info">Waiting for approval{r.ref ? ` · ${r.ref}` : ''}</StatusChip>
                : <StatusChip tone="good">{p.in_force ? `In force · v${p.in_force.version}` : 'Default'}</StatusChip>;
            } },
            { key: 'act', label: 'Actions', render: (p) => (
              <span className="ops-row-actions">
                <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setViewing(p)}
                  aria-label={`History of the ${p.name} booking fee`}>History</button>
                {may && !waiting(p) ? <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setEditing(p)}
                  aria-label={`Edit the ${p.name} booking fee`}>Edit</button> : null}
                {may && waiting(p) ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void withdraw(p)}
                  aria-label={`Withdraw the ${p.name} booking fee change`}>Withdraw</button> : null}
              </span>) },
          ]} />
      ) : null}
      {editing ? <EditDrawer place={editing} onClose={() => setEditing(null)}
        onSent={(t) => { setEditing(null); setNotice(t); void load(); }} /> : null}
      {viewing ? <HistoryDrawer place={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

function EditDrawer({ place, onClose, onSent }: { place: Place; onClose: () => void; onSent: (t: string) => void }) {
  const unit = place.currency === 'INR' ? '₹' : place.currency === 'USD' ? '$' : place.currency;
  const start = useMemo(() => Object.fromEntries(place.classes.map((c) => [c.vehicle_type, String(c.minor / 100)])), [place]);
  const [values, setValues] = useState<Record<string, string>>(start);
  const [from, setFrom] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amounts = Object.fromEntries(Object.entries(values).filter(([k, v]) => v.trim() !== '' && v !== start[k])
    .map(([k, v]) => [k, Math.round(Number(v) * 100)]));
  const changed = Object.keys(amounts).length > 0;
  const body = { country: place.country, scope_code: place.scope_code, amounts, ...(from ? { effective_from: from } : {}) };
  const { display, error: previewError } = usePreview(changed ? '/pricing/admin/booking-fees/preview/' : null, body);
  const shown = display as (ChangeDisplay & { start?: { effective_from: string } }) | null;

  async function send() {
    setBusy(true); setError(null);
    try {
      await api.post('/pricing/admin/booking-fees/edit/', { ...body, reason: reason.trim() });
      onSent(`Sent for approval. The booking fee in force for ${place.name} stays until a second person approves.`);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally { setBusy(false); }
  }

  return (
    <Drawer open wide title={`Edit booking fee · ${place.name}`} onClose={onClose}
      footer={<>
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void send()}
          disabled={busy || !changed || !shown || reason.trim().length < 5}>{busy ? 'Sending…' : 'Send for approval'}</button>
      </>}>
      <div className="grid gap-4">
        <p className="help m-0">{place.in_force ? `v${place.in_force.version} stays in force until a second person approves. ` : ''}
          Changed values are highlighted. 0 means no booking fee{place.currency === 'INR' ? '; India uses whole rupees' : ''}.</p>
        <div className="ops-class-rows">
          {place.classes.map((c) => {
            const id = `bf-${c.vehicle_type}`;
            const isChanged = values[c.vehicle_type] !== start[c.vehicle_type];
            return (
              <fieldset key={c.vehicle_type} className="ops-class-row">
                <legend>{c.name}</legend>
                <div className={isChanged ? 'ops-field is-changed' : 'ops-field'}>
                  <label className="ops-form__label" htmlFor={id}>Booking fee ({unit})</label>
                  <input id={id} className="input" inputMode="decimal" aria-label={`${c.name}: booking fee (${unit})`}
                    value={values[c.vehicle_type] ?? ''} onChange={(e) => setValues({ ...values, [c.vehicle_type]: e.target.value })} />
                  <span className="help">Now: {c.words}{c.source === 'inherited' ? ` (from ${c.source_name})` : ''}</span>
                </div>
              </fieldset>
            );
          })}
        </div>
        {shown ? <ChangePreview display={shown} /> : null}
        {previewError ? <div className="alert-error" role="alert">{previewError}</div> : null}
        <label className="ops-form__label" htmlFor="bf-from">Starts (local day)</label>
        <input id="bf-from" type="date" className="input" value={from || shown?.start?.effective_from || ''} onChange={(e) => setFrom(e.target.value)} />
        <p className="help m-0">The next local day by default, for new bookings.</p>
        <label className="ops-form__label" htmlFor="bf-why">Why (the approver and the history see it)</label>
        <textarea id="bf-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}

function amountsText(a: Record<string, number> | null, place: Place): string {
  if (!a) return '—';
  return Object.entries(a).map(([k, v]) => `${place.classes.find((c) => c.vehicle_type === k)?.name ?? k}: ${feeWords(v, place.currency)}`).join(', ');
}

function HistoryDrawer({ place, onClose }: { place: Place; onClose: () => void }) {
  return (
    <Drawer open wide title={`Booking fee history · ${place.name}`} onClose={onClose}>
      <div className="grid gap-5">
        <section aria-label="Changes asked for">
          <h3 className="ops-subhead">Changes asked for</h3>
          {place.requests.length ? (
            <DataTable caption="Booking fee changes asked for" density="compact" maxHeight={false} wrap rows={place.requests} rowKey={(r) => r.id}
              columns={[
                { key: 'ref', label: 'Request', render: (r) => r.ref ?? '—' },
                { key: 'what', label: 'Change', render: (r) => `${amountsText(r.amounts, place)}${r.requested_from ? ` · from ${r.requested_from}` : ''}` },
                { key: 'who', label: 'Asked by', render: (r) => `${r.maker || '—'} · ${stamp(r.requested_at)}` },
                { key: 'why', label: 'Why', render: (r) => r.reason || '—' },
                { key: 'd', label: 'Decision', render: (r) => `${DECISION[r.status] ?? r.status}${r.checker ? ` by ${r.checker}` : ''}${r.decision_reason ? `: ${r.decision_reason}` : ''}` },
              ]} />
          ) : <p className="help m-0">No changes asked for yet.</p>}
        </section>
        <section aria-label="Versions">
          <h3 className="ops-subhead">Versions</h3>
          {place.history.length ? (
            <DataTable caption="Booking fee versions" density="compact" maxHeight={false} wrap rows={place.history} rowKey={(v) => v.id}
              columns={[
                { key: 'v', label: 'Version', render: (v) => `v${v.version}` },
                { key: 'a', label: 'Booking fee', render: (v) => amountsText(v.amounts, place) },
                { key: 'when', label: 'In force', render: (v) => `${v.effective_from}${v.effective_to ? ` to ${v.effective_to}` : ''}` },
                { key: 'who', label: 'Changed by', render: (v) => `${v.created_by || '—'} · ${stamp(v.created_at)}` },
                { key: 'why', label: 'Why', render: (v) => v.reason || '—' },
              ]} />
          ) : <p className="help m-0">No version set here: {place.daily_fee_place ? 'a daily-fee place has no booking fee by default.' : 'it inherits from the level above, or has none.'}</p>}
        </section>
      </div>
    </Drawer>
  );
}
