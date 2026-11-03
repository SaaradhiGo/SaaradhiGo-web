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
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';
import {
  DataTable, Drawer, Empty, ErrorState, Pill, Skeleton, type PillTone,
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
  const [view, setView] = useState('');
  const [q, setQ] = useState('');

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

  const zones = data?.zones ?? [];
  const classes: { id: number; name: string }[] = [];
  for (const z of zones) for (const c of z.classes) if (!classes.some((x) => x.id === c.vehicle_type)) classes.push({ id: c.vehicle_type, name: c.vehicle_type_name });
  const needle = q.trim().toLowerCase();
  const gaps = (z: FareZone) => z.classes.filter((c) => !c.live).length;
  const scheduled = (z: FareZone) => z.classes.filter((c) => c.scheduled).length;
  const rows = zones.filter((z) => (view === 'gaps' ? gaps(z) > 0 : view === 'scheduled' ? scheduled(z) > 0 : true)
    && (!needle || [z.name, z.code, z.country].some((t) => t.toLowerCase().includes(needle))));
  const columns: ListColumn<FareZone>[] = [
    { key: 'zone', label: 'Zone', primary: true, render: (z) => <>{z.name} <span className="muted">{z.code}</span></> },
    { key: 'cur', label: 'Currency', render: (z) => z.currency },
    ...classes.map((k): ListColumn<FareZone> => ({
      key: `c${k.id}`, label: k.name, num: true,
      render: (z) => {
        const c = z.classes.find((x) => x.vehicle_type === k.id);
        if (!c) return <span className="muted">—</span>;
        return (
          <button type="button" className="ops-linkbtn" onClick={() => setOpen({ zone: z, cls: c })}
            aria-label={`${z.name}, ${c.vehicle_type_name}: ${c.live ? `version ${c.live.version}` : 'no card'}`}>
            {c.live ? <>{money(z, c.live.base_fare)} + {money(z, c.live.per_km_fare)}/km <span className="muted">v{c.live.version}</span></>
              : <StatusChip tone="caution">No card</StatusChip>}
            {c.scheduled ? <> <StatusChip tone="info">v{c.scheduled.version} scheduled</StatusChip></> : null}
          </button>
        );
      },
    })),
  ];

  return (
    <>
      <PricingNav />
      {notice && (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-4' : 'alert-success mb-4'} role="status">
          <b>{notice.text}</b>
        </div>
      )}
      <ListPage<FareZone>
        pageKey="pricing-fare-cards"
        title="Fare cards"
        summary="One row per zone, one column per vehicle class: base fare plus the per-km rate in force. Open a cell for the full card, its history and a draft. A change is a request a second admin approves; a card is never edited in place."
        views={[
          { key: '', label: 'All zones', count: data ? zones.length : undefined },
          { key: 'gaps', label: 'Missing a card', count: data ? zones.filter((z) => gaps(z) > 0).length : undefined },
          { key: 'scheduled', label: 'Change scheduled', count: data ? zones.filter((z) => scheduled(z) > 0).length : undefined },
        ]}
        view={view}
        onView={setView}
        chips={q.trim() ? [{ key: 'q', label: `Search: ${q.trim()}`, onRemove: () => setQ('') }] : []}
        filterSlot={(
          <>
            <label className="sr-only" htmlFor="fc-q">Search zones</label>
            <input id="fc-q" className="input ops-list__search" type="search" placeholder="Search a zone or country" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </>
        )}
        columns={columns}
        rows={rows}
        rowKey={(z) => z.zone}
        total={data ? rows.length : null}
        page={1}
        pageSize={Math.max(1, rows.length)}
        onPage={() => undefined}
        loading={data === null && !error}
        error={error}
        empty={data && zones.length === 0 ? 'No service zones in your scope. Fare cards belong to a zone.' : 'No zone matches.'}
      />
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
