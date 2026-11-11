'use client';

import { type ReactNode, useEffect, useState } from 'react';

/**
 * The everyday pattern, list half (design board B): saved views with counts,
 * filter chips, a compact table sorted and paged on the SERVER, a bulk bar,
 * and CSV export of exactly the view on screen.
 *
 * The page owns the data: it passes the rows, the total and the current
 * ordering, and is told when the operator changes view, page, ordering or
 * selection. Nothing here sorts or filters locally: a list over 2M trips is
 * only ever a page of them.
 *
 * Bulk changes over 50 records need a second approver (owner ruling, AUDIT
 * §10): the bar says so before anything is pressed, and the server enforces it.
 */

export type ListView = { key: string; label: string; count?: number | null };
export type FilterChip = { key: string; label: ReactNode; onRemove: () => void };
export type ListColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  /** The server's ordering field: present means the header sorts. */
  sortKey?: string;
  num?: boolean;
  width?: string;
  /** The name column: bold, and the row's accessible label. */
  primary?: boolean;
};
export type BulkAction = { key: string; label: string; onRun: () => void; tone?: 'danger' };
export type SavedView = { name: string; query: string };

export const BULK_CHECKER_ABOVE = 50;

function readSaved(key: string): SavedView[] {
  try {
    const raw = window.localStorage.getItem(`sg.console.views.${key}`);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function ListPage<T>({
  pageKey, title, summary, views, view, onView, chips = [], filterSlot, actionsSlot,
  columns, rows, rowKey, total, page, pageSize, onPage, ordering, onOrdering,
  selectable = false, selected = [], onSelected, bulkActions = [], exportHref, onExport,
  onRow, activeKey, loading = false, error = null, empty = 'Nothing matches this view.',
  currentQuery, onSavedView,
}: {
  /** Saved views are stored per page under this key. */
  pageKey: string;
  title: string;
  summary?: ReactNode;
  views: ListView[];
  view: string;
  onView: (key: string) => void;
  chips?: FilterChip[];
  filterSlot?: ReactNode;
  actionsSlot?: ReactNode;
  columns: ListColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  total: number | null;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  ordering?: string;
  onOrdering?: (ordering: string) => void;
  selectable?: boolean;
  selected?: Array<string | number>;
  onSelected?: (keys: Array<string | number>) => void;
  bulkActions?: BulkAction[];
  /** A download link for the current view, or a handler that downloads it. */
  exportHref?: string;
  onExport?: () => void;
  onRow?: (row: T) => void;
  activeKey?: string | number | null;
  loading?: boolean;
  error?: string | null;
  empty?: string;
  /** The current filters as a query string, for "Save this view". */
  currentQuery?: string;
  onSavedView?: (query: string) => void;
}) {
  const [saved, setSaved] = useState<SavedView[]>([]);
  useEffect(() => setSaved(readSaved(pageKey)), [pageKey]);
  const pages = total === null ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = total ? Math.min(total, page * pageSize) : 0;
  const allKeys = rows.map(rowKey);
  const allOn = selectable && rows.length > 0 && allKeys.every((k) => selected.includes(k));

  const sortBy = (col: ListColumn<T>) => {
    if (!col.sortKey || !onOrdering) return;
    onOrdering(ordering === col.sortKey ? `-${col.sortKey}` : col.sortKey);
  };
  const saveView = () => {
    if (!currentQuery) return;
    // Named from what is filtered, so a saved view reads the way it was built.
    const label = chips.map((c) => (typeof c.label === 'string' ? c.label : '')).filter(Boolean).join(' · ') || views.find((v) => v.key === view)?.label || 'My view';
    const next = [...saved.filter((s) => s.query !== currentQuery), { name: label.slice(0, 40), query: currentQuery }].slice(-6);
    try { window.localStorage.setItem(`sg.console.views.${pageKey}`, JSON.stringify(next)); } catch { /* private window */ }
    setSaved(next);
  };

  return (
    <section className="ops-list" aria-label={title}>
      <header className="ops-list__head">
        <div>
          <h1>{title}</h1>
          {summary ? <p className="sg-num">{summary}</p> : null}
        </div>
        {actionsSlot ? <div className="ops-list__actions">{actionsSlot}</div> : null}
      </header>

      <div className="ops-list__views" role="tablist" aria-label="Saved views">
        {views.map((v) => (
          <button key={v.key} type="button" role="tab" aria-selected={view === v.key}
            className="ops-view" onClick={() => onView(v.key)}>
            {v.label}{typeof v.count === 'number' ? <span className="sg-num"> {v.count.toLocaleString('en-IN')}</span> : null}
          </button>
        ))}
        {saved.map((s) => (
          <button key={s.query} type="button" className="ops-view ops-view--saved"
            onClick={() => onSavedView?.(s.query)} title="Saved view">{s.name}</button>
        ))}
        {currentQuery && onSavedView ? (
          <button type="button" className="ops-view ops-view--add" onClick={saveView}>+ Save this view</button>
        ) : null}
      </div>

      <div className="ops-list__chips">
        {chips.map((c) => (
          <span key={c.key} className="ops-chip">
            {c.label}
            <button type="button" aria-label="Remove filter" onClick={c.onRemove}>×</button>
          </span>
        ))}
        {filterSlot}
        <span className="ops-list__count sg-num">
          {total === null ? '' : total === 0 ? 'No matches' : `${total.toLocaleString('en-IN')} match · showing ${from}–${to}`}
        </span>
        {exportHref ? <a className="sg-btn sg-btn--ghost sg-btn--sm" href={exportHref}>Export CSV</a> : null}
        {onExport ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onExport}>Export CSV</button> : null}
      </div>

      {selectable && selected.length > 0 ? (
        <div className="ops-list__bulk" role="region" aria-label="Bulk actions">
          <b>{selected.length} selected</b>
          {bulkActions.map((a) => (
            <button key={a.key} type="button" className={`sg-btn sg-btn--sm ${a.tone === 'danger' ? 'sg-btn--ghost' : 'sg-btn--secondary'}`}
              onClick={a.onRun}>{a.label}</button>
          ))}
          <span className="ops-list__bulk-note">
            {selected.length > BULK_CHECKER_ABOVE
              ? 'More than 50: this goes to a second approver.'
              : 'Changes over 50 records need a second approver.'}
          </span>
        </div>
      ) : null}

      {error ? <p className="alert-error" role="alert">{error}</p> : null}

      <div className="ops-list__table" aria-busy={loading || undefined}>
        <table className="ops-table ops-table--compact">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              {selectable ? (
                <th scope="col" style={{ width: '2.2rem' }}>
                  <input type="checkbox" aria-label="Select all on this page" checked={allOn}
                    onChange={() => onSelected?.(allOn ? selected.filter((k) => !allKeys.includes(k)) : Array.from(new Set([...selected, ...allKeys])))} />
                </th>
              ) : null}
              {columns.map((c) => {
                const dir = ordering === c.sortKey ? 'ascending' : ordering === `-${c.sortKey}` ? 'descending' : undefined;
                return (
                  <th key={c.key} scope="col" style={c.width ? { width: c.width } : undefined}
                    className={c.num ? 'num' : undefined} aria-sort={c.sortKey ? (dir ?? 'none') : undefined}>
                    {c.sortKey && onOrdering ? (
                      <button type="button" className="ops-th-sort" onClick={() => sortBy(c)}>
                        {c.label}{dir === 'ascending' ? ' ↑' : dir === 'descending' ? ' ↓' : ''}
                      </button>
                    ) : c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const k = rowKey(row);
              return (
                <tr key={k} className={`${onRow ? 'is-link' : ''}${activeKey === k ? ' is-active' : ''}`}
                  tabIndex={onRow ? 0 : undefined}
                  onClick={(e) => {
                    const t = e.target as HTMLElement;
                    if (onRow && !t.closest('a,button,input,label')) onRow(row);
                  }}
                  onKeyDown={(e) => { if (onRow && (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onRow(row); } }}>
                  {selectable ? (
                    <td>
                      <input type="checkbox" aria-label="Select row" checked={selected.includes(k)}
                        onChange={() => onSelected?.(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k])} />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td key={c.key} className={`${c.num ? 'num' : ''}${c.primary ? ' primary' : ''}`}>{c.render(row)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {loading && rows.length === 0 ? <p className="ops-list__empty" role="status" aria-live="polite">Loading…</p> : null}
        {!loading && rows.length === 0 && !error ? <p className="ops-list__empty">{empty}</p> : null}
      </div>

      {pages > 1 ? (
        <nav className="ops-list__pager" aria-label="Pages">
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
          <span className="sg-num">Page {page} of {pages.toLocaleString('en-IN')}</span>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
        </nav>
      ) : null}
    </section>
  );
}
