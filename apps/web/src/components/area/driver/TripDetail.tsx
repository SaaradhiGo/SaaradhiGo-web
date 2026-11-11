'use client';

import { useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { areaGet, areaPost } from '@/lib/area/api';
import { clock, dateLabel, deduction, money } from '@/lib/area/format';
import { className } from '@/lib/area/rider';
import { useLoad } from '@/lib/area/useLoad';
import { messageFor } from '@/lib/publicAuth';
import { LoadError, Skel } from '../states';
import { Sheet } from './Sheet';

export type TripDetailData = {
  id: number; status: string; currency: string; pickup_address: string; destination_address: string;
  requested_at: string | null; started_at: string | null; completed_at: string | null;
  distance_km: string | null; duration_min: string | null; ride_class: string; payment_method: string;
  fare: string | null; platform_fee: string | null; platform_fee_refunded: string | null; tips: string | null;
  earned: string | null; cash_in_hand: string | null; rider: { first_name: string; rating: string | null };
};

/** "Report a problem": a support ticket linked to this trip (11 Nov). */
function Report({ tripId }: { tripId: number }) {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    if (text.trim().length < 10) { setErr(tr('Tell us what happened in a sentence or two.')); return; }
    setBusy(true); setErr(null);
    try {
      const t = await areaPost<{ id: number }>('/support/tickets/create/', { issue_type: 'other', trip_id: tripId, description: text.trim() });
      setSent(t.id);
    } catch (e) { setErr(messageFor(e, tr('We could not send that. Try again.'))); } finally { setBusy(false); }
  }
  if (sent) return <p className="ab" role="status" data-testid="report-sent">{tr('Sent. Ticket #{n} is linked to this trip; support replies in Support.').replace('{n}', String(sent))}</p>;
  if (!open) return <button type="button" className="abtn abtn--ghost" data-testid="report-problem" onClick={() => setOpen(true)}>{tr('Report a problem')}</button>;
  return (
    <div className="acol" style={{ gap: 8 }}>
      <label className="a14 ab" htmlFor="td-report">{tr('What went wrong on this trip?')}</label>
      <textarea id="td-report" className="ainput" rows={4} value={text} style={{ height: 'auto', padding: 12 }}
        onChange={(e) => setText(e.target.value)} aria-invalid={!!err} />
      {err && <span className="a14 ared" role="alert">{err}</span>}
      <div className="arow" style={{ gap: 8 }}>
        <button type="button" className="abtn abtn--ghost" onClick={() => setOpen(false)} disabled={busy}>{tr('Cancel')}</button>
        <button type="button" className="abtn abtn--dark agrow" onClick={() => void send()} disabled={busy} data-testid="report-send">
          {busy ? tr('Sending…') : tr('Send to support')}
        </button>
      </div>
    </div>
  );
}

/**
 * One trip (11 Nov): where and when, how far and how long, the ride class, the fare lines from the
 * ledger (fare, platform fee and any refund of it, tips, what the driver earned), how it was paid,
 * the rider's first name and rating, and Report a problem.
 */
export function TripDetail({ id, onClose }: { id: number; onClose: () => void }) {
  const tr = useTr();
  const { locale } = useLocale();
  const load = useLoad(() => areaGet<TripDetailData>(`/driver/trips/${id}/`), [id]);
  const t = load.data;
  const m = (v: string | null | undefined) => money(v ?? 0, t?.currency, locale) ?? '';
  const at = (iso: string | null) => (iso ? `${dateLabel(iso, locale, null, new Date(), true)}, ${clock(iso, locale)}` : '—');
  const fee = deduction(t?.platform_fee, t?.currency, locale);
  return (
    <Sheet label={tr('Trip #{n}').replace('{n}', String(id))} onClose={onClose} testid="trip-detail">
      {load.state === 'error' && <LoadError what="trips" retry={load.retry} />}
      {!t && load.state !== 'error' && <Skel h={18} lines={6} gap={12} />}
      {t && (
        <>
          <div className="td-place">
            <span className="td-dot" aria-hidden="true" />
            <div><div className="ab">{t.pickup_address || '—'}</div><div className="a14 amut">{tr('Picked up')} {at(t.started_at)}</div></div>
            <span className="td-dot td-dot--end" aria-hidden="true" />
            <div><div className="ab">{t.destination_address || '—'}</div><div className="a14 amut">{tr('Dropped')} {at(t.completed_at)}</div></div>
          </div>
          <div className="td-lines a14">
            <div className="td-line"><span className="amut">{tr('Distance')}</span><span className="ab">{t.distance_km ? `${Number(t.distance_km).toFixed(1)} km` : '—'}</span></div>
            <div className="td-line"><span className="amut">{tr('Duration')}</span><span className="ab">{t.duration_min ? tr('{n} min').replace('{n}', String(Math.round(Number(t.duration_min)))) : '—'}</span></div>
            <div className="td-line"><span className="amut">{tr('Ride')}</span><span className="ab">{className(t.ride_class) ?? (t.ride_class || '—')}</span></div>
            <div className="td-line"><span className="amut">{tr('Paid')}</span><span className="ab">{tr(t.payment_method === 'cash' ? 'Cash' : 'Online')}</span></div>
            <div className="td-line"><span className="amut">{tr('Rider')}</span>
              <span className="ab">{t.rider.first_name || tr('Rider')}{t.rider.rating ? ` · ${Number(t.rider.rating).toFixed(1)} ★` : ''}</span></div>
          </div>
          <div className="td-lines" data-testid="trip-fare-lines">
            <div className="td-line"><span>{tr('Fare')}</span><span className="ab">{m(t.fare)}</span></div>
            <div className="td-line"><span>{tr('Platform fee')}</span><span className={fee.red ? 'ab ared' : 'ab'}>{fee.text}</span></div>
            {t.platform_fee_refunded && <div className="td-line"><span>{tr('Platform fee refunded')}</span><span className="ab agrn">+{m(t.platform_fee_refunded)}</span></div>}
            <div className="td-line"><span>{tr('Tips')}</span><span className="ab">{m(t.tips)}</span></div>
            <div className="td-line" style={{ borderTop: '1px solid var(--c-border)', paddingTop: 8 }}><span className="ab">{tr('You earned')}</span><span className="ab agrn">{m(t.earned)}</span></div>
            {t.cash_in_hand && <div className="a14 amut">{tr('You collected {amount} in cash from the rider.').replace('{amount}', m(t.cash_in_hand))}</div>}
          </div>
          <Report tripId={t.id} />
        </>
      )}
    </Sheet>
  );
}
