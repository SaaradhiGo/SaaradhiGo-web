'use client';

import { oneLine } from '@/lib/money';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import type { FareLines } from '@/lib/area/rider';
import { money } from '@/lib/area/format';

/**
 * The fare lines (12 Nov), the same on the tax invoice and in "How this fare is worked out":
 * every line before tax, the taxable value they add up to, the tax ("GST 5% (included)" where the
 * fare already contains it), any flat fee, and the total. The server builds them so they add up to
 * the paisa (servers/ride/invoice_lines.py); this only lays them out. Tolls, airport fees and permits
 * (27 Nov) sit under "Collected on behalf of others", each with whom it is collected for.
 */
export function FareLinesList({ lines, compact = false }: { lines: FareLines; compact?: boolean }) {
  const tr = useTr();
  const { locale } = useLocale();
  const cur = lines.currency;
  const pad = compact ? '2px 0' : '8px 0';
  const row = (key: string, label: string, amount: string, strong = false) => (
    <div key={key} className="arow" style={{ justifyContent: 'space-between', padding: pad, gap: 12 }}>
      <dt className={strong ? 'ab agrow' : 'agrow'}>{label}</dt>
      <dd className={strong ? 'ab' : undefined} style={{ margin: 0 }}>{money(amount, cur, locale)}</dd>
    </div>
  );
  const onBehalf = lines.extras.filter((l) => l.on_behalf);
  const taxName = `${lines.tax.label} ${lines.tax.percent}%${lines.tax.included ? ` (${tr('included')})` : ''}`;
  return (
    <dl className="acol" style={{ gap: 0, margin: 0 }} data-testid="fare-lines">
      {lines.lines.map((l, i) => row(`l${i}`, tr(l.label), l.amount))}
      {lines.tax_shown !== false && lines.taxable != null && row('taxable', tr('Taxable value'), lines.taxable, true)}
      {lines.tax_shown !== false && (Number(lines.tax.percent) > 0 || Number(lines.tax.amount) > 0) ? row('tax', taxName, lines.tax.amount) : null}
      {lines.extras.filter((l) => !l.on_behalf).map((l, i) => row(`x${i}`, tr(l.label), l.amount))}
      {onBehalf.length ? row('ob', tr(lines.on_behalf_title ?? 'Collected on behalf of others'),
        String(onBehalf.reduce((t, l) => t + Number(l.amount), 0)), true) : null}
      {onBehalf.map((l, i) => (
        <div key={`ob${i}`} className="arow" style={{ justifyContent: 'space-between', padding: pad, gap: 12 }} data-testid="fare-lines-on-behalf">
          <dt className="agrow">{tr(l.label)}{l.note ? <span className="amut a12" style={{ display: 'block' }}>{tr(l.note)}</span> : null}</dt>
          <dd style={{ margin: 0 }}>{money(l.amount, cur, locale)}</dd>
        </div>
      ))}
      {/* A US receipt (14 Nov, Srini): Fare, Booking fee, Tip, Total charged. */}
      {lines.total_charged != null ? (
        <>
          {lines.tip ? row('tip', tr('Tip (100% to your driver)'), lines.tip) : null}
          {row('total', tr('Total charged'), lines.total_charged, true)}
        </>
      ) : row('total', tr('Total'), lines.total, true)}
      {(lines.refunds ?? []).map((r, i) => (
        <div key={`r${i}`} className="arow" style={{ justifyContent: 'space-between', padding: pad, gap: 12 }} data-testid="fare-lines-refund">
          <dt className="agrow">{tr(r.label)} · {r.date}</dt>
          <dd style={{ margin: 0 }}>{oneLine(`−${money(r.amount, cur, locale)}`)}</dd>
        </div>
      ))}
      {lines.net_charged != null ? row('net', tr('Net charged'), lines.net_charged, true) : null}
    </dl>
  );
}
