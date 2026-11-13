'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import {
  canReadPlatform, canWritePlatform, isMinimumRaise, validateVersionSlot, type Pending, type VersionSlot,
} from '@/lib/platform';
import { NoticeBanner, messageOf, type Notice } from '@/components/console/notifications';
import {
  PendingRequests, PlatformNav, PlatformNoAccess, outcomeNotice,
} from '@/components/console/platform';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { Drawer, PageHeader } from '@/components/console/ui';

/**
 * Platform settings: App versions.
 *
 * Per app and platform: the MINIMUM supported version (below it the user must update), the latest
 * (below it they may), the store link and a message. The apps read it from the public app-config
 * endpoint. Raising a minimum forces users off older builds, so it needs a second admin; lowering it,
 * or moving the latest version, takes effect at once. A build that sends no X-App-Version header is
 * never refused, so the apps in the field today keep working.
 */
type Payload = { results: VersionSlot[]; pending: Pending[] };
const APP_WORDS = { rider: 'Rider app', driver: 'Driver app' } as const;
const PLATFORM_WORDS = { android: 'Android', ios: 'iOS' } as const;

export default function AppVersionsPage() {
  const access = useAdminAccess();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState<VersionSlot | null>(null);
  const [view, setView] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Payload>('/platform/admin/app-versions/'));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The app versions could not be loaded.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const pendingTargets = new Set((data?.pending ?? []).map((p) => String(p.target)));

  const columns: ListColumn<VersionSlot>[] = [
    { key: 'app', label: 'App', primary: true, render: (s) => APP_WORDS[s.app] },
    { key: 'platform', label: 'Platform', render: (s) => PLATFORM_WORDS[s.platform] },
    { key: 'min', label: 'Minimum', num: true, render: (s) => s.minimum_version },
    { key: 'latest', label: 'Latest', num: true, render: (s) => s.latest_version },
    {
      key: 'status', label: 'Status',
      render: (s) => (pendingTargets.has(`${s.app}:${s.platform}`) || pendingTargets.has(`${s.app}-${s.platform}`)
        ? <StatusChip tone="info">Raise waiting for a checker</StatusChip>
        : s.minimum_version === s.latest_version ? <StatusChip tone="caution">Everyone must be on the latest</StatusChip>
          : <StatusChip tone="good">Older builds allowed</StatusChip>),
    },
    { key: 'url', label: 'Store link', render: (s) => s.store_url || <span className="muted">not set</span> },
    { key: 'when', label: 'Changed', render: (s) => (s.updated_at ? stamp(s.updated_at) : '—') },
  ];

  if (!canReadPlatform(access)) {
    return (<><PageHeader title="App versions" /><PlatformNav /><PlatformNoAccess what="App versions" /></>);
  }

  const rows = (data?.results ?? []).filter((s) => !view || s.app === view);

  return (
    <>
      <PlatformNav />
      <NoticeBanner notice={notice} />
      {data ? <PendingRequests items={data.pending} onDecided={(n) => { setNotice(n); void load(); }}
        describe={(p) => `Raise the minimum version of ${p.target}`} /> : null}

      <ListPage<VersionSlot>
        pageKey="settings-app-versions"
        title="App versions"
        summary="The minimum and latest version of each app. Raising a minimum forces users off older builds, so it needs a second admin."
        views={[
          { key: '', label: 'All', count: data ? data.results.length : undefined },
          { key: 'rider', label: 'Rider app' },
          { key: 'driver', label: 'Driver app' },
        ]}
        view={view}
        onView={setView}
        columns={columns}
        rows={rows}
        rowKey={(s) => `${s.app}-${s.platform}`}
        total={data ? rows.length : null}
        page={1}
        pageSize={Math.max(1, rows.length)}
        onPage={() => undefined}
        onRow={canWritePlatform(access) ? (s) => setOpen(s) : undefined}
        loading={data === null && !error}
        error={error}
        empty="No app version is set."
      />

      {open ? (
        <SlotDrawer slot={open} onClose={() => setOpen(null)}
          onDone={(n) => { setOpen(null); setNotice(n); void load(); }} />
      ) : null}
    </>
  );
}

function SlotDrawer({ slot, onClose, onDone }: { slot: VersionSlot; onClose: () => void; onDone: (n: Notice) => void }) {
  const [minimum, setMinimum] = useState(slot.minimum_version);
  const [latest, setLatest] = useState(slot.latest_version);
  const [storeUrl, setStoreUrl] = useState(slot.store_url);
  const [message, setMessage] = useState(slot.message);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const raising = isMinimumRaise(slot.minimum_version, minimum.trim());

  async function save() {
    const bad = validateVersionSlot({ minimum, latest, storeUrl, message });
    if (bad) { setProblem(bad); return; }
    if (reason.trim().length < 5) { setProblem('Say why, in a few words.'); return; }
    setBusy(true); setProblem(null);
    try {
      const out = await api.put<{ state?: string; approval_request?: { id: number } }>(
        `/platform/admin/app-versions/${slot.app}/${slot.platform}/`, {
          minimum_version: minimum.trim(), latest_version: latest.trim(), store_url: storeUrl.trim(), message, reason: reason.trim(),
        });
      onDone(outcomeNotice(out, 'The version policy was saved.'));
    } catch (err) {
      setProblem(messageOf(err, 'That did not go through. Nothing changed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title={`${APP_WORDS[slot.app]} · ${PLATFORM_WORDS[slot.platform]}`}
      footer={<button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void save()}>
        {raising ? 'Send for approval' : 'Save'}
      </button>}>
      <div className="nf-editor">
        {raising ? (
          <div className="ops-confirm" role="status">
            <b>Raising the minimum needs a second admin</b>
            <span>Every user on a build below {minimum.trim() || 'the new minimum'} will be told to update.</span>
          </div>
        ) : null}
        <div className="nf-grid">
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="v-min">Minimum version</label>
            <input id="v-min" className="input" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
          </div>
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="v-latest">Latest version</label>
            <input id="v-latest" className="input" value={latest} onChange={(e) => setLatest(e.target.value)} />
          </div>
        </div>
        <div className="nf-field">
          <label className="ops-form__label" htmlFor="v-url">Store link</label>
          <input id="v-url" className="input" value={storeUrl} placeholder="https://" onChange={(e) => setStoreUrl(e.target.value)} />
        </div>
        <div className="nf-field">
          <label className="ops-form__label" htmlFor="v-msg">Message to the user</label>
          <input id="v-msg" className="input" value={message} maxLength={300} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <div className="nf-field">
          <label className="ops-form__label" htmlFor="v-reason">Reason</label>
          <textarea id="v-reason" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {problem ? <p className="nf-problems" role="alert">{problem}</p> : null}
      </div>
    </Drawer>
  );
}
