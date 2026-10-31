'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import {
  CAMPAIGN_STATUS_WORDS, CHANNEL_WORDS, campaignTone, canDraftCampaigns, type Campaign,
} from '@/lib/notifications';
import {
  NoAccess, NoticeBanner, NotificationsNav, messageOf, type Notice,
} from '@/components/console/notifications';
import { CampaignEditor } from '@/components/console/notifications/CampaignEditor';
import {
  DataTable, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Notifications: campaigns.
 *
 * A promotional broadcast to drivers or riders in the cities the operator holds. Promotional
 * messages go only to people who opted in, never in quiet hours, and only after a second
 * admin approves the send. Cancel is allowed until sending starts.
 */
type Payload = { count: number; results: Campaign[] };

export default function CampaignsPage() {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const may = canDraftCampaigns(access);
  const [rows, setRows] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | 'new' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await api.get<Payload>(withScope('/notifications/admin/campaigns/?limit=100'));
      setRows(data.results);
    } catch (err) {
      setRows(null);
      setError(messageOf(err, 'The campaigns could not be loaded.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const columns = useMemo(() => [
    { key: 'name', label: 'Campaign', sortValue: (c: Campaign) => c.name, render: (c: Campaign) => <b>{c.name}</b> },
    { key: 'tpl', label: 'Template', hideBelow: 1100 as const, render: (c: Campaign) => `${c.template.key} · ${CHANNEL_WORDS[c.template.channel]}` },
    { key: 'aud', label: 'Audience', width: '12rem', render: (c: Campaign) => `${c.audience.role} · ${c.audience.cities.length} cit${c.audience.cities.length === 1 ? 'y' : 'ies'}` },
    { key: 'n', label: 'Reach', num: true, width: '6rem', sortValue: (c: Campaign) => c.audience_count, render: (c: Campaign) => c.audience_count || '—' },
    { key: 'status', label: 'Status', width: '13rem', sortValue: (c: Campaign) => c.status,
      render: (c: Campaign) => <Pill tone={campaignTone(c.status)}>{CAMPAIGN_STATUS_WORDS[c.status]}</Pill> },
    { key: 'when', label: 'Scheduled', width: '9rem', hideBelow: 1280 as const, sortValue: (c: Campaign) => c.scheduled_at ?? c.created_at,
      render: (c: Campaign) => stamp(c.scheduled_at ?? c.created_at) },
  ], []);

  if (!canOpen(access, 'notifications')) {
    return (<><PageHeader title="Notifications" /><NoAccess /></>);
  }

  return (
    <>
      <PageHeader title="Notifications"
        subtitle="Promotional campaigns. They go only to people who opted in, never in quiet hours, and only after a second admin approves the send."
        actions={may ? (
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setOpen('new')}>New campaign…</button>
        ) : undefined} />
      <NotificationsNav />
      <NoticeBanner notice={notice} />

      <Panel title="Campaigns" flush>
        <TableToolbar summary={rows ? `${rows.length} campaign${rows.length === 1 ? '' : 's'}` : null}
          density={density} onDensity={setDensity} />
        {error ? (
          <ErrorState title="The campaigns could not be loaded" detail={error} onRetry={() => void load()} />
        ) : rows === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the campaigns</span>
            <Skeleton kind="row" count={4} />
          </div>
        ) : rows.length === 0 ? (
          <Empty title="No campaigns yet"
            detail={may ? 'Start one: pick a promotional template and an audience, and count it before you submit.'
              : 'Nobody has drafted a campaign in your scope.'} />
        ) : (
          <DataTable caption="Campaigns" rows={rows} columns={columns} rowKey={(c) => c.id} density={density}
            onRow={(c) => setOpen(c.id)} selectedKey={typeof open === 'number' ? open : null}
            defaultSort={{ key: 'when', dir: 'desc' }} maxHeight={false} />
        )}
      </Panel>

      {open !== null ? (
        <CampaignEditor key={String(open)} campaignId={open === 'new' ? null : open}
          onClose={() => setOpen(null)}
          onOpen={(id) => { setOpen(id); void load(); }}
          onDone={(n) => { setOpen(null); setNotice(n); void load(); }} />
      ) : null}
    </>
  );
}
