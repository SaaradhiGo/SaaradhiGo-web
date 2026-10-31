'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import {
  CHANNELS, CHANNEL_WORDS, TEMPLATE_STATUS_WORDS, canDraftTemplates, detectVariables, emptyRegistration,
  parseNames, registrationKind, registrationProblems, renderPreview, smsSegments, templateTone, toDltText,
  validateCopy, type Category, type Channel, type PreviewResult, type Problem, type Registration,
  type TemplateDetail,
} from '@/lib/notifications';
import { interpretWrite } from '@/lib/trips';
import { Drawer, ErrorState, Fact, Facts, Pill, Skeleton } from '@/components/console/ui';
import { messageOf, type Notice } from '@/components/console/notifications';

/**
 * The template editor: the copy, the variables, a live preview with sample values, and (for
 * an India SMS or a WhatsApp template) the registration the carrier needs.
 *
 * NOTHING GOES LIVE FROM HERE. "Submit for approval" asks the server to validate and raise a
 * request; a different admin approves it. The refusal for an India SMS without its DLT ids is
 * shown while typing (computed locally from the same rule) and again, verbatim, if the server
 * refuses the submit. The server is the authority; this only makes the reason visible early.
 */
type Draft = {
  key: string; channel: Channel; country: string; category: Category; subject: string; title: string;
  body: string; variablesText: string; personalText: string; samples: Record<string, string>;
  reason: string; reg: Registration;
};

const COUNTRIES = ['IN', 'US'] as const;

const blank = (country: string): Draft => ({
  key: '', channel: 'email', country, category: 'transactional', subject: '', title: '', body: '',
  variablesText: '', personalText: '', samples: {}, reason: '', reg: emptyRegistration(),
});

function fromDetail(d: TemplateDetail): Draft {
  return {
    key: d.key, channel: d.channel, country: d.country, category: d.category, subject: d.subject,
    title: d.title, body: d.body, variablesText: d.variables.join(', '),
    personalText: d.personal_variables.join(', '), samples: d.sample_values, reason: '',
    reg: d.registrations.find((r) => r.provider === 'msg91') ?? d.registrations[0] ?? emptyRegistration(),
  };
}

export function TemplateEditor({ templateId, defaultCountry, onClose, onDone, onOpen }: {
  /** An id to open, or `null` to start a new template. */
  templateId: number | null;
  defaultCountry: string;
  onClose: () => void;
  onDone: (n: Notice) => void;
  onOpen: (id: number) => void;
}) {
  const access = useAdminAccess();
  const may = canDraftTemplates(access);
  const [detail, setDetail] = useState<TemplateDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => blank(defaultCountry));
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [server, setServer] = useState<PreviewResult | null>(null);

  const load = useCallback(async () => {
    if (templateId === null) return;
    setLoadError(null);
    try {
      const d = await api.get<TemplateDetail>(`/notifications/admin/templates/${templateId}/`);
      setDetail(d);
      setDraft(fromDetail(d));
    } catch (err) {
      setLoadError(messageOf(err, 'That template could not be loaded.'));
    }
  }, [templateId]);
  useEffect(() => { void load(); }, [load]);

  const editable = templateId === null || detail?.status === 'draft';
  const locked = !may || !editable;

  const variables = useMemo(() => parseNames(draft.variablesText), [draft.variablesText]);
  const personal = useMemo(() => parseNames(draft.personalText), [draft.personalText]);
  const copyProblems = useMemo(() => validateCopy({
    body: draft.body, subject: draft.subject, title: draft.title, variables, personal,
  }), [draft.body, draft.subject, draft.title, variables, personal]);

  const kind = registrationKind(draft.channel, draft.country);
  const regProblems: Problem[] = useMemo(
    () => registrationProblems(draft.channel, draft.country, draft.body, draft.reg),
    [draft.channel, draft.country, draft.body, draft.reg],
  );

  // The preview: instant and local, so typing never waits on the network.
  const shown = useMemo(() => ({
    body: renderPreview(draft.body, draft.samples),
    subject: renderPreview(draft.subject, draft.samples),
    title: renderPreview(draft.title, draft.samples),
  }), [draft.body, draft.subject, draft.title, draft.samples]);
  const missing = Array.from(new Set([...shown.body.missing, ...shown.subject.missing, ...shown.title.missing]));

  // And the server's own opinion, debounced: the same rules, from the authority.
  useEffect(() => {
    if (!draft.body.trim()) { setServer(null); return undefined; }
    const timer = setTimeout(() => {
      api.post<PreviewResult>('/notifications/admin/templates/preview/', {
        body: draft.body, subject: draft.subject, title: draft.title, variables, personal_variables: personal,
        values: draft.samples, channel: draft.channel, country: draft.country,
        registrations: kind ? [draft.reg] : [],
      }).then(setServer).catch(() => setServer(null));
    }, 450);
    return () => clearTimeout(timer);
  }, [draft.body, draft.subject, draft.title, draft.samples, draft.channel, draft.country, draft.reg, variables, personal, kind]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setReg = (patch: Partial<Registration>) => setDraft((d) => ({ ...d, reg: { ...d.reg, ...patch } }));

  function detect() {
    const names = detectVariables(draft.body, draft.subject, draft.title);
    setDraft((d) => ({ ...d, variablesText: names.join(', ') }));
  }

  const payload = () => ({
    key: draft.key.trim(), channel: draft.channel, country: draft.country, category: draft.category,
    subject: draft.subject, title: draft.title, body: draft.body, variables, personal_variables: personal,
    sample_values: draft.samples, reason: draft.reason.trim(),
  });

  async function save(): Promise<number | null> {
    setBusy(true); setRefusal(null);
    try {
      let id = templateId;
      if (id === null) {
        const created = await api.post<TemplateDetail>('/notifications/admin/templates/', payload());
        id = created.id;
      } else {
        const { key: _k, channel: _c, country: _o, ...editableFields } = payload();
        await api.patch(`/notifications/admin/templates/${id}/`, editableFields);
      }
      if (kind) {
        await api.put(`/notifications/admin/templates/${id}/registrations/`, {
          registrations: [{ ...draft.reg, provider: draft.reg.provider || 'msg91' }],
        });
      }
      return id;
    } catch (err) {
      setRefusal(messageOf(err, 'That did not save. Nothing was changed.'));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    const id = await save();
    if (id === null) return;
    if (templateId === null) onOpen(id); else { await load(); onDone({ text: 'The draft was saved.', kind: 'done' }); }
  }

  async function submit() {
    if (draft.reason.trim().length < 5) { setRefusal('Say why, in a few words.'); return; }
    const id = await save();
    if (id === null) return;
    setBusy(true); setRefusal(null);
    try {
      const body = await api.post<{ approval_request?: { id: number; status?: string } | null; state?: string }>(
        `/notifications/admin/templates/${id}/submit/`, { reason: draft.reason.trim() });
      const result = interpretWrite(body as never, 'The template is active.');
      onDone({ text: result.message, kind: result.kind === 'pending' ? 'pending' : 'done' });
    } catch (err) {
      // The server's refusal is the point: shown as written (the DLT message names what is missing).
      setRefusal(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.');
      if (templateId === null) onOpen(id);
    } finally {
      setBusy(false);
    }
  }

  async function newVersion() {
    if (!detail) return;
    setBusy(true); setRefusal(null);
    try {
      const created = await api.post<TemplateDetail>('/notifications/admin/templates/', {
        from_template_id: detail.id, reason: `New version of ${detail.key}`,
      });
      onOpen(created.id);
    } catch (err) {
      setRefusal(messageOf(err, 'A new version could not be started.'));
    } finally {
      setBusy(false);
    }
  }

  async function retire() {
    if (!detail) return;
    if (draft.reason.trim().length < 5) { setRefusal('Say why this template is being retired.'); return; }
    setBusy(true); setRefusal(null);
    try {
      const body = await api.post<{ approval_request?: { id: number; status?: string } | null; state?: string }>(
        `/notifications/admin/templates/${detail.id}/archive/`, { reason: draft.reason.trim() });
      const result = interpretWrite(body as never, 'The template was retired.');
      onDone({ text: result.message, kind: result.kind === 'pending' ? 'pending' : 'done' });
    } catch (err) {
      setRefusal(messageOf(err, 'That did not go through.'));
    } finally {
      setBusy(false);
    }
  }

  const title = templateId === null ? 'New template' : detail ? `${detail.key} · ${CHANNEL_WORDS[detail.channel]} · ${detail.country}` : 'Template';
  const seg = draft.channel === 'sms' ? smsSegments(shown.body.text) : null;
  const refusalBlock = regProblems.length > 0 && kind !== null;

  return (
    <Drawer open wide onClose={onClose} title={title}
      footer={!locked ? (
        <>
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => void saveDraft()}>
            {busy ? 'Working…' : 'Save draft'}
          </button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void submit()}>
            Submit for approval
          </button>
        </>
      ) : detail?.status === 'active' && may ? (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={() => void retire()}>Retire…</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void newVersion()}>New version</button>
        </>
      ) : detail && may && detail.status === 'archived' ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void newVersion()}>New version from this</button>
      ) : undefined}>
      {loadError ? <ErrorState title="That template could not be loaded" detail={loadError} onRetry={() => void load()} />
        : templateId !== null && !detail ? (
          <div className="ops-skel-rows" aria-busy="true"><span className="sr-only">Loading the template</span><Skeleton kind="row" count={4} /></div>
        ) : (
          <div className="nf-editor">
            {detail ? (
              <Facts>
                <Fact label="Status"><Pill tone={templateTone(detail.status)}>{TEMPLATE_STATUS_WORDS[detail.status]}</Pill></Fact>
                <Fact label="Version">v{detail.version}</Fact>
                <Fact label="Written by">{detail.created_by.label || '—'}</Fact>
                <Fact label="Created">{stamp(detail.created_at)}</Fact>
                {detail.activated_at ? <Fact label="Went live">{stamp(detail.activated_at)}</Fact> : null}
                {detail.changed_via_request_id ? <Fact label="Approval request">#{detail.changed_via_request_id}</Fact> : null}
              </Facts>
            ) : null}
            {detail && detail.status === 'pending_approval' ? (
              <div className="ops-confirm" role="status">
                <b>Waiting for a second admin</b>
                <span>The copy cannot be edited while the request is open. It stays as it is until a different admin approves it.</span>
              </div>
            ) : null}

            <section className="ops-form" aria-label="Template details">
              <div className="nf-grid">
                <div className="nf-field">
                  <label className="ops-form__label" htmlFor="tpl-key">Key</label>
                  <input id="tpl-key" className="input" value={draft.key} disabled={templateId !== null || locked}
                    placeholder="commission.increase_notice" onChange={(e) => set('key', e.target.value)} />
                </div>
                <div className="nf-field">
                  <label className="ops-form__label" htmlFor="tpl-channel">Channel</label>
                  <select id="tpl-channel" className="ops-select" value={draft.channel} disabled={templateId !== null || locked}
                    onChange={(e) => set('channel', e.target.value as Channel)}>
                    {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_WORDS[c]}</option>)}
                  </select>
                </div>
                <div className="nf-field">
                  <label className="ops-form__label" htmlFor="tpl-country">Country</label>
                  <select id="tpl-country" className="ops-select" value={draft.country} disabled={templateId !== null || locked}
                    onChange={(e) => set('country', e.target.value)}>
                    {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="nf-field">
                  <label className="ops-form__label" htmlFor="tpl-category">Category</label>
                  <select id="tpl-category" className="ops-select" value={draft.category} disabled={locked}
                    onChange={(e) => set('category', e.target.value as Category)}>
                    <option value="transactional">Transactional</option>
                    <option value="promotional">Promotional</option>
                  </select>
                </div>
              </div>

              {draft.channel === 'email' ? (
                <>
                  <label className="ops-form__label" htmlFor="tpl-subject">Subject</label>
                  <input id="tpl-subject" className="input" value={draft.subject} disabled={locked}
                    onChange={(e) => set('subject', e.target.value)} />
                </>
              ) : null}
              {draft.channel === 'push' || draft.channel === 'in_app' ? (
                <>
                  <label className="ops-form__label" htmlFor="tpl-title">Title</label>
                  <input id="tpl-title" className="input" value={draft.title} disabled={locked}
                    onChange={(e) => set('title', e.target.value)} />
                </>
              ) : null}
              <label className="ops-form__label" htmlFor="tpl-body">Body (English)</label>
              <textarea id="tpl-body" className="input" rows={5} value={draft.body} disabled={locked}
                aria-describedby="tpl-body-help" onChange={(e) => set('body', e.target.value)} />
              <p id="tpl-body-help" className="help m-0">
                Write variables as <code>{'{name}'}</code>. Hindi and Telugu copy comes later and is reviewed by a native speaker.
              </p>

              <label className="ops-form__label" htmlFor="tpl-vars">Variables</label>
              <div className="nf-inline">
                <input id="tpl-vars" className="input" value={draft.variablesText} disabled={locked}
                  placeholder="name, city" onChange={(e) => set('variablesText', e.target.value)} />
                {!locked ? (
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={detect}>Detect from text</button>
                ) : null}
              </div>
              <label className="ops-form__label" htmlFor="tpl-personal">Variables that carry personal data</label>
              <input id="tpl-personal" className="input" value={draft.personalText} disabled={locked}
                placeholder="name" onChange={(e) => set('personalText', e.target.value)} />
              <p className="help m-0">A message built from a personal variable keeps only a fingerprint of its text once it is final.</p>
            </section>

            {copyProblems.length > 0 ? (
              <ul className="nf-problems" aria-label="Problems with the copy">
                {copyProblems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            ) : null}

            <section className="nf-preview" aria-label="Preview">
              <h3 className="ops-subhead">Preview with sample values</h3>
              {variables.length > 0 ? (
                <div className="nf-samples">
                  {variables.map((v) => (
                    <div key={v} className="nf-field">
                      <label className="ops-form__label" htmlFor={`sample-${v}`}>{v}</label>
                      <input id={`sample-${v}`} className="input" value={draft.samples[v] ?? ''} disabled={locked}
                        onChange={(e) => set('samples', { ...draft.samples, [v]: e.target.value })} />
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="nf-bubble" aria-live="polite">
                {draft.channel === 'email' ? <b className="nf-bubble__head">{shown.subject.text || 'No subject'}</b> : null}
                {draft.channel === 'push' || draft.channel === 'in_app' ? <b className="nf-bubble__head">{shown.title.text || 'No title'}</b> : null}
                <p className="nf-bubble__body">{shown.body.text || 'Nothing written yet.'}</p>
              </div>
              {seg ? (
                <p className="help m-0">
                  {seg.chars} characters · {seg.segments} message part{seg.segments === 1 ? '' : 's'}
                  {seg.unicode ? ' (uses characters outside the GSM set, so parts are shorter)' : ''}
                </p>
              ) : null}
              {missing.length > 0 ? (
                <p className="help m-0">No sample value yet for: {missing.join(', ')}.</p>
              ) : null}
              {server && server.problems.length > 0 && copyProblems.length === 0 ? (
                <ul className="nf-problems" aria-label="Problems the server found">
                  {server.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              ) : null}
            </section>

            {kind === 'india_sms' ? (
              <section className="ops-form" aria-label="India SMS registration">
                <h3 className="ops-subhead">India SMS registration (DLT)</h3>
                <p className="help m-0">
                  An India SMS cannot go live without the DLT template ID, the sender ID and the MSG91 flow ID, and its
                  body must map one placeholder to each <code>{'{#var#}'}</code> slot of the approved text.
                </p>
                <div className="nf-grid">
                  <div className="nf-field">
                    <label className="ops-form__label" htmlFor="reg-dlt">DLT template ID</label>
                    <input id="reg-dlt" className="input" value={draft.reg.dlt_template_id} disabled={locked}
                      onChange={(e) => setReg({ dlt_template_id: e.target.value })} />
                  </div>
                  <div className="nf-field">
                    <label className="ops-form__label" htmlFor="reg-sender">Sender ID</label>
                    <input id="reg-sender" className="input" value={draft.reg.sender_id} disabled={locked}
                      onChange={(e) => setReg({ sender_id: e.target.value })} />
                  </div>
                  <div className="nf-field">
                    <label className="ops-form__label" htmlFor="reg-flow">MSG91 flow ID</label>
                    <input id="reg-flow" className="input" value={draft.reg.provider_template_id} disabled={locked}
                      onChange={(e) => setReg({ provider_template_id: e.target.value })} />
                  </div>
                  <div className="nf-field">
                    <label className="ops-form__label" htmlFor="reg-entity">Entity ID (if not the account default)</label>
                    <input id="reg-entity" className="input" value={draft.reg.entity_id} disabled={locked}
                      onChange={(e) => setReg({ entity_id: e.target.value })} />
                  </div>
                </div>
                <label className="ops-form__label" htmlFor="reg-text">DLT-approved text</label>
                <textarea id="reg-text" className="input" rows={3} value={draft.reg.registered_text} disabled={locked}
                  onChange={(e) => setReg({ registered_text: e.target.value })} />
                {!locked ? (
                  <div>
                    <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
                      onClick={() => setReg({ registered_text: toDltText(draft.body) })}>
                      Fill from the body
                    </button>
                  </div>
                ) : null}
              </section>
            ) : null}

            {kind === 'whatsapp' ? (
              <section className="ops-form" aria-label="WhatsApp registration">
                <h3 className="ops-subhead">WhatsApp template</h3>
                <div className="nf-grid">
                  <div className="nf-field">
                    <label className="ops-form__label" htmlFor="reg-wa-name">Approved template name</label>
                    <input id="reg-wa-name" className="input" value={draft.reg.whatsapp_template_name} disabled={locked}
                      onChange={(e) => setReg({ whatsapp_template_name: e.target.value })} />
                  </div>
                  <div className="nf-field">
                    <label className="ops-form__label" htmlFor="reg-wa-ns">Namespace</label>
                    <input id="reg-wa-ns" className="input" value={draft.reg.whatsapp_namespace} disabled={locked}
                      onChange={(e) => setReg({ whatsapp_namespace: e.target.value })} />
                  </div>
                </div>
                <p className="help m-0">WhatsApp messages go only to people who have explicitly opted in.</p>
              </section>
            ) : null}

            {refusalBlock ? (
              <div className="nf-refusal" role="status" aria-label="Why this cannot be activated yet">
                <b>This template cannot be activated yet</b>
                {regProblems.map((p) => <span key={p.message}>{p.message}</span>)}
              </div>
            ) : null}

            {!locked || detail?.status === 'active' ? (
              <section className="ops-form" aria-label="Reason">
                <label className="ops-form__label" htmlFor="tpl-reason">Why (kept in the audit log)</label>
                <textarea id="tpl-reason" className="input" rows={2} value={draft.reason} disabled={!may}
                  onChange={(e) => set('reason', e.target.value)} />
              </section>
            ) : null}

            {refusal ? <div className="alert-error" role="alert">{refusal}</div> : null}

            {detail && detail.versions.length > 1 ? (
              <section aria-label="Versions">
                <h3 className="ops-subhead">Versions</h3>
                <ul className="nf-versions">
                  {detail.versions.map((v) => (
                    <li key={v.id}>
                      {v.id === detail.id ? (
                        <b>v{v.version} (this one)</b>
                      ) : (
                        <button type="button" className="ops-linkbtn" onClick={() => onOpen(v.id)}>v{v.version}</button>
                      )}{' '}
                      <Pill tone={templateTone(v.status)}>{TEMPLATE_STATUS_WORDS[v.status]}</Pill>{' '}
                      <span className="muted">{stamp(v.activated_at ?? v.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
    </Drawer>
  );
}
