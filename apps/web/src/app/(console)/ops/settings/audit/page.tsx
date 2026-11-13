'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, apiDownload } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import {
  auditQuery, canReadAudit, chainWords, diffRows, emptyAuditFilters, type AuditDetail, type AuditFilters,
  type AuditPage, type AuditRow,
} from '@/lib/platform';
import { messageOf } from '@/components/console/notifications';
import { PlatformNav, PlatformNoAccess } from '@/components/console/platform';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { RecordPanel } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { Drawer, PageHeader } from '@/components/console/ui';

/**
 * Platform settings: Audit log.
 *
 * Every consequential change anybody made, newest first. You see an entry only for places you hold
 * the audit capability at; an entry attributed to no place is Super Admin only. Personal details in
 * an entry are masked. The hash chain is verified over the range you are looking at (a verdict, never
 * content), and a CSV export is itself an audit entry, limited per operator.
 */
const PAGE_SIZE = 50;

export default function AuditPage() {
  const access = useAdminAccess();
  const [draft, setDraft] = useState<AuditFilters>(emptyAuditFilters);
  const [filters, setFilters] = useState<AuditFilters>(emptyAuditFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<AuditPage>(`/admin-audit/admin/entries/${auditQuery(filters, { page, page_size: PAGE_SIZE })}`));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The audit log could not be loaded.'));
    }
  }, [filters, page]);
  useEffect(() => { void load(); }, [load]);

  async function download() {
    setExporting(true); setExportError(null);
    try {
      const { blob, filename } = await apiDownload(`/admin-audit/admin/entries/export/${auditQuery(filters)}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(messageOf(err, 'The export could not be produced.'));
    } finally {
      setExporting(false);
    }
  }

  const columns: ListColumn<AuditRow>[] = [
    { key: 'when', label: 'When', render: (r) => stamp(r.created_at) },
    { key: 'actor', label: 'Who', render: (r) => <>{r.actor.label ?? 'system'} <span className="muted">{r.actor.role}</span></> },
    { key: 'action', label: 'Action', primary: true, render: (r) => r.action },
    { key: 'target', label: 'Target', render: (r) => `${r.target_type} ${r.target_id}`.trim() },
    { key: 'place', label: 'Place', render: (r) => r.place ?? <span className="muted">none</span> },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || <span className="muted">—</span> },
  ];

  if (!canReadAudit(access)) {
    return (<><PageHeader title="Audit log" /><PlatformNav /><PlatformNoAccess what="The audit log" /></>);
  }

  const set = (k: keyof AuditFilters) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const apply = (next: AuditFilters) => { setDraft(next); setFilters(next); setPage(1); };
  const today = isoDay(new Date());
  const weekAgo = isoDay(new Date(Date.now() - 6 * 86_400_000));
  const view = !filters.from && !filters.to ? '' : filters.from === today && filters.to === today ? 'today'
    : filters.from === weekAgo && filters.to === today ? 'week' : 'range';
  const LABELS: Record<keyof AuditFilters, string> = {
    actor: 'Who', action: 'Action', target_type: 'Target type', target_id: 'Target id', city: 'Place', from: 'From', to: 'To',
  };
  const chips = (Object.keys(LABELS) as (keyof AuditFilters)[])
    .filter((k) => filters[k].trim() && !(view !== 'range' && (k === 'from' || k === 'to')))
    .map((k) => ({ key: k, label: `${LABELS[k]}: ${filters[k].trim()}`, onRemove: () => apply({ ...filters, [k]: '' }) }));
  const saved = auditQuery(filters).replace(/^\?/, '');

  return (
    <>
      <PlatformNav />
      {exportError ? <p className="nf-problems" role="alert">{exportError}</p> : null}
      {data?.chain ? (
        <p className="help ps-chain" role="status">
          <StatusChip tone={data.chain.status === 'broken' ? 'critical' : 'good'}>{data.chain.status === 'broken' ? 'Hash chain broken' : 'Hash chain intact'}</StatusChip> {chainWords(data.chain)}
        </p>
      ) : null}
      <div className={open !== null ? 'ops-split' : undefined}>
        <ListPage<AuditRow>
          pageKey="settings-audit"
          title="Audit log"
          summary="Who changed what, where and when. You see the places you hold the audit capability at; personal details are masked. Times are UTC."
          views={[
            { key: '', label: 'All', count: view === '' ? data?.count ?? null : undefined },
            { key: 'today', label: 'Today', count: view === 'today' ? data?.count ?? null : undefined },
            { key: 'week', label: 'Last 7 days', count: view === 'week' ? data?.count ?? null : undefined },
          ]}
          view={view}
          onView={(v) => apply({ ...filters, from: v === 'today' ? today : v === 'week' ? weekAgo : '', to: v ? today : '' })}
          chips={chips}
          filterSlot={(
            <form className="ops-list__filters" onSubmit={(e) => { e.preventDefault(); apply(draft); }} aria-label="Filter the audit log">
              <label className="sr-only" htmlFor="au-actor">Who</label>
              <input id="au-actor" className="input ops-list__search" value={draft.actor} onChange={set('actor')} placeholder="Who: name or staff id" />
              <label className="sr-only" htmlFor="au-action">Action</label>
              <input id="au-action" className="input ops-list__search" value={draft.action} onChange={set('action')} placeholder="Action, e.g. zone_changed" />
              <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Apply</button>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setMore(true)}>More filters</button>
            </form>
          )}
          onExport={exporting ? undefined : () => void download()}
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(r) => r.id}
          total={data ? data.count : null}
          page={page}
          pageSize={PAGE_SIZE}
          onPage={setPage}
          onRow={(r) => setOpen(r.id)}
          activeKey={open}
          loading={data === null && !error}
          error={error}
          empty="Nothing in your scope matches those filters."
          currentQuery={saved || undefined}
          onSavedView={(q) => {
            const p = new URLSearchParams(q);
            const next = emptyAuditFilters();
            (Object.keys(next) as (keyof AuditFilters)[]).forEach((k) => { next[k] = p.get(k) ?? ''; });
            apply(next);
          }}
        />
        {open !== null ? <EntryRecord id={open} onClose={() => setOpen(null)} /> : null}
      </div>

      <Drawer open={more} title="Filter the audit log" onClose={() => setMore(false)}
        footer={(
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => { apply(emptyAuditFilters()); setMore(false); }}>Clear</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => { apply(draft); setMore(false); }}>Show entries</button>
          </>
        )}>
        <div className="ops-form">
          <div className="ops-form__row"><label className="ops-form__label" htmlFor="au-tt">Target type</label>
            <input id="au-tt" className="input" value={draft.target_type} onChange={set('target_type')} /></div>
          <div className="ops-form__row"><label className="ops-form__label" htmlFor="au-tid">Target id</label>
            <input id="au-tid" className="input" value={draft.target_id} onChange={set('target_id')} /></div>
          <div className="ops-form__row"><label className="ops-form__label" htmlFor="au-city">Place</label>
            <input id="au-city" className="input" value={draft.city} onChange={set('city')} placeholder="City or country code" /></div>
          <div className="ops-form__row"><label className="ops-form__label" htmlFor="au-from">From</label>
            <input id="au-from" className="input" type="date" value={draft.from} onChange={set('from')} /></div>
          <div className="ops-form__row"><label className="ops-form__label" htmlFor="au-to">To</label>
            <input id="au-to" className="input" type="date" value={draft.to} onChange={set('to')} /></div>
        </div>
      </Drawer>
    </>
  );
}

/** A calendar day in UTC, as the audit log's dates are. */
function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function EntryRecord({ id, onClose }: { id: number; onClose: () => void }) {
  const [entry, setEntry] = useState<AuditDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntry(await api.get<AuditDetail>(`/admin-audit/admin/entries/${id}/`));
    } catch (err) {
      setEntry(null);
      setError(messageOf(err, 'That entry could not be loaded.'));
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (!entry || entry.id !== id) {
    return (
      <RecordPanel label="Audit entry" title="Audit entry" refId={`#${id}`} onClose={onClose}
        tabs={[{ key: 'entry', label: 'Entry', content: error ? (
          <div>
            <p className="alert-error" role="alert">{error}</p>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void load()}>Try again</button>
          </div>
        ) : <p className="ops-record__empty" aria-busy="true">Loading the entry…</p> }]} />
    );
  }
  const rows = diffRows(entry.before, entry.after);
  return (
    <RecordPanel
      label="Audit entry"
      title={entry.action}
      refId={`#${entry.id}`}
      subtitle={<>{entry.actor.label ?? 'system'} · {stamp(entry.created_at)}</>}
      onClose={onClose}
      tabs={[
        {
          key: 'entry', label: 'Entry', content: (
            <div className="nf-editor">
              <dl className="ps-facts">
                <div><dt>When</dt><dd>{stamp(entry.created_at)}</dd></div>
                <div><dt>Who</dt><dd>{entry.actor.label ?? 'system'} · {entry.actor.role || 'no role'}</dd></div>
                <div><dt>Target</dt><dd>{entry.target_type} {entry.target_id}</dd></div>
                <div><dt>Place</dt><dd>{entry.place ?? 'none'}</dd></div>
                <div><dt>From</dt><dd>{entry.ip ?? 'unknown'}</dd></div>
                <div><dt>Hash</dt><dd>{entry.hash.hashed ? `${entry.hash.content}… after ${entry.hash.previous}…` : 'written before the chain'}</dd></div>
              </dl>
              <div className="nf-field">
                <span className="ops-form__label">Reason</span>
                <p className="mb-0">{entry.reason || 'None given.'}</p>
              </div>
            </div>
          ),
        },
        {
          key: 'diff', label: 'Before and after', content: rows.length === 0 ? (
            <p className="ops-record__empty">This entry records that something happened, not what changed.</p>
          ) : (
            <table className="ps-diff">
              <caption className="ops-form__label">Before and after (personal details masked)</caption>
              <thead><tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} data-changed={r.changed ? 'true' : undefined}>
                    <th scope="row">{r.key}</th><td>{r.before || '—'}</td><td>{r.after || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ),
        },
      ]}
    />
  );
}
