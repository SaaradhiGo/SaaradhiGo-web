'use client';

import { useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { ApiError } from '@/lib/api';
import { areaGet, areaPost } from '@/lib/area/api';
import type { Balance } from '@/lib/area/driver';
import { deduction, money } from '@/lib/area/format';

/**
 * Withdraw now (owner ruling, 9 Nov): only where instant cash-out is on for the driver's city.
 * The confirmation shows the amount, the provider's own fee (SaaradhiGo's is 0), what the driver
 * receives, where it goes and when it arrives. The fee shown is the fee charged: both come from
 * the server's one fee rule.
 */
export type InstantQuote = {
  amount: string; provider_fee: string; provider_fee_label: string; saaradhigo_fee: string;
  you_receive: string; currency: string; destination: string | null; arrival: string; valid: boolean;
  /** The daily limit (10 Nov): the reason, shown here before the driver taps. */
  limit_reached?: boolean; limit_message?: string;
};

export function NextPayout({ bal }: { bal: Balance }) {
  const tr = useTr();
  const { locale } = useLocale();
  const next = bal.next_payout;
  if (!next) return <div className="a14" style={{ marginTop: 10 }}>{tr('Payouts here are on request.')}</div>;
  const date = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(next.at));
  return (
    <div className="a14" style={{ marginTop: 10 }}>
      {tr('Next payout: {date} · estimated {amount}')
        .replace('{date}', date)
        .replace('{amount}', money(next.estimated_amount, next.currency, locale) ?? '—')}
    </div>
  );
}

export function WithdrawNow({ bal, onDone }: { bal: Balance; onDone: () => void }) {
  const tr = useTr();
  const { locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(bal.available_balance ?? ''));
  const [quote, setQuote] = useState<InstantQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  if (!bal.instant?.available) return null;

  const m = (v: string | null | undefined) => money(v ?? 0, quote?.currency ?? bal.currency, locale);
  const fail = (e: unknown) => setError(e instanceof ApiError && e.fromServer ? e.message : tr('That did not go through. Nothing was changed.'));

  async function check() {
    setBusy(true); setError(null); setQuote(null);
    try {
      setQuote(await areaGet<InstantQuote>(`/driver/withdrawals/instant/quote/?amount=${encodeURIComponent(amount)}`));
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function confirm() {
    setBusy(true); setError(null);
    try {
      await areaPost('/driver/withdrawals/request/', { amount, instant: true });
      setDone(true); onDone();
    } catch (e) { fail(e); } finally { setBusy(false); }
  }

  if (!open) {
    return (
      <button type="button" className="abtn abtn--pri" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
        {tr('Withdraw now')}
      </button>
    );
  }
  return (
    <div className="acard acol" style={{ marginTop: 12, padding: 16, gap: 10, color: 'var(--c-text)' }} role="dialog" aria-label={tr('Withdraw now')}>
      {done ? (
        <p className="ab" role="status">{tr('Your withdrawal is on its way.')}</p>
      ) : (
        <>
          <label className="a14" htmlFor="wn-amount">{tr('Amount')}</label>
          <input id="wn-amount" className="ainput" inputMode="decimal" value={amount}
            onChange={(e) => { setAmount(e.target.value); setQuote(null); }} />
          {quote ? (
            <dl className="acol a14" style={{ gap: 4, margin: 0 }}>
              <div className="arow"><dt className="agrow">{tr('Amount')}</dt><dd>{m(quote.amount)}</dd></div>
              <div className="arow"><dt className="agrow">{quote.provider_fee_label}</dt><dd>{deduction(quote.provider_fee, quote.currency ?? bal.currency, locale).text}</dd></div>
              <div className="arow"><dt className="agrow">{tr('SaaradhiGo fee')}</dt><dd>{m(quote.saaradhigo_fee)}</dd></div>
              <div className="arow ab"><dt className="agrow">{tr('You receive')}</dt><dd>{m(quote.you_receive)}</dd></div>
              {quote.destination && <div className="arow"><dt className="agrow">{tr('To')}</dt><dd>{quote.destination}</dd></div>}
              <div className="arow"><dt className="agrow">{tr('Arrives')}</dt><dd>{tr(quote.arrival)}</dd></div>
            </dl>
          ) : null}
          {quote?.limit_reached && quote.limit_message ? <p className="a14 ared" role="alert">{quote.limit_message}</p> : null}
          {error && <p className="a14 ared" role="alert">{error}</p>}
          <div className="arow" style={{ gap: 8 }}>
            <button type="button" className="abtn abtn--ghost" onClick={() => setOpen(false)} disabled={busy}>{tr('Back')}</button>
            {quote && quote.valid ? (
              <button type="button" className="abtn abtn--pri agrow" onClick={() => void confirm()} disabled={busy}>
                {busy ? tr('Working…') : tr('Withdraw {amount}').replace('{amount}', m(quote.you_receive) ?? '')}
              </button>
            ) : (
              <button type="button" className="abtn abtn--pri agrow" onClick={() => void check()} disabled={busy || !amount}>
                {busy ? tr('Working…') : tr('See the fee')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
