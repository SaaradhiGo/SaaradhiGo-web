'use client';

import type { AdminAccess } from '@/lib/adminScope';
import {
  type FinanceBlock, perCurrency, reconciliationHref, takeRateLabel,
} from '@/lib/financeActions';
import { formatMinor } from '@/lib/trips';
import { MetricTile, TileGrid } from '@/components/console/ui';

/**
 * One finance row per city and currency (finance.aggregate): GMV, take rate,
 * payouts pending and open reconciliation findings. Totals only: never a
 * driver, never a sum across currencies. The reconciliation tile is a link
 * ONLY for a finance.read holder (the link rule); for anyone else it is the
 * number as text.
 */
export function FinanceTiles({ finance, access, city }: {
  finance: FinanceBlock | undefined; access: AdminAccess | null; city: string | null;
}) {
  if (!finance || !finance.visible) return null;
  const tiles = city ? finance.tiles.filter((t) => t.code === city) : finance.tiles;
  if (tiles.length === 0) return null;
  const href = reconciliationHref(finance, access);
  return (
    <section className="ops-cc-fin" aria-label="Money, totals only">
      {tiles.map((t) => (
        <div key={t.code}>
          <h3>{t.name} · money, totals only</h3>
          <TileGrid>
            {perCurrency(t.gmv).map(([cur, minor]) => (
              <MetricTile key={`gmv-${cur}`} label={`GMV · ${cur}`} tone="money" value={formatMinor(minor, cur)} />
            ))}
            {perCurrency(t.take_rate_percent as Record<string, number>).map(([cur]) => {
              const label = takeRateLabel(t.take_rate_percent[cur]);
              return (
                <MetricTile key={`take-${cur}`} label={`Take rate · ${cur}`} value={label}
                  note={label ? `${formatMinor(t.commission[cur] ?? 0, cur)} commission` : 'Nothing settled in this window'} />
              );
            })}
            <MetricTile label="Payouts pending" value={t.payouts_pending.count}
              note={perCurrency(t.payouts_pending.amount).map(([c, m]) => formatMinor(m, c)).join(' · ') || undefined} />
            <MetricTile label="Open reconciliation findings" value={t.reconciliation.open_findings}
              tone={t.reconciliation.open_findings > 0 ? 'wait' : 'neutral'}
              href={href} />
          </TileGrid>
        </div>
      ))}
    </section>
  );
}
