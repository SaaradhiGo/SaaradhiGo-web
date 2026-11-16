'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import {
  SETTING_KEY_RE, SETTING_TYPES, canWritePlatform, looksSensitive, validateSettingValue, type Pending,
  type SettingRow, type SettingType,
} from '@/lib/platform';
import { NoticeBanner, messageOf, type Notice } from '@/components/console/notifications';
import {
  PendingRequests, PlatformNav, PlatformNoAccess, outcomeNotice,
} from '@/components/console/platform';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { Drawer, PageHeader } from '@/components/console/ui';

/**
 * Platform settings: the key/value editor.
 *
 * Each row shows what the key controls. Today nothing in the platform reads a setting (the one reader
 * has no caller; commission moved to its own versioned rules), so every row says so: changing a value
 * here changes nothing yet. A sensitive key (its name holds SECRET, TOKEN, PASSWORD, KEY or CREDENTIAL,
 * or it is marked) needs a second admin and its value is never shown. A deprecated key is read-only
 * and points at the page that replaced it.
 */
type Payload = { results: SettingRow[]; pending: Pending[]; types: SettingType[]; note: string };

export default function SettingsPage() {
  const access = useAdminAccess();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState<SettingRow | 'new' | null>(null);
  const [view, setView] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Payload>('/platform/admin/settings/'));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The settings could not be loaded.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const columns: ListColumn<SettingRow>[] = [
    { key: 'key', label: 'Key', primary: true, render: (r) => r.key },
    { key: 'type', label: 'Type', render: (r) => r.setting_type },
    { key: 'value', label: 'Value', render: (r) => <code className="nf-envnames">{r.value}</code> },
    {
      key: 'flags', label: 'Status',
      render: (r) => (r.deprecated ? <StatusChip tone="info">Deprecated, read-only</StatusChip>
        : r.is_sensitive ? <StatusChip tone="neutral">Sensitive</StatusChip> : <StatusChip tone="good">In use</StatusChip>),
    },
    { key: 'controls', label: 'Controls', render: (r) => (r.controls.length ? r.controls.join(', ') : <span className="muted">Nothing reads this key yet</span>) },
    { key: 'when', label: 'Changed', render: (r) => `${r.updated_by ?? '—'} · ${stamp(r.updated_at)}` },
  ];

  if (!canWritePlatform(access)) {
    return (<><PageHeader title="Platform settings" /><PlatformNav /><PlatformNoAccess what="The settings editor" /></>);
  }

  const all = [...(data?.results ?? [])].sort((x, y) => x.key.localeCompare(y.key));
  const inView = (r: SettingRow) => (view === 'sensitive' ? r.is_sensitive : view === 'deprecated' ? r.deprecated : true);
  const needle = q.trim().toUpperCase();
  const rows = all.filter((r) => inView(r) && (!needle || r.key.includes(needle) || (r.description ?? '').toUpperCase().includes(needle)));

  return (
    <>
      <PlatformNav />
      <NoticeBanner notice={notice} />
      {data ? <PendingRequests items={data.pending} onDecided={(n) => { setNotice(n); void load(); }}
        describe={(p) => `Change the sensitive setting ${p.target}`} /> : null}
      <ListPage<SettingRow>
        pageKey="settings-platform"
        title="Platform settings"
        summary="Runtime key and value settings. Every change is audited with its before and after; a sensitive key needs a second admin."
        actionsSlot={<button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setOpen('new')}>New setting…</button>}
        views={[
          { key: '', label: 'All', count: data ? all.length : undefined },
          { key: 'sensitive', label: 'Sensitive', count: data ? all.filter((r) => r.is_sensitive).length : undefined },
          { key: 'deprecated', label: 'Deprecated', count: data ? all.filter((r) => r.deprecated).length : undefined },
        ]}
        view={view}
        onView={setView}
        chips={q.trim() ? [{ key: 'q', label: `Search: ${q.trim()}`, onRemove: () => setQ('') }] : []}
        filterSlot={(
          <>
            <label className="sr-only" htmlFor="st-q">Search settings</label>
            <input id="st-q" className="input ops-list__search" type="search" placeholder="Search by key" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </>
        )}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.key}
        total={data ? rows.length : null}
        page={1}
        pageSize={Math.max(1, rows.length)}
        onPage={() => undefined}
        onRow={(r) => setOpen(r)}
        activeKey={open && open !== 'new' ? open.key : null}
        loading={data === null && !error}
        error={error}
        empty={data && data.results.length === 0 ? `No settings yet. ${data.note}` : 'No setting matches.'}
      />
      {open ? (
        <SettingDrawer row={open === 'new' ? null : open} onClose={() => setOpen(null)}
          onDone={(n) => { setOpen(null); setNotice(n); void load(); }} />
      ) : null}
    </>
  );
}

function SettingDrawer({ row, onClose, onDone }: { row: SettingRow | null; onClose: () => void; onDone: (n: Notice) => void }) {
  const [key, setKey] = useState(row?.key ?? '');
  const [type, setType] = useState<SettingType>(row?.setting_type ?? 'string');
  const [value, setValue] = useState(row && !row.masked ? row.value : '');
  const [description, setDescription] = useState(row?.description ?? '');
  const [sensitive, setSensitive] = useState(row?.is_sensitive ?? false);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const readOnly = !!row && !row.editable;
  const needsChecker = sensitive || looksSensitive(key);

  async function save() {
    if (!SETTING_KEY_RE.test(key.trim())) { setProblem('A key is UPPER_CASE letters, digits and "_" (3 to 128 characters).'); return; }
    const bad = validateSettingValue(type, value);
    if (bad) { setProblem(bad); return; }
    if (!row && !description.trim()) { setProblem('Describe what the setting is for.'); return; }
    if (reason.trim().length < 5) { setProblem('Say why, in a few words.'); return; }
    setBusy(true); setProblem(null);
    try {
      const out = await api.put<{ state?: string; approval_request?: { id: number } }>(
        `/platform/admin/settings/${encodeURIComponent(key.trim())}/`, {
          value, setting_type: type, description, is_sensitive: sensitive, reason: reason.trim(),
        });
      onDone(outcomeNotice(out, 'The setting was saved.'));
    } catch (err) {
      setProblem(messageOf(err, 'That did not go through. Nothing changed.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title={row ? row.key : 'New setting'}
      footer={!readOnly ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void save()}>
          {needsChecker ? 'Send for approval' : 'Save'}
        </button>
      ) : undefined}>
      <div className="nf-editor">
        {readOnly ? (
          <div className="ops-confirm" role="status">
            <b>Deprecated, read-only</b>
            <span>{row?.deprecated_note} {row?.deprecated_href ? <Link href={row.deprecated_href}>Go to {row.deprecated_href}</Link> : null}</span>
          </div>
        ) : null}
        <div className="nf-field">
          <label className="ops-form__label" htmlFor="s-key">Key</label>
          <input id="s-key" className="input" value={key} disabled={!!row} onChange={(e) => setKey(e.target.value)} />
        </div>
        <div className="nf-grid">
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="s-type">Type</label>
            <select id="s-type" className="ops-select" value={type} disabled={readOnly} onChange={(e) => setType(e.target.value as SettingType)}>
              {SETTING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="s-value">Value{row?.masked ? ' (hidden; type a new one)' : ''}</label>
            <input id="s-value" className="input" value={value} disabled={readOnly} autoComplete="off"
              type={needsChecker ? 'password' : 'text'} onChange={(e) => setValue(e.target.value)} />
          </div>
        </div>
        <div className="nf-field">
          <label className="ops-form__label" htmlFor="s-desc">What it is for</label>
          <input id="s-desc" className="input" value={description} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <label className="nf-inline"><input type="checkbox" checked={sensitive || looksSensitive(key)} disabled={readOnly || looksSensitive(key) || !!row?.is_sensitive}
          onChange={(e) => setSensitive(e.target.checked)} /> Sensitive: needs a second admin and is never shown</label>
        {row ? (
          <p className="help mb-0">{row.controls.length ? `Controls: ${row.controls.join(', ')}.` : 'Nothing in the platform reads this key yet.'}</p>
        ) : null}
        {!readOnly ? (
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="s-reason">Reason</label>
            <textarea id="s-reason" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        ) : null}
        {problem ? <p className="nf-problems" role="alert">{problem}</p> : null}
      </div>
    </Drawer>
  );
}
