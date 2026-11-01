'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import {
  SETTING_KEY_RE, SETTING_TYPES, canWritePlatform, looksSensitive, validateSettingValue, type Pending,
  type SettingRow, type SettingType,
} from '@/lib/platform';
import { NoticeBanner, messageOf, type Notice } from '@/components/console/notifications';
import {
  PendingRequests, PlatformNav, PlatformNoAccess, outcomeNotice,
} from '@/components/console/platform';
import {
  DataTable, Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

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
  const [density, setDensity] = useDensity();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState<SettingRow | 'new' | null>(null);

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

  const columns = useMemo(() => [
    { key: 'key', label: 'Key', sortValue: (r: SettingRow) => r.key, render: (r: SettingRow) => <b>{r.key}</b> },
    { key: 'type', label: 'Type', width: '7rem', render: (r: SettingRow) => r.setting_type },
    { key: 'value', label: 'Value', width: '14rem', render: (r: SettingRow) => <code className="nf-envnames">{r.value}</code> },
    { key: 'flags', label: 'State', width: '12rem', render: (r: SettingRow) => (r.deprecated ? <Pill tone="wait">Deprecated, read-only</Pill> : r.is_sensitive ? <Pill tone="neutral">Sensitive</Pill> : <span className="muted">—</span>) },
    { key: 'controls', label: 'Controls', hideBelow: 1100 as const,
      render: (r: SettingRow) => (r.controls.length ? r.controls.join(', ') : <span className="muted">Nothing reads this key yet</span>) },
    { key: 'when', label: 'Changed', width: '12rem', hideBelow: 1280 as const, render: (r: SettingRow) => `${r.updated_by ?? '—'} · ${stamp(r.updated_at)}` },
  ], []);

  if (!canWritePlatform(access)) {
    return (<><PageHeader title="Platform settings" /><PlatformNav /><PlatformNoAccess what="The settings editor" /></>);
  }

  return (
    <>
      <PageHeader title="Platform settings"
        subtitle="Runtime key and value settings. Every change is audited with its before and after; a sensitive key needs a second admin."
        actions={<button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setOpen('new')}>New setting…</button>} />
      <PlatformNav />
      <NoticeBanner notice={notice} />
      {data ? <PendingRequests items={data.pending} onDecided={(n) => { setNotice(n); void load(); }}
        describe={(p) => `Change the sensitive setting ${p.target}`} /> : null}
      <Panel title="Settings" flush>
        <TableToolbar summary={data ? `${data.results.length} setting${data.results.length === 1 ? '' : 's'}` : null}
          density={density} onDensity={setDensity} />
        {error ? (
          <ErrorState title="The settings could not be loaded" detail={error} onRetry={() => void load()} />
        ) : data === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the settings</span>
            <Skeleton kind="row" count={4} />
          </div>
        ) : data.results.length === 0 ? (
          <Empty title="No settings yet" detail={data.note} />
        ) : (
          <DataTable caption="Platform settings" rows={data.results} columns={columns} rowKey={(r) => r.key}
            density={density} onRow={(r) => setOpen(r)} defaultSort={{ key: 'key', dir: 'asc' }} maxHeight={false} />
        )}
      </Panel>
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
