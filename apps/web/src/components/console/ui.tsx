'use client';

import Link from 'next/link';
import {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { Density } from '@/lib/consolePrefs';
import { Chevron, Close, Sliders, SortArrow } from '@/components/console/icons';

/**
 * The console's shared parts.
 *
 * They exist so seven pages stop inventing seven versions of a table, and
 * so two rules are enforced in one place rather than remembered seven
 * times:
 *
 *   * a number nobody could load is NOT shown as zero;
 *   * an empty table says whether it is empty or broken.
 *
 * Both were real: a dashboard of zeroes is indistinguishable from a
 * dashboard whose requests all failed, and an operator who reads "0
 * withdrawals pending" when the fetch died stops looking.
 */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ops-head">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="ops-head__actions">{actions}</div> : null}
    </header>
  );
}

/**
 * A figure.
 *
 * `value` of `null` means "we could not load this" and renders as
 * "Unavailable", never as 0. `money` only changes the colour; it does not
 * format — the caller owns the currency, because the server tells us which
 * one and a component guessing it is how rupees get printed as dollars.
 */
export function Stat({
  label,
  value,
  note,
  money = false,
}: {
  label: string;
  value: string | number | null | undefined;
  note?: ReactNode;
  money?: boolean;
}) {
  const missing = value === null || value === undefined || value === '';
  return (
    <div className="ops-stat">
      <span className="ops-stat__label">{label}</span>
      <span
        className={[
          'ops-stat__value',
          money && !missing ? 'ops-stat__value--money' : '',
          missing ? 'ops-stat__value--unknown' : '',
        ].filter(Boolean).join(' ')}
      >
        {missing ? 'Unavailable' : value}
      </span>
      {note ? <span className="ops-stat__note">{note}</span> : null}
    </div>
  );
}

export function StatStrip({ children }: { children: ReactNode }) {
  return <div className="ops-stats">{children}</div>;
}

/**
 * The one figure worth leading with, at a size that says so.
 *
 * The dashboard had no such place: its money carried exactly the weight of
 * the word above it, which is how a page ends up with nowhere to look
 * first. `value` of null renders as "Unavailable", same rule as `Stat`.
 */
export function Hero({
  label,
  value,
  note,
  facts,
}: {
  label: string;
  value: string | null | undefined;
  note?: ReactNode;
  facts?: Array<{ label: string; value: ReactNode }>;
}) {
  const missing = value === null || value === undefined || value === '';
  return (
    <section className="ops-hero">
      <div>
        <span className="ops-hero__label">{label}</span>
        <div className={`ops-hero__value ${missing ? 'ops-hero__value--unknown' : ''}`}>
          {missing ? 'Unavailable' : value}
        </div>
        {note ? <div className="ops-hero__note">{note}</div> : null}
      </div>
      {facts?.length ? (
        <div className="ops-hero__side">
          {facts.map((f) => (
            <div className="ops-hero__fact" key={f.label}>
              <b>{f.value}</b>
              <span>{f.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/**
 * A row of filters is navigation, not a row of buttons.
 *
 * Segmented so the set reads as one control, and `aria-pressed` so the
 * chosen one is announced rather than only coloured.
 */
export function Filters<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: ReadonlyArray<{ key: T; label: string }>;
  onChange: (key: T) => void;
}) {
  return (
    <div className="ops-filters" role="group" aria-label="Filter">
      {options.map((o) => (
        <button
          key={o.key || 'all'}
          type="button"
          className="ops-filter"
          aria-pressed={o.key === value}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A pile of work, as a link to where it is done.
 *
 * `count` drives the urgency: nothing waiting is quiet, something waiting
 * is gold, and `urgent` is red and reserved for things with a clock on
 * them — an open SOS, not an unread ticket.
 */
export function Queue({
  count,
  title,
  detail,
  href,
  urgent = false,
}: {
  count: number | null;
  title: string;
  detail: string;
  href: string;
  urgent?: boolean;
}) {
  const waiting = (count ?? 0) > 0;
  const tone = waiting ? (urgent ? 'ops-queue--urgent' : 'ops-queue--waiting') : '';
  return (
    <Link href={href} className={`ops-queue ${tone}`}>
      <span className="ops-queue__n">{count ?? '—'}</span>
      <span className="ops-queue__text">
        <b>{title}</b>
        <span>{detail}</span>
      </span>
      <span className="ops-queue__go" aria-hidden="true"><Chevron /></span>
    </Link>
  );
}

export function Panel({
  title,
  action,
  children,
  flush = false,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Tables sit flush; prose and forms get padding. */
  flush?: boolean;
}) {
  return (
    <section className="ops-panel">
      {title ? (
        <div className="ops-panel__head">
          <h2>{title}</h2>
          {action}
        </div>
      ) : null}
      {flush ? children : <div className="ops-panel__body">{children}</div>}
    </section>
  );
}

export type PillTone = 'good' | 'bad' | 'wait' | 'neutral';

/** Status, carried by a word. The colour only supports it. */
export function Pill({ tone = 'neutral', children }: { tone?: PillTone; children: ReactNode }) {
  const map: Record<PillTone, string> = {
    good: 'ops-pill--good',
    bad: 'ops-pill--bad',
    wait: 'ops-pill--wait',
    neutral: '',
  };
  return <span className={`ops-pill ${map[tone]}`}>{children}</span>;
}

/**
 * Nothing here — and WHY there is nothing.
 *
 * `error` is the whole point. An empty table and a failed request look the
 * same on screen, and an operator who reads "no payouts pending" when the
 * request actually failed stops looking for the payouts.
 */
export function Empty({
  title,
  detail,
  error = false,
}: {
  title: string;
  detail?: string;
  error?: boolean;
}) {
  return (
    <div className="ops-empty">
      <b style={error ? { color: 'var(--danger)' } : undefined}>{title}</b>
      {detail ? <span>{detail}</span> : null}
    </div>
  );
}

export function Facts({ children }: { children: ReactNode }) {
  return <dl className="ops-facts">{children}</dl>;
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="ops-fact">
      <dt>{label}</dt>
      <dd>{children ?? '—'}</dd>
    </div>
  );
}

/** A table that looks like every other table in the console. */
export function Table({
  head,
  children,
}: {
  head: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="ops-table">
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ===========================================================================
   The noir shell's additions: tiles, skeletons, a drawer and a table that
   an operator can sort, compact and drive from the keyboard.
   =========================================================================== */

/**
 * A metric, at a glance.
 *
 * Tabular figures so a column of tiles lines up; `null` renders as
 * "Unavailable", never 0 (the rule every figure in this console follows).
 * `delta` is the comparison against the same day last week and is drawn
 * ONLY when the server supplies one -- a tile must not invent a trend.
 * Given `href`, the whole tile is the quick link into the filtered list.
 */
export type Delta = {
  pct: number | null;
  label?: string;
  /** Replaces the default "NN%" magnitude, for a delta in another unit ("5.0 pp"). */
  text?: string;
} | null | undefined;

export function MetricTile({
  label,
  value,
  unit,
  note,
  delta,
  tone = 'neutral',
  href,
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  note?: ReactNode;
  delta?: Delta;
  tone?: 'neutral' | 'money' | 'urgent' | 'wait' | 'good';
  href?: string;
}) {
  const missing = value === null || value === undefined || value === '';
  const body = (
    <>
      <span className="ops-tile__label">{label}</span>
      <span className={`ops-tile__value ${missing ? 'ops-tile__value--unknown' : ''}`}>
        {missing ? 'Unavailable' : value}
        {!missing && unit ? <span className="ops-tile__unit">{unit}</span> : null}
      </span>
      {delta && delta.pct !== null && !missing ? (
        <span
          className={`ops-tile__delta ${delta.pct > 0 ? 'ops-tile__delta--up'
            : delta.pct < 0 ? 'ops-tile__delta--down' : 'ops-tile__delta--flat'}`}
        >
          {delta.pct > 0 ? '▲' : delta.pct < 0 ? '▼' : '■'}
          {' '}{delta.text ?? `${Math.abs(delta.pct).toFixed(0)}%`}
          <span> {delta.label ?? 'vs same day last week'}</span>
        </span>
      ) : note ? (
        <span className="ops-tile__note">{note}</span>
      ) : null}
    </>
  );
  const cls = `ops-tile ops-tile--${tone}`;
  return href
    ? <Link href={href} className={`${cls} ops-tile--link`}>{body}</Link>
    : <div className={cls}>{body}</div>;
}

export function TileGrid({ children }: { children: ReactNode }) {
  return <section className="ops-tiles">{children}</section>;
}

/**
 * A shape where content will be. Not a spinner: a skeleton tells the eye
 * where to land once the figures arrive, and the page does not jump when
 * they do. The parent carries `aria-busy`; the blocks are decoration.
 */
export function Skeleton({
  kind = 'text',
  count = 1,
  width,
}: {
  kind?: 'text' | 'tile' | 'row' | 'block' | 'queue';
  count?: number;
  width?: string;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={`ops-skel ops-skel--${kind}`}
          style={width ? { width } : undefined}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

/**
 * Something failed, said plainly, with the one thing the operator can do.
 * Distinct from `Empty`: an empty list is a fact, an error is a condition.
 */
export function ErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string;
  detail?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="ops-error" role="alert">
      <b>{title}</b>
      {detail ? <span>{detail}</span> : null}
      {onRetry ? (
        <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}

/**
 * A panel that slides in from the right and takes the keyboard with it.
 *
 * Used for filters and for the record behind a table row. It is a dialog:
 * focus moves to it on open, stays inside it while it is open (Tab wraps),
 * returns to where it came from on close, and Escape closes it. The scrim
 * is clickable and the page behind does not scroll.
 */
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtn.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="ops-drawer-root">
      <div className="ops-drawer__scrim" onClick={onClose} aria-hidden="true" />
      <div
        className={`ops-drawer ${wide ? 'ops-drawer--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
      >
        <div className="ops-drawer__head">
          <h2 id={titleId}>{title}</h2>
          <button
            ref={closeBtn}
            type="button"
            className="ops-iconbtn"
            onClick={onClose}
            aria-label="Close"
          >
            <Close />
          </button>
        </div>
        <div className="ops-drawer__body">{children}</div>
        {footer ? <div className="ops-drawer__foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/**
 * The strip above a table: how many, how dense, and the filters.
 */
export function TableToolbar({
  summary,
  density,
  onDensity,
  onFilters,
  filtersActive = 0,
  children,
}: {
  summary?: ReactNode;
  density: Density;
  onDensity: (d: Density) => void;
  onFilters?: () => void;
  filtersActive?: number;
  children?: ReactNode;
}) {
  return (
    <div className="ops-toolbar">
      <div className="ops-toolbar__left">
        {summary ? <span className="ops-toolbar__summary">{summary}</span> : null}
        {children}
      </div>
      <div className="ops-toolbar__right">
        <div className="ops-seg" role="group" aria-label="Row density">
          <button
            type="button"
            className="ops-seg__btn"
            aria-pressed={density === 'comfortable'}
            onClick={() => onDensity('comfortable')}
          >
            Comfortable
          </button>
          <button
            type="button"
            className="ops-seg__btn"
            aria-pressed={density === 'compact'}
            onClick={() => onDensity('compact')}
          >
            Compact
          </button>
        </div>
        {onFilters ? (
          <button type="button" className="ops-toolbtn" onClick={onFilters}>
            <Sliders />
            Filters
            {filtersActive > 0 ? (
              <span className="ops-toolbtn__n" aria-label={`${filtersActive} active`}>
                {filtersActive}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type Column<T> = {
  key: string;
  label: ReactNode;
  render: (row: T) => ReactNode;
  /** Present: the column sorts by this. Absent: it does not sort. */
  sortValue?: (row: T) => string | number | null | undefined;
  num?: boolean;
  width?: string;
  /** Drops the column below this viewport width. */
  hideBelow?: 1280 | 1100;
};

export type SortState = { key: string; dir: 'asc' | 'desc' } | null;

/**
 * The table every list in the console is now built on.
 *
 *   * the header stays put while the body scrolls;
 *   * a column with `sortValue` sorts on click, announced through
 *     `aria-sort`, and the current sort survives a reload of the rows;
 *   * `density` is the operator's choice, kept in their preferences;
 *   * with `onRow`, each row is focusable: Enter or Space opens it, the
 *     arrow keys move between rows, and a click anywhere that is not a
 *     link or a button opens it too.
 *
 * Sorting is client-side over the rows given. The lists load fifty rows
 * and say so; sorting a page is honest as long as the page says it is a
 * page, which the toolbar's summary does.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRow,
  selectedKey,
  density = 'comfortable',
  defaultSort = null,
  caption,
  maxHeight = true,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  onRow?: (row: T) => void;
  selectedKey?: string | number | null;
  density?: Density;
  defaultSort?: SortState;
  caption: string;
  /** Scrolls the body inside the viewport; off for a short table in a panel. */
  maxHeight?: boolean;
}) {
  const [sort, setSort] = useState<SortState>(defaultSort);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const value = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      // Unknowns sink to the bottom whichever way the sort goes.
      if (va === null || va === undefined || va === '') return 1;
      if (vb === null || vb === undefined || vb === '') return -1;
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' }) * dir;
    });
  }, [rows, columns, sort]);

  function toggleSort(key: string) {
    setSort((s) => (s?.key === key
      ? (s.dir === 'asc' ? { key, dir: 'desc' } : null)
      : { key, dir: 'asc' }));
  }

  function onRowKey(e: ReactKeyboardEvent<HTMLTableRowElement>, row: T) {
    if (!onRow) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRow(row);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const tr = e.currentTarget;
      const next = e.key === 'ArrowDown' ? tr.nextElementSibling : tr.previousElementSibling;
      (next as HTMLElement | null)?.focus();
    }
  }

  function onRowClick(e: ReactMouseEvent<HTMLTableRowElement>, row: T) {
    if (!onRow) return;
    if ((e.target as HTMLElement).closest('a, button, input, select, label')) return;
    onRow(row);
  }

  const cellClass = (c: Column<T>) => [
    c.num ? 'num' : '',
    c.hideBelow ? `ops-hide-${c.hideBelow}` : '',
  ].filter(Boolean).join(' ') || undefined;

  return (
    <div className={`ops-table-wrap ${maxHeight ? 'ops-table-wrap--tall' : ''}`}>
      <table className={`ops-table ops-table--${density} ${onRow ? 'ops-table--rows' : ''}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              const dir: 'asc' | 'desc' | 'none' = active && sort ? sort.dir : 'none';
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={cellClass(c)}
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={c.sortValue
                    ? (active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none')
                    : undefined}
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      className={`ops-sort ${active ? 'is-active' : ''}`}
                      onClick={() => toggleSort(c.key)}
                    >
                      {c.label}
                      <SortArrow dir={dir} />
                    </button>
                  ) : c.label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const key = rowKey(row);
            const selected = selectedKey !== undefined && selectedKey !== null && selectedKey === key;
            return (
              <tr
                key={key}
                className={`ops-row ${selected ? 'is-selected' : ''}`}
                tabIndex={onRow ? 0 : undefined}
                aria-selected={onRow ? selected : undefined}
                onClick={(e) => onRowClick(e, row)}
                onKeyDown={(e) => onRowKey(e, row)}
              >
                {columns.map((c) => (
                  <td key={c.key} className={cellClass(c)}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Something that needs attention, as one line with a word and a colour.
 * The alerts panel on the Command Centre is a list of these.
 */
export function AlertRow({
  tone,
  word,
  children,
  href,
}: {
  tone: 'urgent' | 'wait' | 'good' | 'neutral';
  word: string;
  children: ReactNode;
  href?: string;
}) {
  const inner = (
    <>
      <span className={`ops-alert__dot ops-alert__dot--${tone}`} aria-hidden="true" />
      <span className="ops-alert__word">{word}</span>
      <span className="ops-alert__text">{children}</span>
      {href ? <Chevron className="ops-alert__go" /> : null}
    </>
  );
  return href
    ? <Link href={href} className={`ops-alert ops-alert--${tone}`}>{inner}</Link>
    : <div className={`ops-alert ops-alert--${tone}`}>{inner}</div>;
}
