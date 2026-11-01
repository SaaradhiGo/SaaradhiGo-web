'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import {
  AUDIENCE_WORDS, NOTICE_MAX, NOTICE_STATE_WORDS, canReadPlatform, canWritePlatform, noticeTone, validateNotice,
  type Notice15,
} from '@/lib/platform';
import { NoticeBanner, messageOf, type Notice } from '@/components/console/notifications';
import { PlatformNav, PlatformNoAccess } from '@/components/console/platform';
import {
  DataTable, Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Platform settings: Notices.
 *
 * A scoped, time-boxed message for the rider app, the driver app or this console. A notice shows
 * a banner and nothing else: it never stops a booking. To stop bookings in a city, pause the city
 * (Markets), which needs a second admin. A notice needs none.
 */
type Payload = { results: Notice15[] };

const localInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function NoticesPage() {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState<Notice15 | 'new' | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Payload>('/platform/admin/notices/'));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The notices could not be loaded.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const columns = useMemo(() => [
    { key: 'msg', label: 'Message', render: (n: Notice15) => <b>{n.message}</b> },
    { key: 'aud', label: 'Audience', width: '9rem', render: (n: Notice15) => AUDIENCE_WORDS[n.audience] },
    { key: 'scope', label: 'Where', width: '10rem', hideBelow: 1100 as const, render: (n: Notice15) => n.scope_name },
    { key: 'state', label: 'State', width: '10rem', sortValue: (n: Notice15) => n.state,
      render: (n: Notice15) => <Pill tone={noticeTone(n.state)}>{NOTICE_STATE_WORDS[n.state]}</Pill> },
    { key: 'sev', label: 'Severity', width: '8rem', hideBelow: 1100 as const, render: (n: Notice15) => (n.severity === 'warning' ? 'Warning' : 'Info') },
    { key: 'win', label: 'Window', width: '16rem', hideBelow: 1280 as const, render: (n: Notice15) => `${stamp(n.starts_at)} to ${stamp(n.ends_at)}` },
  ], []);

  if (!canReadPlatform(access)) {
    return (<><PageHeader title="Platform settings" /><PlatformNav /><PlatformNoAccess what="Notices" /></>);
  }

  return (
    <>
      <PageHeader title="Platform settings"
        subtitle="Maintenance messages for the apps and this console. A notice informs; it never stops a booking. Pause the city for that."
        actions={canWritePlatform(access) ? (
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setOpen('new')}>New notice…</button>
        ) : undefined} />
      <PlatformNav />
      <NoticeBanner notice={notice} />
      <Panel title="Notices" flush>
        <TableToolbar summary={data ? `${data.results.length} notice${data.results.length === 1 ? '' : 's'}` : null}
          density={density} onDensity={setDensity} />
        {error ? (
          <ErrorState title="The notices could not be loaded" detail={error} onRetry={() => void load()} />
        ) : data === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the notices</span>
            <Skeleton kind="row" count={4} />
          </div>
        ) : data.results.length === 0 ? (
          <Empty title="No notices" detail="Nothing is posted. A notice shows between its start and end time, to one audience." />
        ) : (
          <DataTable caption="Maintenance notices" rows={data.results} columns={columns} rowKey={(n) => n.id}
            density={density} onRow={canWritePlatform(access) ? (n) => setOpen(n) : undefined}
            maxHeight={false} />
        )}
      </Panel>
      {open ? (
        <NoticeDrawer notice={open === 'new' ? null : open} onClose={() => setOpen(null)}
          onDone={(n) => { setOpen(null); setNotice(n); void load(); }} />
      ) : null}
    </>
  );
}

function NoticeDrawer({ notice, onClose, onDone }: { notice: Notice15 | null; onClose: () => void; onDone: (n: Notice) => void }) {
  const now = new Date();
  const [audience, setAudience] = useState<Notice15['audience']>(notice?.audience ?? 'rider');
  const [scope, setScope] = useState(notice?.scope ?? '');
  const [message, setMessage] = useState(notice?.message ?? '');
  const [severity, setSeverity] = useState<Notice15['severity']>(notice?.severity ?? 'info');
  const [startsAt, setStartsAt] = useState(localInput(notice ? new Date(notice.starts_at) : now));
  const [endsAt, setEndsAt] = useState(localInput(notice ? new Date(notice.ends_at) : new Date(now.getTime() + 2 * 3_600_000)));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = !notice || notice.state === 'scheduled' || notice.state === 'active';

  async function save() {
    const bad = validateNotice({ message, startsAt, endsAt });
    if (bad) { setProblem(bad); return; }
    setBusy(true); setProblem(null);
    const body = {
      message: message.trim(), severity, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(),
    };
    try {
      if (notice) await api.put(`/platform/admin/notices/${notice.id}/`, body);
      else await api.post('/platform/admin/notices/', { ...body, audience, scope: scope.trim().toUpperCase() || null });
      onDone({ text: notice ? 'The notice was changed.' : 'The notice was posted.', kind: 'done' });
    } catch (err) {
      setProblem(messageOf(err, 'That did not save. Nothing changed.'));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!notice) return;
    setBusy(true); setProblem(null);
    try {
      await api.post(`/platform/admin/notices/${notice.id}/cancel/`, { reason: 'Cancelled in the console' });
      onDone({ text: 'The notice was cancelled.', kind: 'done' });
    } catch (err) {
      setProblem(messageOf(err, 'That could not be cancelled.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title={notice ? 'Notice' : 'New notice'}
      footer={editable ? (
        <>
          {notice ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={() => void cancel()}>Cancel notice</button> : null}
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void save()}>
            {notice ? 'Save' : 'Post notice'}
          </button>
        </>
      ) : undefined}>
      <div className="nf-editor">
        {!editable ? <p className="help mb-0">This notice is {NOTICE_STATE_WORDS[notice!.state].toLowerCase()} and cannot be changed.</p> : null}
        <div className="nf-grid">
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="n-aud">Audience</label>
            <select id="n-aud" className="ops-select" value={audience} disabled={!!notice} onChange={(e) => setAudience(e.target.value as Notice15['audience'])}>
              <option value="rider">Rider app</option><option value="driver">Driver app</option><option value="console">Console</option>
            </select>
          </div>
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="n-scope">Country or city code (blank: everywhere)</label>
            <input id="n-scope" className="input" value={scope} disabled={!!notice} onChange={(e) => setScope(e.target.value)} />
          </div>
        </div>
        <div className="nf-field">
          <label className="ops-form__label" htmlFor="n-msg">Message ({message.length}/{NOTICE_MAX})</label>
          <textarea id="n-msg" className="input" rows={3} value={message} disabled={!editable} maxLength={NOTICE_MAX + 20}
            onChange={(e) => setMessage(e.target.value)} />
        </div>
        <div className="nf-grid">
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="n-start">Starts</label>
            <input id="n-start" className="input" type="datetime-local" value={startsAt} disabled={!editable} onChange={(e) => setStartsAt(e.target.value)} />
          </div>
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="n-end">Ends</label>
            <input id="n-end" className="input" type="datetime-local" value={endsAt} disabled={!editable} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>
        <div className="nf-field">
          <label className="ops-form__label" htmlFor="n-sev">Severity</label>
          <select id="n-sev" className="ops-select" value={severity} disabled={!editable} onChange={(e) => setSeverity(e.target.value as Notice15['severity'])}>
            <option value="info">Info</option><option value="warning">Warning</option>
          </select>
        </div>
        {problem ? <p className="nf-problems" role="alert">{problem}</p> : null}
      </div>
    </Drawer>
  );
}
