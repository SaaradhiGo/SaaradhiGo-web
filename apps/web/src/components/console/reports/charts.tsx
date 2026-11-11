'use client';

import { useId, useState } from 'react';
import {
  type Cohort, type Granularity, type Pivot, type ReportColumn, formatCell, groupWord, niceScale,
  periodLabel, stackMax, STAGE_WORDS,
} from '@/lib/reports';

/**
 * The report charts, as inline SVG (no chart package).
 *
 * ONE AXIS, ONE CURRENCY. A money report draws one panel per currency, so no axis ever carries two
 * currencies and no bar is a sum of rupees and dollars. Series colours are the five `--chart-*`
 * tokens in a fixed order (validated for colour-blind separation on both themes); the colour
 * follows the entity (vehicle class or city), not its rank. A legend is always drawn for two or
 * more series and a table with the same numbers sits under every chart, so identity never rests on
 * colour alone. Marks are thin, bars have a 2px gap, the grid is recessive.
 */

const W = 720;
const H = 260;
const PAD = { top: 12, right: 12, bottom: 28, left: 92 };
const MAX_SERIES = 5;
const CHART_TOKENS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

type Folded = { name: string; values: Array<number | null>; token: string };

/** At most five coloured series; the rest fold into one neutral "Other". */
function fold(p: Pivot): Folded[] {
  const head = p.series.slice(0, MAX_SERIES).map((s, i) => ({ ...s, token: CHART_TOKENS[i] }));
  const rest = p.series.slice(MAX_SERIES);
  if (!rest.length) return head;
  const values = p.periods.map((_, i) => rest.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  return [...head, { name: 'Other', values, token: 'var(--ops-ink-5)' }];
}

export function Legend({ names }: { names: Array<{ name: string; token: string }> }) {
  if (names.length < 2) return null;
  return (
    <ul className="rp-legend" aria-label="Series">
      {names.map((n) => (
        <li key={n.name}><span className="rp-swatch" style={{ background: n.token }} aria-hidden="true" />{groupWord(n.name)}</li>
      ))}
    </ul>
  );
}

export function StackedBars({
  pivot, column, currency, granularity, title,
}: {
  pivot: Pivot; column: ReportColumn; currency: string | null; granularity: Granularity; title: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId();
  const series = fold({ ...pivot, series: pivot.series.filter((s) => s.values.some((v) => (v ?? 0) > 0)) });
  const periods = pivot.periods;
  const { top, ticks } = niceScale(stackMax(pivot));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const band = innerW / Math.max(periods.length, 1);
  const barW = Math.min(36, Math.max(2, band * 0.66));
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const every = Math.ceil(periods.length / 8);
  // Axis labels drop the decimals of a money figure; the tooltip and the table keep them.
  const axisFmt = (v: number) => formatCell(column, v, currency).replace(/[.,]00$/, '');

  const tip = hover === null ? null : {
    period: periods[hover],
    rows: series.map((s) => ({ name: s.name, token: s.token, value: s.values[hover] })),
  };
  const summary = `${title}: ${series.length} series over ${periods.length} ${granularity === 'day' ? 'days' : granularity === 'week' ? 'weeks' : 'months'}.`;

  return (
    <figure className="rp-chart" aria-labelledby={`${uid}-t`}>
      <figcaption id={`${uid}-t`} className="rp-chart__title">{title}</figcaption>
      <Legend names={series} />
      <div className="rp-chart__plot">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary} className="rp-svg"
          onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="rp-grid" />
              <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" className="rp-axis">{axisFmt(t)}</text>
            </g>
          ))}
          {periods.map((p, i) => {
            const x = PAD.left + band * i + (band - barW) / 2;
            let acc = 0;
            return (
              <g key={p}>
                {series.map((s) => {
                  const v = s.values[i] ?? 0;
                  if (v <= 0) return null;
                  const y1 = y(acc + v);
                  const h = y(acc) - y1;
                  acc += v;
                  // 2px surface gap between stacked segments: shave the segment, keep its position.
                  return <rect key={s.name} x={x} y={y1} width={barW} height={Math.max(h - 2, 1)}
                    rx={2} fill={s.token} opacity={hover === null || hover === i ? 1 : 0.55} />;
                })}
                {i % every === 0 ? (
                  <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="rp-axis">{periodLabel(p, granularity)}</text>
                ) : null}
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent"
                  onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
        </svg>
        {tip ? (
          <div className="rp-tip" role="status" style={{ left: `${Math.min(80, Math.max(2, (hover! / Math.max(periods.length, 1)) * 100))}%` }}>
            <b>{periodLabel(tip.period, granularity)}</b>
            {tip.rows.map((r) => (
              <span key={r.name}><span className="rp-swatch" style={{ background: r.token }} aria-hidden="true" />
                {groupWord(r.name)}: {formatCell(column, r.value, currency)}</span>
            ))}
          </div>
        ) : null}
      </div>
    </figure>
  );
}

/** The trips funnel: requested -> accepted -> completed, one bar each, widths to the largest. */
export function Funnel({ stages }: { stages: Array<{ stage: string; count: number }> }) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <figure className="rp-chart">
      <figcaption className="rp-chart__title">Trips funnel</figcaption>
      <ol className="rp-funnel" aria-label="Trips funnel">
        {stages.map((s, i) => (
          <li key={s.stage}>
            <span className="rp-funnel__label">{STAGE_WORDS[s.stage] ?? s.stage}</span>
            <span className="rp-funnel__track" aria-hidden="true">
              <span className="rp-funnel__bar" style={{ width: `${(s.count / max) * 100}%`, background: CHART_TOKENS[i === 0 ? 2 : i === 1 ? 4 : 3] }} />
            </span>
            <span className="rp-funnel__n">{s.count.toLocaleString('en-US')}
              {i > 0 && stages[0].count ? <small> {((s.count / stages[0].count) * 100).toFixed(0)}% of requests</small> : null}
            </span>
          </li>
        ))}
      </ol>
      <p className="help m-0">Completed trips are counted on the day they completed, so the last step can differ slightly from the requests of the same days.</p>
    </figure>
  );
}

/** Weekly cohorts by weeks since the first trip. Shading is one hue, light to dark with the share. */
export function CohortTable({ cohorts }: { cohorts: Cohort[] }) {
  const width = Math.max(...cohorts.map((c) => c.percent.length), 0);
  return (
    <div className="rp-cohort__wrap">
      <table className="rp-cohort">
        <caption className="sr-only">Rider retention by weekly cohort: the share of each cohort that rode again N weeks later</caption>
        <thead>
          <tr>
            <th scope="col">Cohort week</th>
            <th scope="col" className="num">Riders</th>
            {Array.from({ length: width }, (_, k) => <th scope="col" key={k} className="num">{k === 0 ? 'Week 0' : `+${k}`}</th>)}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.week}>
              <th scope="row">{periodLabel(c.week, 'week')}</th>
              <td className="num">{c.size.toLocaleString('en-US')}</td>
              {Array.from({ length: width }, (_, k) => {
                const p = c.percent[k];
                return p === undefined ? <td key={k} /> : (
                  <td key={k} className="num rp-cohort__cell"
                    style={{ background: `color-mix(in srgb, var(--chart-3) ${Math.round((p ?? 0) * 0.7)}%, transparent)` }}
                    title={`${c.retained[k]} of ${c.size} riders`}>
                    {p === null ? '—' : `${p.toFixed(0)}%`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
