'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import { currencySymbol } from '@/lib/money';
import {
  FARE_FIELDS, canDraftPricing, cardBody, fareChangeText, fareChanges, fareProblem, previewGrid, valuesOf,
  type CardRow, type FareClass, type FarePreview, type FareValues, type FareZone,
} from '@/lib/pricing';
import { interpretWrite } from '@/lib/trips';
import { PricingNav } from '@/components/console/pricing';
import {
  DataTable, Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, type PillTone,
} from '@/components/console/ui';

/**
 * Pricing: fare cards, per zone and vehicle class.
 *
 * Each class shows the version in force and its history. A change is a DRAFT
 * you can preview (what a rider would pay on sample trips, off-peak and at
 * night, old against new, in the zone's own currency) and then SEND AS A
 * REQUEST: the card changes only when a different admin approves it. This page
 * never edits a card in place, and it never changes a fare value by itself.
 */
type Payload = { zones: FareZone[] };
type Notice = { text: string; kind: 'pending' | 'done' };

const STATE_TONE: Record<CardRow['state'], PillTone> = {
  live: 'good', scheduled: 'wait', superseded: 'neutral', retired: 'neutral',
};
const STATE_WORD: Record<CardRow['state'], string> = {
  live: 'In force', scheduled: 'Scheduled', superseded: 'Superseded', retired: 'Retired',
};

function FareCardsInner() {
  const access = useAdminAccess();
  const may = canDraftPricing(access);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ zone: FareZone; cls: FareClass } | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Payload>(withScope('/pricing/admin/fare-cards/overview/')));
    } catch (err) {
      setData(null);
      setError(err instanceof ApiError && err.fromServer ? err.message : 'The fare cards could not be loaded.');
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <PageHeader title="Pricing"
        subtitle="Fare cards by zone and vehicle class. A change is a request a second admin approves; a card is never edited in place." />
      <PricingNav />
      {notice && (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-4' : 'alert-success mb-4'} role="status">
          <b>{notice.text}</b>
        </div>
      )}
      {data === null && !error ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the fare cards</span>
          <Skeleton kind="row" count={5} />
        </div>
      ) : error ? (
        <ErrorState title="The fare cards could not be loaded" detail={error} onRetry={() => void load()} />
      ) : data && data.zones.length === 0 ? (
        <Empty title="No service zones in your scope" detail="Fare cards belong to a zone. Nothing is assigned to your account." />
      ) : (
        <div className="grid gap-4">
          {data?.zones.map((z) => (
            <Panel key={z.zone} title={`${z.name} · ${z.code} · ${z.currency}`} flush>
              <DataTable
                caption={`Fare cards in ${z.name}`} rows={z.classes} rowKey={(c) => c.vehicle_type}
                density="compact" maxHeight={false}
                onRow={(c) => setOpen({ zone: z, cls: c })}
                columns={[
                  { key: 'class', label: 'Vehicle class', render: (c) => <b>{c.vehicle_type_name}</b> },
                  { key: 'v', label: 'Version', width: '13rem', render: (c) => (c.live
                    ? <>v{c.live.version} {c.scheduled ? <Pill tone="wait">v{c.scheduled.version} scheduled</Pill> : null}</>
                    : <Pill tone="bad">no card</Pill>) },
                  { key: 'base', label: 'Base', num: true, render: (c) => money(z, c.live?.base_fare) },
                  { key: 'km', label: z.distance_unit === 'mi' ? 'Per km (priced per km)' : 'Per km', num: true, hideBelow: 1100, render: (c) => money(z, c.live?.per_km_fare) },
                  { key: 'min', label: 'Per min', num: true, hideBelow: 1100, render: (c) => money(z, c.live?.per_min_fare) },
                  { key: 'minf', label: 'Minimum', num: true, render: (c) => money(z, c.live?.min_fare) },
                  { key: 'night', label: 'Night', num: true, hideBelow: 1280, render: (c) => (c.live ? `×${Number(c.live.night_surge_multiplier)}` : '—') },
                  { key: 'cap', label: 'Surge cap', num: true, hideBelow: 1280, render: (c) => (c.live ? `×${Number(c.live.surge_cap_multiplier)}` : '—') },
                  { key: 'from', label: 'In force since', hideBelow: 1100, render: (c) => (c.live ? stamp(c.live.effective_from) : '—') },
                ]}
              />
            </Panel>
          ))}
        </div>
      )}
      {open ? (
        <CardDrawer zone={open.zone} cls={open.cls} may={may} onClose={() => setOpen(null)}
          onDone={(text, kind) => { setOpen(null); setNotice({ text, kind }); void load(); }} />
      ) : null}
    </>
  );
}

function money(z: FareZone, v: string | undefined | null): string {
  return v === undefined || v === null ? '—' : `${currencySymbol(z.currency)}${v}`;
}

// ---------------------------------------------------------------------------

function CardDrawer({ zone, cls, may, onClose, onDone }: {
  zone: FareZone; cls: FareClass; may: boolean; onClose: () => void;
  onDone: (text: string, kind: Notice['kind']) => void;
}) {
  const live = cls.live;
  // A draft is built on the NEWEST version: a scheduled one if there is one, else the live
  // card. The preview still compares it with what a rider pays today (the live card).
  const base = cls.scheduled ?? cls.live;
  const blank: FareValues = {
    base_fare: '', per_km_fare: '', per_min_fare: '', min_fare: '', night_surge_multiplier: '1.00',
    night_surge_start_hour: '23', night_surge_end_hour: '5', surge_cap_multiplier: '1.50', gst_percent: '5.000',
  };
  const current = base ? valuesOf(base) : null;
  const [draft, setDraft] = useState<FareValues>(current ?? blank);
  const [reason, setReason] = useState('');
  const [from, setFrom] = useState('');
  const [preview, setPreview] = useState<FarePreview | 'loading' | 'error' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retiring, setRetiring] = useState(false);

  const changes = fareChanges(current, draft);
  const problem = fareProblem(draft, reason, current);
  const set = (k: keyof FareValues, v: string) => { setDraft((d) => ({ ...d, [k]: v })); setPreview(null); };

  async function runPreview() {
    setPreview('loading');
    try {
      setPreview(await api.post<FarePreview>('/pricing/admin/fare-cards/preview/', {
        zone: zone.zone, vehicle_type: cls.vehicle_type, values: draft,
      }));
    } catch {
      setPreview('error');
    }
  }

  async function submit() {
    if (problem) return;
    setBusy(true); setError(null);
    try {
      const body = base
        ? await api.patch<{ approval_request?: { id: number; status?: string } | null; state?: string }>(
          `/pricing/admin/rate-cards/${base.id}/`, cardBody(draft, reason, from))
        : await api.post<{ approval_request?: { id: number; status?: string } | null; state?: string }>(
          '/pricing/admin/rate-cards/', { zone: zone.zone, vehicle_type: cls.vehicle_type, ...cardBody(draft, reason, from) });
      const result = interpretWrite(body as never, 'The fare card changed.');
      onDone(result.message, result.kind);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  async function retire() {
    if (!live) return;
    if (reason.trim().length < 5) { setError('Say why, in a few words.'); return; }
    setBusy(true); setError(null);
    try {
      const body = await api.patch<{ approval_request?: { id: number; status?: string } | null; state?: string }>(
        `/pricing/admin/rate-cards/${live.id}/`, { is_active: false, reason: reason.trim() });
      const result = interpretWrite(body as never, 'The fare card was retired.');
      onDone(result.message, result.kind);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open wide onClose={onClose} title={`${cls.vehicle_type_name} · ${zone.name}`}
      footer={may ? (
        <>
          {live ? (
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy}
              onClick={() => (retiring ? void retire() : setRetiring(true))}>
              {retiring ? 'Send retire request' : 'Retire this card…'}
            </button>
          ) : null}
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => void runPreview()}
            disabled={busy || fareProblemFields(draft) !== null}>Preview rider fares</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void submit()}
            disabled={busy || problem !== null}>{busy ? 'Working…' : 'Send for approval'}</button>
        </>
      ) : undefined}>
      <div className="grid gap-5">
        <section aria-label="History">
          <h3 className="ops-subhead">Versions</h3>
          {cls.history.length === 0 ? (
            <Empty title="No card yet" detail="This class cannot quote a fare in this zone until one is approved." />
          ) : (
            <DataTable caption={`Versions of the ${cls.vehicle_type_name} card`} density="compact" maxHeight={false}
              rows={cls.history} rowKey={(h) => h.id}
              columns={[
                { key: 'v', label: 'Version', width: '6rem', render: (h) => `v${h.version}` },
                { key: 's', label: 'State', render: (h) => <Pill tone={STATE_TONE[h.state]}>{STATE_WORD[h.state]}</Pill> },
                { key: 'b', label: 'Base', num: true, render: (h) => money(zone, h.base_fare) },
                { key: 'k', label: 'Per km', num: true, render: (h) => money(zone, h.per_km_fare) },
                { key: 'm', label: 'Per min', num: true, render: (h) => money(zone, h.per_min_fare) },
                { key: 'mf', label: 'Min', num: true, render: (h) => money(zone, h.min_fare) },
                { key: 'n', label: 'Night', num: true, hideBelow: 1100, render: (h) => `×${Number(h.night_surge_multiplier)}` },
                { key: 'c', label: 'Cap', num: true, hideBelow: 1100, render: (h) => `×${Number(h.surge_cap_multiplier)}` },
                { key: 'f', label: 'From', render: (h) => stamp(h.effective_from) },
                { key: 't', label: 'Until', render: (h) => (h.effective_to ? stamp(h.effective_to) : '—') },
              ]} />
          )}
        </section>

        {may ? (
          <section aria-label="Draft" className="ops-form">
            <h3 className="ops-subhead">
              {base ? `Draft v${base.version + 1}${cls.scheduled ? ` (on top of the scheduled v${base.version})` : ''}` : 'Draft the first card'}
            </h3>
            <p className="help m-0">
              Amounts are in {zone.currency}. {zone.distance_unit === 'mi'
                ? 'The distance rate is stored per km; the preview shows sample trips in km.'
                : 'Distance is priced per km.'}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {FARE_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="ops-form__label" htmlFor={`fc-${f.key}`}>{f.label}</label>
                  <input id={`fc-${f.key}`} className="input" inputMode="decimal" value={draft[f.key]}
                    onChange={(e) => set(f.key, e.target.value)} />
                </div>
              ))}
            </div>
            <label className="ops-form__label" htmlFor="fc-from">Effective from (blank: when approved)</label>
            <input id="fc-from" className="input" type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
            <label className="ops-form__label" htmlFor="fc-why">Why (kept in the audit log)</label>
            <textarea id="fc-why" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            {changes.length > 0 && current ? (
              <div className="ops-confirm">
                <b>This request will change</b>
                <span>{changes.map((c) => `${c.label}: ${c.from} to ${c.to}`).join(' · ')}</span>
              </div>
            ) : null}
            {problem && (reason || changes.length > 0) ? <p className="help m-0" role="note">{problem}</p> : null}
          </section>
        ) : null}

        {preview !== null ? (
          <section aria-label="Rider fare preview">
            <h3 className="ops-subhead">What a rider would pay</h3>
            {preview === 'loading' ? (
              <div className="ops-skel-rows" aria-busy="true"><span className="sr-only">Working out the preview</span><Skeleton kind="row" count={3} /></div>
            ) : preview === 'error' ? (
              <ErrorState title="The preview could not be worked out" onRetry={() => void runPreview()} />
            ) : (
              <>
                <div className="ops-table-wrap">
                  <table className="ops-table ops-table--compact ops-table--auto">
                    <caption className="sr-only">Sample fares, current card against the draft, in {preview.preview.currency}</caption>
                    <thead>
                      <tr><th scope="col">Trip</th><th scope="col" className="num">Off-peak</th><th scope="col" className="num">At night</th></tr>
                    </thead>
                    <tbody>
                      {previewGrid(preview.preview.rows).map((g) => (
                        <tr key={g.distance_km}>
                          <th scope="row">{g.distance_km} km · about {g.off_peak?.minutes ?? '—'} min</th>
                          <td className="num">{fareChangeText(g.off_peak, preview.preview.currency)}</td>
                          <td className="num">{fareChangeText(g.night, preview.preview.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="help m-0">Assumes {preview.preview.assumes}. Live demand surge is not part of this estimate.</p>
              </>
            )}
          </section>
        ) : null}

        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}

/** Enough to ask the server for a preview: every field is a number. */
function fareProblemFields(d: FareValues): string | null {
  for (const f of FARE_FIELDS) {
    if (!/^\d+(\.\d+)?$/.test(d[f.key].trim())) return f.label;
  }
  return null;
}

export default function FareCardsPage() {
  return <FareCardsInner />;
}
