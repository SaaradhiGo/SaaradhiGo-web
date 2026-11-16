'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  CAMPAIGN_STATUS_WORDS, CHANNEL_WORDS, campaignTone, canDraftCampaigns, type Campaign, type CampaignStatus,
} from '@/lib/notifications';
import {
  NoAccess, NoticeBanner, NotificationsNav, messageOf, type Notice,
} from '@/components/console/notifications';
import { CampaignEditor } from '@/components/console/notifications/CampaignEditor';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { chipToneOf, pageQuery, viewsOf } from '@/components/console/listKit';
import { PageHeader } from '@/components/console/ui';

/**
 * Messages: campaigns.
 *
 * A promotional broadcast to drivers or riders in the cities the operator holds. Promotional
 * messages go only to people who opted in, never in quiet hours, and only after a second
 * admin approves the send. Cancel is allowed until sending starts.
 */
type Payload = { count: number; results: Campaign[] };

const STATUSES: CampaignStatus[] = ['draft', 'pending_approval', 'scheduled', 'sending', 'sent', 'cancelled'];
const PAGE_SIZE = 25;

export default function CampaignsPage() {
  const access = useAdminAccess();
  const may = canDraftCampaigns(access);
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'' | CampaignStatus>('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setRows(null);
    const query = new URLSearchParams(pageQuery(page, PAGE_SIZE));
    if (status) query.set('status', status);
    try {
      const data = await api.get<Payload>(withScope(`/notifications/admin/campaigns/?${query.toString()}`));
      setRows(data.results);
      setCount(data.count);
    } catch (err) {
      setRows([]);
      setCount(null);
      setError(messageOf(err, 'The campaigns could not be loaded.'));
    }
  }, [status, page]);
  useEffect(() => { void load(); }, [load]);

  if (!canOpen(access, 'notifications')) {
    return (<><PageHeader title="Messages" /><NoAccess /></>);
  }

  const columns: ListColumn<Campaign>[] = [
    { key: 'name', label: 'Campaign', primary: true, render: (c) => c.name },
    { key: 'tpl', label: 'Template', render: (c) => `${c.template.key} · ${CHANNEL_WORDS[c.template.channel]}` },
    {
      key: 'aud', label: 'Audience',
      render: (c) => `${c.audience.role === 'drivers' ? 'Drivers' : 'Riders'} · ${c.audience.cities.length} cit${c.audience.cities.length === 1 ? 'y' : 'ies'}`,
    },
    { key: 'n', label: 'Reach', num: true, render: (c) => (c.audience_count ? c.audience_count.toLocaleString('en-IN') : '—') },
    { key: 'status', label: 'Status', render: (c) => <StatusChip tone={chipToneOf(campaignTone(c.status))}>{CAMPAIGN_STATUS_WORDS[c.status]}</StatusChip> },
    { key: 'when', label: 'Scheduled', num: true, render: (c) => stamp(c.scheduled_at ?? c.created_at, timeZoneFor(c.scope) ?? timeZoneFor(c.country)) },
  ];

  return (
    <>
      <NotificationsNav />
      <NoticeBanner notice={notice} />
      <ListPage<Campaign>
        pageKey="messages-campaigns"
        title="Message campaigns"
        summary="Promotional campaigns. They go only to people who opted in, never in quiet hours, and only after a second admin approves the send."
        actionsSlot={may ? (
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setOpen('new')}>New campaign…</button>
        ) : undefined}
        views={viewsOf(STATUSES, (s) => CAMPAIGN_STATUS_WORDS[s], status, count)}
        view={status}
        onView={(v) => { setStatus(v as '' | CampaignStatus); setPage(1); }}
        columns={columns}
        rows={rows ?? []}
        rowKey={(c) => c.id}
        total={count}
        page={page}
        pageSize={PAGE_SIZE}
        onPage={setPage}
        onRow={(c) => setOpen(c.id)}
        activeKey={typeof open === 'number' ? open : null}
        loading={rows === null}
        error={error}
        empty={status ? 'No campaigns in this view.'
          : may ? 'No campaigns yet. Start one: pick a promotional template and an audience, and count it before you submit.'
            : 'Nobody has drafted a campaign in your scope.'}
      />

      {open !== null ? (
        <CampaignEditor key={String(open)} campaignId={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onOpen={(id) => { setOpen(id); void load(); }}
          onDone={(n) => { setOpen(null); setNotice(n); void load(); }} />
      ) : null}
    </>
  );
}
