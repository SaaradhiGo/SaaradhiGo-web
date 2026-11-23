'use client';

import { RANGE_PRESETS, presetRange, todayLocal } from '@/lib/reports';

/**
 * Date presets for every page with a date range (owner, 23 Nov): Today, 7 days, 30 days,
 * 90 days, 12 months, Custom. A preset applies at once; Custom moves focus to the page's own
 * "From" field. The preset that matches the current range shows as pressed.
 */
export function DatePresets({
  from, to, onPick, customFieldId, onCustom, today = todayLocal(),
}: {
  from: string;
  to: string;
  onPick: (range: { from: string; to: string }) => void;
  /** The id of the page's own "From" input, focused by Custom. */
  customFieldId?: string;
  /** Or: what Custom does when the date fields sit in a drawer that is closed. */
  onCustom?: () => void;
  today?: string;
}) {
  const match = RANGE_PRESETS.find((p) => {
    const r = presetRange(p.days, today);
    return r.from === from && r.to === to;
  });
  const custom = Boolean(from || to) && !match;
  return (
    <div className="ops-seg ops-presets" role="group" aria-label="Date range">
      {RANGE_PRESETS.map((p) => (
        <button key={p.days} type="button" className="ops-seg__btn" aria-pressed={match?.days === p.days}
          onClick={() => onPick(presetRange(p.days, today))}>{p.label}</button>
      ))}
      {onCustom ? (
        <button type="button" className="ops-seg__btn" aria-pressed={custom} onClick={onCustom}>Custom</button>
      ) : customFieldId ? (
        <button type="button" className="ops-seg__btn" aria-pressed={custom}
          onClick={() => {
            // The page's own date fields; open the filter panel they sit in first.
            const el = document.getElementById(customFieldId);
            const panel = el?.closest('details');
            if (panel && !panel.open) panel.open = true;
            window.setTimeout(() => el?.focus(), 0);
          }}>Custom</button>
      ) : null}
    </div>
  );
}
