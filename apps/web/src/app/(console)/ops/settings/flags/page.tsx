'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import {
  canReadPlatform, canWritePlatform, validateFlagKey, type Flag, type FlagHistory, type Pending,
} from '@/lib/platform';
import { NoticeBanner, messageOf, type Notice } from '@/components/console/notifications';
import {
  PendingRequests, PlatformNav, PlatformNoAccess, outcomeNotice,
} from '@/components/console/platform';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { StatusChip } from '@/components/console/kit/StatusChip';
import {
  Drawer, ErrorState, PageHeader, Skeleton,
} from '@/components/console/ui';

/**
 * Platform settings: Feature flags.
 *
 * A flag has a default and per-country and per-city overrides; the most specific wins (city, then
 * country, then default). A flag marked money-affecting or safety changes only through a second
 * admin; any other takes effect at once and is audited. No flag is seeded: nothing in the platform
 * reads one yet, so the list is empty until the change that adds a reader creates its flag.
 */
type Payload = { results: Flag[]; pending: Pending[]; note: string };

export default function FlagsPage() {
  const access = useAdminAccess();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState<string | 'new' | null>(null);
  const [view, setView] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Payload>('/platform/admin/flags/'));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The feature flags could not be loaded.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const columns: ListColumn<Flag>[] = [
    { key: 'key', label: 'Flag', primary: true, render: (f) => <>{f.key} <span className="muted">v{f.version}</span></> },
    { key: 'def', label: 'Default', render: (f) => <StatusChip tone={f.default_enabled ? 'good' : 'neutral'}>{f.default_enabled ? 'On' : 'Off'}</StatusChip> },
    {
      key: 'ov', label: 'Overrides',
      render: (f) => (Object.keys(f.overrides).length ? Object.entries(f.overrides).map(([k, v]) => `${k}: ${v ? 'on' : 'off'}`).join(', ') : <span className="muted">none</span>),
    },
    { key: 'kind', label: 'Needs a checker', render: (f) => (f.money_affecting ? 'Money-affecting' : f.safety ? 'Safety' : <span className="muted">No</span>) },
    { key: 'area', label: 'Owner', render: (f) => f.owner_area },
    { key: 'when', label: 'Changed', render: (f) => stamp(f.updated_at) },
  ];

  if (!canReadPlatform(access)) {
    return (<><PageHeader title="Feature flags" /><PlatformNav /><PlatformNoAccess what="Feature flags" /></>);
  }

  const all = [...(data?.results ?? [])].sort((x, y) => x.key.localeCompare(y.key));
  const inView = (f: Flag) => (view === 'on' ? f.default_enabled : view === 'off' ? !f.default_enabled
    : view === 'checked' ? (f.money_affecting || f.safety) : true);
  const needle = q.trim().toLowerCase();
  const rows = all.filter((f) => inView(f) && (!needle || f.key.toLowerCase().includes(needle)));

  return (
    <>
      <PlatformNav />
      <NoticeBanner notice={notice} />
      {data ? <PendingRequests items={data.pending} onDecided={(n) => { setNotice(n); void load(); }}
        describe={(p) => `Change flag ${p.target}`} /> : null}
      <ListPage<Flag>
        pageKey="settings-flags"
        title="Feature flags"
        summary="Switches that gate behaviour, by default, country or city. Money-affecting and safety flags change only through a second admin."
        actionsSlot={canWritePlatform(access) ? (
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setOpen('new')}>New flag…</button>
        ) : undefined}
        views={[
          { key: '', label: 'All', count: data ? all.length : undefined },
          { key: 'on', label: 'On by default', count: data ? all.filter((f) => f.default_enabled).length : undefined },
          { key: 'off', label: 'Off by default', count: data ? all.filter((f) => !f.default_enabled).length : undefined },
          { key: 'checked', label: 'Needs a checker', count: data ? all.filter((f) => f.money_affecting || f.safety).length : undefined },
        ]}
        view={view}
        onView={setView}
        chips={q.trim() ? [{ key: 'q', label: `Search: ${q.trim()}`, onRemove: () => setQ('') }] : []}
        filterSlot={(
          <>
            <label className="sr-only" htmlFor="fl-q">Search flags</label>
            <input id="fl-q" className="input ops-list__search" type="search" placeholder="Search a flag" value={q}
              onChange={(e) => setQ(e.target.value)} />
          </>
        )}
        columns={columns}
        rows={rows}
        rowKey={(f) => f.key}
        total={data ? rows.length : null}
        page={1}
        pageSize={Math.max(1, rows.length)}
        onPage={() => undefined}
        onRow={(f) => setOpen(f.key)}
        activeKey={open === 'new' ? null : open}
        loading={data === null && !error}
        error={error}
        empty={data && data.results.length === 0 ? `No feature flags yet. ${data.note}` : 'No flag matches.'}
      />

      {open ? (
        <FlagDrawer flagKey={open === 'new' ? null : open} onClose={() => setOpen(null)}
          onDone={(n) => { setOpen(null); setNotice(n); void load(); }} />
      ) : null}
    </>
  );
}

function FlagDrawer({ flagKey, onClose, onDone }: { flagKey: string | null; onClose: () => void; onDone: (n: Notice) => void }) {
  const access = useAdminAccess();
  const may = canWritePlatform(access);
  const [flag, setFlag] = useState<(Flag & { history: FlagHistory[] }) | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [moneyAffecting, setMoney] = useState(false);
  const [safety, setSafety] = useState(false);
  const [def, setDef] = useState(false);
  const [place, setPlace] = useState('');
  const [value, setValue] = useState<'on' | 'off' | 'remove'>('on');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!flagKey) return;
    setLoadError(null);
    try {
      const f = await api.get<Flag & { history: FlagHistory[] }>(`/platform/admin/flags/${encodeURIComponent(flagKey)}/`);
      setFlag(f); setDef(f.default_enabled);
    } catch (err) {
      setLoadError(messageOf(err, 'That flag could not be loaded.'));
    }
  }, [flagKey]);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    const bad = validateFlagKey(key.trim());
    if (bad) { setProblem(bad); return; }
    if (!description.trim()) { setProblem('Say what the flag gates.'); return; }
    setBusy(true); setProblem(null);
    try {
      await api.post('/platform/admin/flags/', {
        key: key.trim(), description: description.trim(), default_enabled: def,
        money_affecting: moneyAffecting, safety, reason: reason.trim() || 'created',
      });
      onDone({ text: 'The flag was created.', kind: 'done' });
    } catch (err) {
      setProblem(messageOf(err, 'That did not save. Nothing was created.'));
    } finally {
      setBusy(false);
    }
  }

  async function change(body: Record<string, unknown>) {
    if (reason.trim().length < 5) { setProblem('Say why, in a few words.'); return; }
    setBusy(true); setProblem(null);
    try {
      const out = await api.put<{ state?: string; approval_request?: { id: number } }>(
        `/platform/admin/flags/${encodeURIComponent(flagKey as string)}/`, { ...body, reason: reason.trim() });
      onDone(outcomeNotice(out, 'The flag was changed.'));
    } catch (err) {
      setProblem(messageOf(err, 'That did not go through. Nothing changed.'));
    } finally {
      setBusy(false);
    }
  }

  const fresh = flagKey === null;
  return (
    <Drawer open wide onClose={onClose} title={fresh ? 'New flag' : flagKey as string}
      footer={may ? (fresh ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void create()}>Create flag</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
            onClick={() => void change({ default_enabled: def })}>Save default</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || !place.trim()}
            onClick={() => void change({ overrides: { [place.trim().toUpperCase()]: value === 'remove' ? null : value === 'on' } })}>
            Save override
          </button>
        </>
      )) : undefined}>
      {loadError ? <ErrorState title="That flag could not be loaded" detail={loadError} onRetry={() => void load()} />
        : !fresh && !flag ? (
          <div className="ops-skel-rows" aria-busy="true"><span className="sr-only">Loading the flag</span><Skeleton kind="row" count={4} /></div>
        ) : (
          <div className="nf-editor">
            {fresh ? (
              <>
                <div className="nf-field">
                  <label className="ops-form__label" htmlFor="flag-key">Key</label>
                  <input id="flag-key" className="input" value={key} onChange={(e) => setKey(e.target.value)} />
                </div>
                <div className="nf-field">
                  <label className="ops-form__label" htmlFor="flag-desc">What it gates</label>
                  <input id="flag-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <fieldset className="nf-checks">
                  <legend>Needs a checker</legend>
                  <label><input type="checkbox" checked={moneyAffecting} onChange={(e) => setMoney(e.target.checked)} /> Money-affecting</label>
                  <label><input type="checkbox" checked={safety} onChange={(e) => setSafety(e.target.checked)} /> Safety</label>
                </fieldset>
              </>
            ) : flag ? (
              <p className="help mb-0">
                {flag.description} {flag.needs_checker ? 'A change needs a second admin.' : 'A change takes effect at once.'}
              </p>
            ) : null}
            <label className="nf-inline"><input type="checkbox" checked={def} disabled={!may}
              onChange={(e) => setDef(e.target.checked)} /> Enabled by default</label>

            {!fresh && may ? (
              <div className="nf-grid">
                <div className="nf-field">
                  <label className="ops-form__label" htmlFor="flag-place">Country or city code</label>
                  <input id="flag-place" className="input" value={place} placeholder="Code of a country or city" onChange={(e) => setPlace(e.target.value)} />
                </div>
                <div className="nf-field">
                  <label className="ops-form__label" htmlFor="flag-value">Override</label>
                  <select id="flag-value" className="ops-select" value={value} onChange={(e) => setValue(e.target.value as typeof value)}>
                    <option value="on">On</option><option value="off">Off</option><option value="remove">Remove the override</option>
                  </select>
                </div>
              </div>
            ) : null}
            {flag && Object.keys(flag.overrides).length ? (
              <ul className="nf-versions" aria-label="Overrides">
                {Object.entries(flag.overrides).map(([k, v]) => <li key={k}><b>{k}</b> {v ? 'on' : 'off'}</li>)}
              </ul>
            ) : null}
            {may ? (
              <div className="nf-field">
                <label className="ops-form__label" htmlFor="flag-reason">Reason</label>
                <textarea id="flag-reason" className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
            ) : null}
            {problem ? <p className="nf-problems" role="alert">{problem}</p> : null}
            {flag?.history?.length ? (
              <>
                <h3 className="ops-form__label">History</h3>
                <ul className="nf-versions">
                  {flag.history.map((h) => (
                    <li key={h.version}>
                      <b>v{h.version}</b> {stamp(h.created_at)} · {h.changed_by || 'staff'} · default {h.snapshot.default ? 'on' : 'off'}
                      {Object.keys(h.snapshot.overrides).length ? `, ${Object.keys(h.snapshot.overrides).length} override(s)` : ''}
                      {h.reason ? ` · ${h.reason}` : ''}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        )}
    </Drawer>
  );
}
