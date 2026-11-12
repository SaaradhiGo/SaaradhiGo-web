'use client';

import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import type { FareLines } from '@/lib/area/rider';
import { money } from '@/lib/area/format';

/**
 * The fare lines (12 Nov), the same on the tax invoice and in "How this fare is worked out":
 * every line before tax, the taxable value they add up to, the tax ("GST 5% (included)" where the
 * fare already contains it), any flat fee, and the total. The server builds them so they add up to
 * the paisa (servers/ride/invoice_lines.py); this only lays them out.
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
  const taxName = `${lines.tax.label} ${lines.tax.percent}%${lines.tax.included ? ` (${tr('included')})` : ''}`;
  return (
    <dl className="acol" style={{ gap: 0, margin: 0 }} data-testid="fare-lines">
      {lines.lines.map((l, i) => row(`l${i}`, tr(l.label), l.amount))}
      {row('taxable', tr('Taxable value'), lines.taxable, true)}
      {Number(lines.tax.percent) > 0 || Number(lines.tax.amount) > 0 ? row('tax', taxName, lines.tax.amount) : null}
      {lines.extras.map((l, i) => row(`x${i}`, tr(l.label), l.amount))}
      {row('total', tr('Total'), lines.total, true)}
    </dl>
  );
}
