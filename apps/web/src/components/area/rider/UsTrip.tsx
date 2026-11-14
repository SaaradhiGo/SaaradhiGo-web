'use client';

import { useState } from 'react';
import { useTr } from '@/i18n/website';
import { money } from '@/lib/area/format';
import { reportImpairment, tipTrip } from '@/lib/area/rider';
import { useLocale } from '@/i18n/LocaleProvider';

/**
 * A tip after the trip (14 Nov, USA): 15/18/20% of the fare or a custom amount, charged to the
 * trip's card, 100% to the driver. Shown only where the market has tips on.
 */
export function TipCard({ tripId, fare, currency, presets, given }: {
  tripId: string; fare: number; currency: string; presets: number[]; given: string | null;
}) {
  const tr = useTr();
  const { locale } = useLocale();
  const [pick, setPick] = useState<number | 'custom' | null>(null);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(given);
  const [err, setErr] = useState<string | null>(null);
  if (done) {
    return (
      <div className="acard acol" style={{ padding: 16, gap: 6 }} data-testid="tip-done">
        <div className="ab">{tr('You tipped {amount}').replace('{amount}', money(done, currency, locale) ?? done)}</div>
        <div className="a14 amut">{tr('100% goes to your driver.')}</div>
      </div>
    );
  }
  const amountOf = (p: number) => (Math.round(fare * p) / 100).toFixed(2);
  async function send() {
    if (pick === null) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await tipTrip(tripId, pick === 'custom' ? { amount: custom } : { percent: pick });
      setDone(r.amount);
    } catch (e) {
      setErr((e as { message?: string })?.message || tr('We could not add the tip. Nothing was charged.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="acard acol" style={{ padding: 16, gap: 10 }} data-testid="tip-card" aria-labelledby="tip-title">
      <h2 className="a20" id="tip-title">{tr('Add a tip')}</h2>
      <p className="a14 amut">{tr('100% goes to your driver. Charged to the card you paid with.')}</p>
      <div className="arow" style={{ gap: 8, flexWrap: 'wrap' }} role="radiogroup" aria-label={tr('Tip')}>
        {presets.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={pick === p} className={`achip${pick === p ? ' achip--on' : ''}`}
            onClick={() => setPick(p)} data-testid={`tip-${p}`}>
            {p}% · {money(amountOf(p), currency, locale)}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={pick === 'custom'} className={`achip${pick === 'custom' ? ' achip--on' : ''}`}
          onClick={() => setPick('custom')} data-testid="tip-custom">{tr('Other amount')}</button>
      </div>
      {pick === 'custom' && (
        <label className="acol a14" style={{ gap: 4 }}>
          <span className="ab">{tr('Tip amount')}</span>
          <span className="ainput"><input inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="5.00" aria-label={tr('Tip amount')} /></span>
        </label>
      )}
      {err && <p className="a14 ared" role="alert">{err}</p>}
      <button type="button" className="abtn abtn--pri abtn--block" disabled={pick === null || busy || (pick === 'custom' && !Number(custom))}
        onClick={send} data-testid="tip-send">
        {busy ? tr('Please wait…') : pick === null ? tr('Choose a tip') : tr('Tip {amount}').replace('{amount}',
          money(pick === 'custom' ? (custom || '0') : amountOf(pick), currency, locale) ?? '')}
      </button>
    </section>
  );
}

/**
 * "Report driver impairment" (14 Nov; Idaho Code 49-3709): the rider says the driver seemed impaired
 * by drugs or alcohol. Where the market requires it the driver is paused at once while we look into it.
 */
export function ReportImpairment({ tripId }: { tripId: string }) {
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setErr(null);
    try {
      const r = await reportImpairment(tripId, text);
      setResult(r.message);
    } catch {
      setErr(tr('We could not send your report. Try again, or call support.'));
    } finally {
      setBusy(false);
    }
  }
  if (result) return <p className="anote a14" role="status" data-testid="impairment-done">{result}</p>;
  if (!open) {
    return (
      <button type="button" className="abtn abtn--ghost abtn--block" onClick={() => setOpen(true)} data-testid="report-impairment">
        {tr('Report driver impairment')}
      </button>
    );
  }
  return (
    <section className="acard acol" style={{ padding: 16, gap: 10 }} aria-labelledby="zt-title" data-testid="impairment-form">
      <h2 className="a20" id="zt-title">{tr('Report driver impairment')}</h2>
      <p className="a14 amut">{tr('Tell us if your driver seemed affected by drugs or alcohol. We pause the driver at once while we investigate. If you are in danger, call 911 first.')}</p>
      <label className="acol a14" style={{ gap: 4 }}>
        <span className="ab">{tr('What happened (optional)')}</span>
        <textarea className="ainput" style={{ height: 96, padding: 12, font: 'inherit' }} value={text} maxLength={2000}
          onChange={(e) => setText(e.target.value)} />
      </label>
      {err && <p className="a14 ared" role="alert">{err}</p>}
      <div className="arow" style={{ gap: 8 }}>
        <button type="button" className="abtn abtn--pri agrow" onClick={send} disabled={busy} data-testid="impairment-send">
          {busy ? tr('Please wait…') : tr('Send report')}
        </button>
        <button type="button" className="abtn abtn--ghost" onClick={() => setOpen(false)}>{tr('Cancel')}</button>
      </div>
    </section>
  );
}
