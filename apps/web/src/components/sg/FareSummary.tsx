import type { ReactNode } from 'react';
import { Lock } from './icons';
import { currencySymbol, fareDigits } from '@/lib/money';

/**
 * The confirmed price before booking: the total, an itemised breakdown and
 * the fare-lock promise.
 *
 * The total is the largest number on the screen (`fare-xl`, 40/44, 800), with
 * the rupee sign in `gold-text` and the digits in `ink`. Breakdown rows are
 * `ink-muted` with tabular figures, so the amounts align in a column.
 *
 * NEVER A LUMP "FEES" ROW. Base, distance, time, tolls and taxes appear as
 * they apply, under the names the server gave them. A rider who can see the
 * total but not what is in it has been shown a number, not a fare.
 */

export function FareLock({ children }: { children?: ReactNode }) {
  // The handoff writes this line as "Fare locked. No surprise surge after you
  // book." The brief's copy rules allow the word in exactly one phrase -- "No
  // surge after you book" -- and this is that promise, so it is written the
  // sanctioned way. Nothing else changes: it is still the fare-lock line,
  // shown wherever the fare is fixed.
  return (
    <div className="sg-fare__lock">
      <Lock />
      {children ?? 'Fare locked. No surge after you book.'}
    </div>
  );
}

export function FareSummary({
  label = 'Total fare',
  amount,
  currency,
  rows,
  badge,
  lock = true,
}: {
  label?: string;
  /** The exact amount the server quoted. */
  amount: string | number | null | undefined;
  currency?: string | null;
  /**
   * The breakdown, already named by the server. An empty list renders no
   * breakdown at all rather than an invented one.
   */
  rows?: { label: string; amount: string }[];
  badge?: ReactNode;
  lock?: boolean;
}) {
  const digits = fareDigits(amount);
  const symbol = currencySymbol(currency);

  return (
    <div className="sg-fare">
      <div className="sg-fare__head">
        <div>
          <div className="label text-ink-subtle uppercase">{label}</div>
          <div className="sg-fare__total">
            {digits === null ? (
              // The quote did not come back. Saying so is the only honest
              // thing a fare panel can do; a 0 would read as a free ride.
              <span className="title text-ink-muted">Fare unavailable</span>
            ) : (
              <>
                {symbol && <small>{symbol}</small>}
                {digits}
              </>
            )}
          </div>
        </div>
        {badge}
      </div>

      {rows && rows.length > 0 && (
        <ul className="sg-fare__rows">
          {rows.map((r) => (
            <li key={r.label}>
              <span>{r.label}</span>
              <span>{r.amount}</span>
            </li>
          ))}
        </ul>
      )}

      {lock && digits !== null && <FareLock />}
    </div>
  );
}
