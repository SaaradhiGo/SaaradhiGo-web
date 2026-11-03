import type { ReactNode } from 'react';

export const NOT_ENOUGH = 'Not enough data yet';

/** A sparkline drawn to scale from real points; nothing when there are fewer than two. */
export function Sparkline({ points, label }: { points: number[]; label: string }) {
  if (points.length < 2) return null;
  const w = 96;
  const h = 28;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const xy = points.map((v, i) => `${((i * w) / (points.length - 1)).toFixed(1)},${(h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)}`);
  const last = xy[xy.length - 1].split(',');
  return (
    <svg className="ops-spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
      <polyline points={xy.join(' ')} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill="currentColor" />
    </svg>
  );
}

/**
 * One number that matters, with its line for today and where it sits against
 * the usual range (design board D). `value` null means "not enough data yet":
 * shown in words, never as a misleading 0 or 0.2 min. `usual` is drawn only
 * when the server computed one from real history.
 */
export function MetricCard({
  label, value, unit, points, usual, tone = 'neutral', note,
}: {
  label: string;
  value: string | null;
  unit?: string;
  points?: number[];
  usual?: string | null;
  tone?: 'neutral' | 'critical' | 'caution';
  note?: ReactNode;
}) {
  return (
    <div className={`ops-metric ops-metric--${tone}`}>
      <div className="ops-metric__label">{label}</div>
      <div className="ops-metric__row">
        <div className={`ops-metric__value sg-num${value === null ? ' ops-metric__value--empty' : ''}`}>
          {value === null ? NOT_ENOUGH : <>{value}{unit ? <small> {unit}</small> : null}</>}
        </div>
        {value !== null && points ? <Sparkline points={points} label={`${label} today, hour by hour`} /> : null}
      </div>
      {usual ? <div className="ops-metric__usual">{usual}</div> : null}
      {note ? <div className="ops-metric__note">{note}</div> : null}
    </div>
  );
}
