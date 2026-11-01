'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiDownload } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import {
  auditQuery, canReadAudit, chainWords, diffRows, emptyAuditFilters, type AuditDetail, type AuditFilters,
  type AuditPage, type AuditRow,
} from '@/lib/platform';
import { messageOf } from '@/components/console/notifications';
import { PlatformNav, PlatformNoAccess } from '@/components/console/platform';
import {
  DataTable, Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

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
  const [density, setDensity] = useDensity();
  const [draft, setDraft] = useState<AuditFilters>(emptyAuditFilters);
  const [filters, setFilters] = useState<AuditFilters>(emptyAuditFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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

  const columns = useMemo(() => [
    { key: 'when', label: 'When', width: '10rem', render: (r: AuditRow) => stamp(r.created_at) },
    { key: 'actor', label: 'Who', width: '14rem', render: (r: AuditRow) => <>{r.actor.label ?? 'system'} <span className="muted">{r.actor.role}</span></> },
    { key: 'action', label: 'Action', render: (r: AuditRow) => <b>{r.action}</b> },
    { key: 'target', label: 'Target', width: '14rem', hideBelow: 1100 as const, render: (r: AuditRow) => `${r.target_type} ${r.target_id}`.trim() },
    { key: 'place', label: 'Place', width: '9rem', hideBelow: 1100 as const, render: (r: AuditRow) => r.place ?? <span className="muted">none</span> },
    { key: 'reason', label: 'Reason', hideBelow: 1280 as const, render: (r: AuditRow) => r.reason || <span className="muted">—</span> },
  ], []);

  if (!canReadAudit(access)) {
    return (<><PageHeader title="Platform settings" /><PlatformNav /><PlatformNoAccess what="The audit log" /></>);
  }

  const set = (k: keyof AuditFilters) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const pages = data ? Math.max(1, Math.ceil(data.count / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHeader title="Platform settings"
        subtitle="Who changed what, where and when. You see the places you hold the audit capability at; personal details are masked."
        actions={<button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={exporting} onClick={() => void download()}>Export CSV</button>} />
      <PlatformNav />
      {exportError ? <p className="nf-problems" role="alert">{exportError}</p> : null}

      <Panel title="Audit log" flush>
        <form className="nf-filterbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setFilters(draft); }}>
          <div className="nf-field"><label className="ops-form__label" htmlFor="au-actor">Who</label>
            <input id="au-actor" className="input" value={draft.actor} onChange={set('actor')} placeholder="Name or staff id" /></div>
          <div className="nf-field"><label className="ops-form__label" htmlFor="au-action">Action</label>
            <input id="au-action" className="input" value={draft.action} onChange={set('action')} placeholder="zone_changed" /></div>
          <div className="nf-field"><label className="ops-form__label" htmlFor="au-tt">Target type</label>
            <input id="au-tt" className="input" value={draft.target_type} onChange={set('target_type')} /></div>
          <div className="nf-field"><label className="ops-form__label" htmlFor="au-tid">Target id</label>
            <input id="au-tid" className="input" value={draft.target_id} onChange={set('target_id')} /></div>
          <div className="nf-field"><label className="ops-form__label" htmlFor="au-city">Place</label>
            <input id="au-city" className="input" value={draft.city} onChange={set('city')} placeholder="City or country code" /></div>
          <div className="nf-field"><label className="ops-form__label" htmlFor="au-from">From</label>
            <input id="au-from" className="input" type="date" value={draft.from} onChange={set('from')} /></div>
          <div className="nf-field"><label className="ops-form__label" htmlFor="au-to">To</label>
            <input id="au-to" className="input" type="date" value={draft.to} onChange={set('to')} /></div>
          <div className="nf-filterbar__go">
            <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Apply</button>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => { setDraft(emptyAuditFilters()); setFilters(emptyAuditFilters()); setPage(1); }}>Clear</button>
          </div>
        </form>
        {data?.chain ? (
          <p className="help ps-chain" role="status">
            <Pill tone={data.chain.status === 'broken' ? 'bad' : 'good'}>Hash chain</Pill> {chainWords(data.chain)}
          </p>
        ) : null}
        <TableToolbar summary={data ? `${data.count} entr${data.count === 1 ? 'y' : 'ies'}` : null} density={density} onDensity={setDensity} />
        {error ? (
          <ErrorState title="The audit log could not be loaded" detail={error} onRetry={() => void load()} />
        ) : data === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the audit log</span>
            <Skeleton kind="row" count={6} />
          </div>
        ) : data.results.length === 0 ? (
          <Empty title="No entries match" detail="Nothing in your scope matches those filters." />
        ) : (
          <>
            <DataTable caption="Audit log entries" rows={data.results} columns={columns} rowKey={(r) => r.id}
              density={density} onRow={(r) => setOpen(r.id)} selectedKey={open} maxHeight={false} />
            <div className="nf-pager">
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Newer</button>
              <span className="muted" aria-live="polite">Page {page} of {pages}</span>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={!data.next} onClick={() => setPage((p) => p + 1)}>Older</button>
            </div>
          </>
        )}
      </Panel>

      {open !== null ? <EntryDrawer id={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function EntryDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const [entry, setEntry] = useState<AuditDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setEntry(await api.get<AuditDetail>(`/admin-audit/admin/entries/${id}/`));
    } catch (err) {
      setError(messageOf(err, 'That entry could not be loaded.'));
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const rows = entry ? diffRows(entry.before, entry.after) : [];
  return (
    <Drawer open wide onClose={onClose} title={entry ? entry.action : `Entry ${id}`}>
      {error ? <ErrorState title="That entry could not be loaded" detail={error} onRetry={() => void load()} />
        : !entry ? (
          <div className="ops-skel-rows" aria-busy="true"><span className="sr-only">Loading the entry</span><Skeleton kind="row" count={4} /></div>
        ) : (
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
            {rows.length === 0 ? (
              <Empty title="No before or after recorded" detail="This entry records that something happened, not what changed." />
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
            )}
          </div>
        )}
    </Drawer>
  );
}
