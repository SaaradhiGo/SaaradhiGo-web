'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import { useDensity } from '@/lib/consolePrefs';
import {
  ISSUE_LABEL, LOCALE_LABEL, MACRO_PLACEHOLDERS, type MacroSummary, type MacroVersion,
  canManageMacros, canRestore, unknownPlaceholders, versionLine,
} from '@/lib/supportDesk';
import { ButtonLink } from '@/components/sg/Button';
import {
  Column, DataTable, Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * Macros: saved replies.
 *
 * A macro is text with up to three placeholders ({first_name}, {ticket_id},
 * {trip_id}) that the SERVER fills in for one ticket; the editor refuses any
 * other brace before it is saved, and so does the server. A macro is for
 * one country or all, one language, and one set of issue types or all.
 * Deactivating is soft: the text stays, the picker stops offering it, and an
 * audit row records who did it. Changing macros needs `support.macro`
 * (Super Admin and Support Lead); everyone who replies can use them.
 *
 * Saved replies are versioned: every create, edit and restore writes a new
 * version, and the editor shows the history and can restore an earlier one
 * (restoring makes a new version, it never rewrites the old ones).
 */
type Macro = MacroSummary & { created_by?: { label?: string } | null; updated_at?: string | null };

type Draft = {
  id: number | null; title: string; body: string; locale: string; country: string;
  issueTypes: string[]; active: boolean; version?: number;
};

const BLANK: Draft = { id: null, title: '', body: '', locale: 'en', country: '', issueTypes: [], active: true };

const fromMacro = (m: Macro): Draft => ({
  id: m.id, title: m.title, body: m.body, locale: m.locale, country: m.country ?? '',
  issueTypes: m.issue_types ?? [], active: m.active, version: m.version,
});

const failure = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.fromServer ? err.message : fallback;

export default function MacrosPage() {
  const access = useAdminAccess();
  const may = canManageMacros(access);
  const [density, setDensity] = useDensity();
  const [macros, setMacros] = useState<Macro[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setMacros(null);
    setError(null);
    try {
      const r = await api.get<{ results: Macro[] }>('/support/admin/macros/?include_inactive=1');
      setMacros(r.results ?? []);
    } catch (err) {
      setError(failure(err, 'We could not load the macros.'));
      setMacros([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const columns: Column<Macro>[] = [
    {
      key: 'title', label: 'Macro',
      render: (m) => (may
        ? <button type="button" className="ops-linkbtn" onClick={() => setDraft(fromMacro(m))}>{m.title}</button>
        : m.title),
    },
    { key: 'version', label: 'Version', width: '6rem', num: true, hideBelow: 1100, render: (m) => (m.version ? 'v' + m.version : '') },
    { key: 'locale', label: 'Language', width: '8rem', render: (m) => LOCALE_LABEL[m.locale] ?? m.locale },
    { key: 'country', label: 'Country', width: '8rem', render: (m) => m.country ?? 'All' },
    {
      key: 'issues', label: 'For', width: '14rem', hideBelow: 1100,
      render: (m) => (m.issue_types?.length ? m.issue_types.map((i) => ISSUE_LABEL[i] ?? i).join(', ') : 'Every issue'),
    },
    {
      key: 'active', label: 'State', width: '8rem',
      render: (m) => <Pill tone={m.active ? 'good' : 'neutral'}>{m.active ? 'active' : 'inactive'}</Pill>,
    },
    { key: 'updated', label: 'Updated', width: '10rem', num: true, hideBelow: 1280, render: (m) => stamp(m.updated_at) },
  ];

  return (
    <>
      <PageHeader
        title="Macros"
        subtitle="Saved replies. Placeholders are filled in on the server for the ticket you use them on."
        actions={
          <>
            {may ? <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setDraft({ ...BLANK })}>New macro</button> : null}
            <ButtonLink href="/support" variant="ghost" size="sm">All tickets</ButtonLink>
          </>
        }
      />
      {notice && <div className="alert-success mb-5" role="status"><b>{notice}</b></div>}
      {!may ? <p className="help">You can use macros but not change them. Changing macros needs the support.macro permission.</p> : null}

      <Panel flush>
        {macros === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading macros</span>
            <Skeleton kind="row" count={5} />
          </div>
        ) : error ? (
          <div className="p-4"><ErrorState title="The macros could not be loaded" detail={error} onRetry={() => void load()} /></div>
        ) : macros.length === 0 ? (
          <Empty title="No macros yet" detail={may ? 'Create the first one with New macro.' : 'Nobody has created one.'} />
        ) : (
          <DataTable caption="Macros" rows={macros} columns={columns} rowKey={(m) => m.id} density={density} />
        )}
        {macros && macros.length > 0 ? (
          <div className="ops-toolbar">
            <div className="ops-toolbar__left">
              <label className="ops-form__row">
                <input type="checkbox" checked={density === 'compact'} onChange={(e) => setDensity(e.target.checked ? 'compact' : 'comfortable')} /> Compact rows
              </label>
            </div>
          </div>
        ) : null}
      </Panel>

      {draft ? (
        <MacroDrawer
          draft={draft}
          onClose={() => setDraft(null)}
          onDone={(text) => { setDraft(null); setNotice(text); void load(); }}
        />
      ) : null}
    </>
  );
}

function MacroDrawer({ draft: initial, onClose, onDone }: { draft: Draft; onClose: () => void; onDone: (text: string) => void }) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bad = unknownPlaceholders(draft.body);
  const ready = !busy && draft.title.trim() !== '' && draft.body.trim() !== '' && bad.length === 0;

  const payload = () => ({
    title: draft.title.trim(), body: draft.body, locale: draft.locale,
    country: draft.country || null, issue_types: draft.issueTypes, active: draft.active,
  });

  async function save() {
    setBusy(true); setError(null);
    try {
      if (draft.id) {
        await api.patch(`/support/admin/macros/${draft.id}/`, payload());
        onDone('Macro saved.');
      } else {
        await api.post('/support/admin/macros/', payload());
        onDone('Macro created.');
      }
    } catch (err) {
      setError(failure(err, 'The macro was not saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true); setError(null);
    try {
      await api.delete(`/support/admin/macros/${draft.id}/`);
      onDone('Macro deactivated. It is no longer offered to agents.');
    } catch (err) {
      setError(failure(err, 'The macro was not deactivated.'));
    } finally {
      setBusy(false);
    }
  }

  const toggleIssue = (key: string) => setDraft((d) => ({
    ...d, issueTypes: d.issueTypes.includes(key) ? d.issueTypes.filter((k) => k !== key) : [...d.issueTypes, key],
  }));

  return (
    <Drawer
      open
      title={draft.id ? `Edit macro #${draft.id}` : 'New macro'}
      onClose={onClose}
      footer={
        <>
          {draft.id && initial.active ? (
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void deactivate()} disabled={busy}>Deactivate</button>
          ) : null}
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => void save()} disabled={!ready}>
            {busy ? 'Saving…' : 'Save macro'}
          </button>
        </>
      }
    >
      <div className="ops-form">
        <label className="ops-form__label" htmlFor="mc-title">Title</label>
        <input id="mc-title" className="input" value={draft.title} maxLength={120} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />

        <label className="ops-form__label" htmlFor="mc-body">Text</label>
        <textarea id="mc-body" className="input" rows={7} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
        <p className="help m-0">
          Placeholders the server fills in: {MACRO_PLACEHOLDERS.join(' ')}. Anything else in braces is refused.
        </p>
        {bad.length > 0 ? (
          <div className="alert-error" role="alert">Not allowed: {bad.join(' ')}</div>
        ) : null}

        <div className="ops-form__row">
          <label className="ops-form__label" htmlFor="mc-locale">Language</label>
          <select id="mc-locale" className="ops-select" value={draft.locale} onChange={(e) => setDraft({ ...draft, locale: e.target.value })}>
            {Object.entries(LOCALE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <label className="ops-form__label" htmlFor="mc-country">Country</label>
          <select id="mc-country" className="ops-select" value={draft.country} onChange={(e) => setDraft({ ...draft, country: e.target.value })}>
            <option value="">All countries</option>
            <option value="IN">India</option>
            <option value="US">United States</option>
          </select>
        </div>

        <div className="ops-filterset">
          <fieldset>
            <legend>Offer it for (none ticked means every issue)</legend>
            {Object.entries(ISSUE_LABEL).map(([v, l]) => (
              <label key={v}><input type="checkbox" checked={draft.issueTypes.includes(v)} onChange={() => toggleIssue(v)} />{l}</label>
            ))}
          </fieldset>
        </div>

        {draft.id ? (
          <label className="ops-form__row">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active
          </label>
        ) : null}
        {error && <div className="alert-error" role="alert">{error}</div>}
        {draft.id ? <History macroId={draft.id} current={initial.version} onDone={onDone} /> : null}
      </div>
    </Drawer>
  );
}

/**
 * Version history. Every create, edit and restore is a new version; nothing is
 * ever rewritten. Restoring an earlier version makes a NEW one with its text,
 * so the list only ever grows and shows who did what.
 */
function History({ macroId, current, onDone }: { macroId: number; current: number | undefined; onDone: (text: string) => void }) {
  const [versions, setVersions] = useState<MacroVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    api.get<{ results: MacroVersion[] }>('/support/admin/macros/' + macroId + '/versions/')
      .then((r) => { if (live) setVersions(r.results ?? []); })
      .catch((err) => { if (live) { setError(failure(err, 'We could not load the history.')); setVersions([]); } });
    return () => { live = false; };
  }, [macroId]);

  async function restore(version: number) {
    setBusy(version); setError(null);
    try {
      const out = await api.post<{ changed?: boolean; version?: number }>(
        '/support/admin/macros/' + macroId + '/restore/', { version });
      onDone(out?.changed === false
        ? 'Nothing changed: the macro already says that.'
        : 'Version ' + version + ' restored as version ' + out?.version + '.');
    } catch (err) {
      setError(failure(err, 'That version was not restored.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="mc-history" className="ops-history">
      <h3 id="mc-history" className="ops-form__label">History</h3>
      {versions === null ? (
        <p className="help m-0" aria-busy="true">Loading the history…</p>
      ) : versions.length === 0 ? (
        <p className="help m-0">{error ?? 'No history yet.'}</p>
      ) : (
        <ol className="ops-history__list">
          {versions.map((v) => (
            <li key={v.version} className="ops-history__item">
              <div>
                <b>{versionLine(v)}</b>
                {v.version === current ? <> <Pill tone="good">Current</Pill></> : null}
                <div className="help m-0">
                  {v.edited_by?.label ?? 'Unknown'} · {stamp(v.created_at)}
                </div>
                <details>
                  <summary>Show the text</summary>
                  <p className="ops-history__body">{v.body}</p>
                </details>
              </div>
              {canRestore(v, current) ? (
                <button
                  type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
                  disabled={busy !== null} onClick={() => void restore(v.version)}
                >
                  {busy === v.version ? 'Restoring…' : 'Restore'}<span className="sr-only"> version {v.version}</span>
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {error && versions && versions.length > 0 ? <div className="alert-error" role="alert">{error}</div> : null}
    </section>
  );
}
