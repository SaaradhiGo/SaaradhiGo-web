'use client';

import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import type { FareQuote } from '@/lib/booking';
import { money } from '@/lib/area/format';
import { FareLinesList } from './FareLinesList';

/**
 * How the fare is worked out (MVAG 2025 disclosure, 9 Nov): the base fare, the demand
 * multiplier as "Higher demand" or "Lower demand" (never "surge"), the tax and the total. And,
 * before booking, a cancellation fee from an earlier trip that this ride will carry.
 */
type Breakdown = {
  base_fare?: string; distance_fare?: string; time_fare?: string; surge_multiplier?: string;
  demand_label?: string | null; tax_label?: string | null; tax_amount?: string | null; tax_mode?: string | null;
};

export function FareWorkings({ quote }: { quote: FareQuote }) {
  const tr = useTr();
  const { locale } = useLocale();
  const b = (quote.fare_breakdown ?? {}) as Breakdown;
  const cur = quote.currency;
  const metered = ['base_fare', 'distance_fare', 'time_fare'].reduce((s, k) => s + Number(b[k as keyof Breakdown] ?? 0), 0);
  const due = quote.cancellation_due;
  return (
    <>
      <details className="a14">
        <summary className="amut">{tr('How this fare is worked out')}</summary>
        {quote.fare_lines ? (
          <div className="a14" style={{ marginTop: 8 }}><FareLinesList lines={quote.fare_lines} compact /></div>
        ) : (
        <dl className="acol" style={{ gap: 4, margin: '8px 0 0' }}>
          <div className="arow"><dt className="agrow">{tr('Base fare')}</dt><dd>{money(b.base_fare ?? 0, cur, locale)}</dd></div>
          <div className="arow"><dt className="agrow">{tr('Distance and time')}</dt>
            <dd>{money(metered - Number(b.base_fare ?? 0), cur, locale)}</dd></div>
          {b.demand_label ? (
            <div className="arow"><dt className="agrow">{tr(b.demand_label)}</dt><dd>×{Number(b.surge_multiplier ?? 1).toFixed(2)}</dd></div>
          ) : null}
          {b.tax_label && Number(b.tax_amount ?? 0) > 0 ? (
            <div className="arow"><dt className="agrow">{b.tax_label}{b.tax_mode === 'inclusive' ? ` (${tr('included')})` : ''}</dt>
              <dd>{money(b.tax_amount, cur, locale)}</dd></div>
          ) : null}
          <div className="arow ab"><dt className="agrow">{tr('Total')}</dt><dd>{money(quote.estimated_fare, cur, locale)}</dd></div>
        </dl>
        )}
      </details>
      {due ? (
        <p className="a14" role="note" style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--c-warn-bg)' }}>
          {tr('A cancellation fee of {amount} from an earlier trip is added to this ride.')
            .replace('{amount}', money(due.amount, due.currency, locale) ?? '')}
        </p>
      ) : null}
    </>
  );
}
