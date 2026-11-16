'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  CHANNELS, CHANNEL_WORDS, TEMPLATE_STATUS_WORDS, canDraftTemplates, defaultCountry, templateTone, type Channel,
  type Template, type TemplateStatus,
} from '@/lib/notifications';
import {
  NoAccess, NoticeBanner, NotificationsNav, messageOf, type Notice,
} from '@/components/console/notifications';
import { TemplateEditor } from '@/components/console/notifications/TemplateEditor';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { chipToneOf, pageQuery, viewsOf } from '@/components/console/listKit';
import { PageHeader } from '@/components/console/ui';

/**
 * Messages: templates.
 *
 * A template is the words for one event on one channel in one country. Editing makes a DRAFT;
 * going live (and being retired) is a request a different admin approves, so nothing here
 * changes what the platform says by itself. An India SMS needs its DLT registration first.
 */
type Payload = { count: number; results: Template[] };

const STATUSES: TemplateStatus[] = ['active', 'draft', 'pending_approval', 'archived'];
const PAGE_SIZE = 25;

export default function TemplatesPage() {
  const access = useAdminAccess();
  const may = canDraftTemplates(access);
  const [rows, setRows] = useState<Template[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [channel, setChannel] = useState<'' | Channel>('');
  const [status, setStatus] = useState<'' | TemplateStatus>('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    const query = new URLSearchParams(pageQuery(page, PAGE_SIZE));
    if (channel) query.set('channel', channel);
    if (status) query.set('status', status);
    if (q.trim()) query.set('q', q.trim());
    try {
      const data = await api.get<Payload>(withScope(`/notifications/admin/templates/?${query.toString()}`));
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      setRows([]);
      setCount(null);
      setError(messageOf(err, 'The templates could not be loaded.'));
    }
  }, [channel, status, q, page]);
  useEffect(() => { void load(); }, [load]);

  if (!canOpen(access, 'notifications')) {
    return (<><PageHeader title="Messages" /><NoAccess /></>);
  }

  const columns: ListColumn<Template>[] = [
    { key: 'key', label: 'Template', primary: true, render: (t) => <>{t.key} <span className="muted">v{t.version}</span></> },
    { key: 'channel', label: 'Channel', render: (t) => CHANNEL_WORDS[t.channel] },
    { key: 'country', label: 'Country', render: (t) => t.country || 'All' },
    { key: 'category', label: 'Kind', render: (t) => (t.category === 'promotional' ? 'Promotional' : 'Transactional') },
    { key: 'status', label: 'Status', render: (t) => <StatusChip tone={chipToneOf(templateTone(t.status))}>{TEMPLATE_STATUS_WORDS[t.status]}</StatusChip> },
    { key: 'when', label: 'Updated', num: true, render: (t) => stamp(t.activated_at ?? t.created_at, timeZoneFor(t.country)) },
  ];
  const chips = [
    ...(channel ? [{ key: 'channel', label: `Channel: ${CHANNEL_WORDS[channel]}`, onRemove: () => { setChannel(''); setPage(1); } }] : []),
    ...(q.trim() ? [{ key: 'q', label: `Key: ${q.trim()}`, onRemove: () => { setQ(''); setPage(1); } }] : []),
  ];
  const saved = new URLSearchParams();
  if (status) saved.set('status', status);
  if (channel) saved.set('channel', channel);
  if (q.trim()) saved.set('q', q.trim());

  return (
    <>
      <NotificationsNav />
      <NoticeBanner notice={notice} />
      <ListPage<Template>
        pageKey="messages-templates"
        title="Message templates"
        summary="What the platform says, on which channel, in which country. Going live needs a second admin; an India SMS needs its DLT registration first."
        actionsSlot={may ? (
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setOpen('new')}>New template…</button>
        ) : undefined}
        views={viewsOf(STATUSES, (s) => TEMPLATE_STATUS_WORDS[s], status, count)}
        view={status}
        onView={(v) => { setStatus(v as '' | TemplateStatus); setPage(1); }}
        chips={chips}
        filterSlot={(
          <div className="ops-list__filters">
            <label className="sr-only" htmlFor="f-channel">Channel</label>
            <select id="f-channel" className="ops-select ops-list__select" value={channel}
              onChange={(e) => { setChannel(e.target.value as '' | Channel); setPage(1); }}>
              <option value="">All channels</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_WORDS[c]}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-q">Search by key</label>
            <input id="f-q" className="input ops-list__search" type="search" placeholder="Search by key" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        )}
        columns={columns}
        rows={rows ?? []}
        rowKey={(t) => t.id}
        total={count}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={setPage}
        onRow={(t) => setOpen(t.id)}
        activeKey={typeof open === 'number' ? open : null}
        loading={rows === null}
        error={error}
        empty={channel || status || q ? 'Nothing matches those filters in your scope.'
          : 'No templates are written for your scope yet. Seed the English set, or start one.'}
        currentQuery={saved.toString() || undefined}
        onSavedView={(query) => {
          const p = new URLSearchParams(query);
          setStatus((p.get('status') ?? '') as '' | TemplateStatus);
          setChannel((p.get('channel') ?? '') as '' | Channel);
          setQ(p.get('q') ?? '');
          setPage(1);
        }}
      />

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
