'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import {
  CHANNELS, CHANNEL_WORDS, TEMPLATE_STATUS_WORDS, canDraftTemplates, defaultCountry, templateTone, type Channel,
  type Template, type TemplateStatus,
} from '@/lib/notifications';
import {
  NoAccess, NoticeBanner, NotificationsNav, messageOf, type Notice,
} from '@/components/console/notifications';
import { TemplateEditor } from '@/components/console/notifications/TemplateEditor';
import {
  DataTable, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Notifications: templates.
 *
 * A template is the words for one event on one channel in one country. Editing makes a DRAFT;
 * going live (and being retired) is a request a different admin approves, so nothing here
 * changes what the platform says by itself. An India SMS needs its DLT registration first.
 */
type Payload = { count: number; results: Template[] };

const STATUSES: TemplateStatus[] = ['draft', 'pending_approval', 'active', 'archived'];

export default function TemplatesPage() {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const may = canDraftTemplates(access);
  const [rows, setRows] = useState<Template[] | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<'' | Channel>('');
  const [status, setStatus] = useState<'' | TemplateStatus>('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const query = new URLSearchParams({ limit: '100' });
    if (channel) query.set('channel', channel);
    if (status) query.set('status', status);
    if (q.trim()) query.set('q', q.trim());
    try {
      const data = await api.get<Payload>(withScope(`/notifications/admin/templates/?${query.toString()}`));
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      setRows(null);
      setError(messageOf(err, 'The templates could not be loaded.'));
    }
  }, [channel, status, q]);
  useEffect(() => { void load(); }, [load]);

  const columns = useMemo(() => [
    { key: 'key', label: 'Template', sortValue: (t: Template) => t.key,
      render: (t: Template) => <><b>{t.key}</b> <span className="muted">v{t.version}</span></> },
    { key: 'channel', label: 'Channel', width: '8rem', sortValue: (t: Template) => t.channel,
      render: (t: Template) => CHANNEL_WORDS[t.channel] },
    { key: 'country', label: 'Country', width: '6rem', sortValue: (t: Template) => t.country, render: (t: Template) => t.country || 'All' },
    { key: 'category', label: 'Kind', width: '8rem', hideBelow: 1100 as const, render: (t: Template) => t.category },
    { key: 'status', label: 'Status', width: '13rem', sortValue: (t: Template) => t.status,
      render: (t: Template) => <Pill tone={templateTone(t.status)}>{TEMPLATE_STATUS_WORDS[t.status]}</Pill> },
    { key: 'when', label: 'Updated', width: '9rem', hideBelow: 1280 as const, sortValue: (t: Template) => t.activated_at ?? t.created_at,
      render: (t: Template) => stamp(t.activated_at ?? t.created_at) },
  ], []);

  if (!canOpen(access, 'notifications')) {
    return (<><PageHeader title="Notifications" /><NoAccess /></>);
  }

  return (
    <>
      <PageHeader title="Notifications"
        subtitle="What the platform says, on which channel, in which country. Going live needs a second admin; an India SMS needs its DLT registration first."
        actions={may ? (
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setOpen('new')}>New template…</button>
        ) : undefined} />
      <NotificationsNav />
      <NoticeBanner notice={notice} />

      <Panel title="Templates" flush>
        <TableToolbar summary={rows ? `${rows.length} of ${count} template${count === 1 ? '' : 's'}` : null}
          density={density} onDensity={setDensity}>
          <div className="nf-filters">
            <label className="sr-only" htmlFor="f-channel">Channel</label>
            <select id="f-channel" className="ops-select" value={channel} onChange={(e) => setChannel(e.target.value as '' | Channel)}>
              <option value="">All channels</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_WORDS[c]}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-status">Status</label>
            <select id="f-status" className="ops-select" value={status} onChange={(e) => setStatus(e.target.value as '' | TemplateStatus)}>
              <option value="">Any status</option>
              {STATUSES.map((s) => <option key={s} value={s}>{TEMPLATE_STATUS_WORDS[s]}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-q">Search by key</label>
            <input id="f-q" className="input" type="search" placeholder="Search by key" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </TableToolbar>
        {error ? (
          <ErrorState title="The templates could not be loaded" detail={error} onRetry={() => void load()} />
        ) : rows === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the templates</span>
            <Skeleton kind="row" count={5} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title="No templates match"
            detail={channel || status || q ? 'Nothing matches those filters in your scope.'
              : 'No templates are written for your scope yet. Seed the English set, or start one.'} />
        ) : (
          <DataTable caption="Notification templates" rows={rows} columns={columns} rowKey={(t) => t.id}
            density={density} onRow={(t) => setOpen(t.id)} selectedKey={typeof open === 'number' ? open : null}
            defaultSort={{ key: 'key', dir: 'asc' }} maxHeight={false} />
        )}
      </Panel>

      {open !== null ? (
        <TemplateEditor key={String(open)} templateId={open === 'new' ? null : open}
          defaultCountry={defaultCountry(access)}
          onClose={() => setOpen(null)}
          onOpen={(id) => { setOpen(id); void load(); }}
          onDone={(n) => { setOpen(null); setNotice(n); void load(); }} />
      ) : null}
    </>
  );
}
