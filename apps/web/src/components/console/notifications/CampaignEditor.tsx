'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import {
  CAMPAIGN_STATUS_WORDS, CHANNEL_WORDS, campaignTone, canDraftCampaigns, funnelLines, renderPreview,
  type Campaign, type CampaignDetail, type City, type Funnel, type Template,
} from '@/lib/notifications';
import { interpretWrite } from '@/lib/trips';
import { Drawer, ErrorState, Fact, Facts, Pill, Skeleton } from '@/components/console/ui';
import { messageOf, type Notice } from '@/components/console/notifications';

/**
 * The campaign builder: a promotional template, an audience (role, cities, filters), when to
 * send, and the audience COUNT before anyone is asked to approve it.
 *
 * Sending is a bulk action: it needs a second admin, always, in India and the US. The count
 * shows the whole funnel (who is left out because they never opted in, who cannot be reached
 * on this channel, who is held by quiet hours) so the checker approves a number, not a hope.
 * Cancel is allowed until sending starts.
 */
type Form = {
  name: string; templateId: number | null; role: 'drivers' | 'riders'; cities: string[]; status: string[];
  lastActiveDays: string; values: Record<string, string>; scheduledAt: string; reason: string;
};

const DRIVER_STATUSES = ['online', 'offline', 'busy'] as const;

const blank = (): Form => ({
  name: '', templateId: null, role: 'drivers', cities: [], status: [], lastActiveDays: '', values: {},
  scheduledAt: '', reason: '',
});

const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function CampaignEditor({ campaignId, onClose, onDone, onOpen }: {
  campaignId: number | null;
  onClose: () => void;
  onDone: (n: Notice) => void;
  onOpen: (id: number) => void;
}) {
  const access = useAdminAccess();
  const may = canDraftCampaigns(access);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [cities, setCities] = useState<City[] | null>(null);
  const [funnel, setFunnel] = useState<Funnel | 'loading' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (campaignId === null) return;
    setLoadError(null);
    try {
      const d = await api.get<CampaignDetail>(`/notifications/admin/campaigns/${campaignId}/`);
      setDetail(d);
      setForm({
        name: d.name, templateId: d.template.id, role: d.audience.role, cities: d.audience.cities,
        status: d.audience.status, lastActiveDays: d.audience.last_active_days ? String(d.audience.last_active_days) : '',
        values: d.template_values, scheduledAt: toLocalInput(d.scheduled_at), reason: d.reason,
      });
      setFunnel(d.funnel);
    } catch (err) {
      setLoadError(messageOf(err, 'That campaign could not be loaded.'));
    }
  }, [campaignId]);
  useEffect(() => { void load(); }, [load]);

  const editable = campaignId === null || detail?.status === 'draft';
  const locked = !may || !editable;

  // What a draft may pick from: active promotional templates, and the cities it may target.
  useEffect(() => {
    if (locked) return;
    api.get<{ results: Template[] }>('/notifications/admin/templates/?category=promotional&status=active&limit=100')
      .then((r) => setTemplates(r.results)).catch(() => setTemplates([]));
    api.get<{ cities: City[] }>('/notifications/admin/cities/')
      .then((r) => setCities(r.cities)).catch(() => setCities([]));
  }, [locked]);

  const template = templates?.find((t) => t.id === form.templateId) ?? null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setForm((f) => ({ ...f, [k]: v })); setFunnel(null); };
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const body = () => ({
    name: form.name.trim(), template_id: form.templateId,
    audience: {
      role: form.role, cities: form.cities, status: form.role === 'drivers' ? form.status : [],
      last_active_days: form.lastActiveDays ? Number(form.lastActiveDays) : null,
    },
    template_values: form.values,
    scheduled_at: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
    reason: form.reason.trim(),
  });

  async function count() {
    if (form.templateId === null || form.cities.length === 0) {
      setProblem('Pick a template and at least one city first.');
      return;
    }
    setFunnel('loading'); setProblem(null);
    try {
      const r = await api.post<{ funnel: Funnel }>('/notifications/admin/campaigns/audience-preview/', {
        template_id: form.templateId, audience: body().audience,
      });
      setFunnel(r.funnel);
    } catch (err) {
      setFunnel(null);
      setProblem(messageOf(err, 'The audience could not be counted.'));
    }
  }

  async function save(): Promise<number | null> {
    setBusy(true); setProblem(null);
    try {
      if (campaignId === null) {
        const created = await api.post<Campaign>('/notifications/admin/campaigns/', body());
        return created.id;
      }
      await api.patch(`/notifications/admin/campaigns/${campaignId}/`, body());
      return campaignId;
    } catch (err) {
      setProblem(messageOf(err, 'That did not save. Nothing was changed.'));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    const id = await save();
    if (id === null) return;
    if (campaignId === null) onOpen(id); else { await load(); onDone({ text: 'The draft was saved.', kind: 'done' }); }
  }

  async function submit() {
    if (form.reason.trim().length < 5) { setProblem('Say why, in a few words.'); return; }
    const id = await save();
    if (id === null) return;
    setBusy(true); setProblem(null);
    try {
      const out = await api.post<{ approval_request?: { id: number; status?: string } | null; state?: string }>(
        `/notifications/admin/campaigns/${id}/submit/`, { reason: form.reason.trim() });
      const result = interpretWrite(out as never, 'The campaign was sent.');
      onDone({ text: result.message, kind: result.kind === 'pending' ? 'pending' : 'done' });
    } catch (err) {
      setProblem(messageOf(err, 'That did not go through. Nothing was sent.'));
      if (campaignId === null) onOpen(id);
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (campaignId === null) return;
    setBusy(true); setProblem(null);
    try {
      await api.post(`/notifications/admin/campaigns/${campaignId}/cancel/`, { reason: form.reason.trim() || 'Cancelled' });
      onDone({ text: 'The campaign was cancelled. Nothing will be sent.', kind: 'done' });
    } catch (err) {
      setProblem(messageOf(err, 'That could not be cancelled.'));
    } finally {
      setBusy(false);
    }
  }

  const cancellable = detail && ['draft', 'pending_approval', 'scheduled'].includes(detail.status) && may;
  const preview = template ? renderPreview(template.body, form.values) : null;
  const title = campaignId === null ? 'New campaign' : detail ? detail.name : 'Campaign';

  return (
    <Drawer open wide onClose={onClose} title={title}
      footer={!locked ? (
        <>
          {cancellable ? <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" disabled={busy} onClick={() => void cancel()}>Cancel campaign</button> : null}
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => void saveDraft()}>Save draft</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void submit()}>Submit for approval</button>
        </>
      ) : cancellable ? (
        <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => void cancel()}>Cancel campaign</button>
      ) : undefined}>
      {loadError ? <ErrorState title="That campaign could not be loaded" detail={loadError} onRetry={() => void load()} />
        : campaignId !== null && !detail ? (
          <div className="ops-skel-rows" aria-busy="true"><span className="sr-only">Loading the campaign</span><Skeleton kind="row" count={4} /></div>
        ) : (
          <div className="nf-editor">
            {detail ? (
              <Facts>
                <Fact label="Status"><Pill tone={campaignTone(detail.status)}>{CAMPAIGN_STATUS_WORDS[detail.status]}</Pill></Fact>
                <Fact label="Template">{detail.template.key} v{detail.template.version} · {CHANNEL_WORDS[detail.template.channel]}</Fact>
                <Fact label="Asked by">{detail.created_by.label || '—'}</Fact>
                <Fact label="Scheduled">{detail.scheduled_at ? stamp(detail.scheduled_at) : 'as soon as approved'}</Fact>
                {detail.approval_request_id ? <Fact label="Approval request">#{detail.approval_request_id}</Fact> : null}
                {detail.finished_at ? <Fact label="Finished">{stamp(detail.finished_at)}</Fact> : null}
              </Facts>
            ) : null}
            {detail?.status === 'pending_approval' ? (
              <div className="ops-confirm" role="status">
                <b>Waiting for a second admin</b>
                <span>Nothing is sent until a different admin approves request #{detail.approval_request_id}. You can still cancel it.</span>
              </div>
            ) : null}

            <section className="ops-form" aria-label="Campaign details">
              <label className="ops-form__label" htmlFor="cmp-name">Name</label>
              <input id="cmp-name" className="input" value={form.name} disabled={locked} onChange={(e) => set('name', e.target.value)} />

              <label className="ops-form__label" htmlFor="cmp-template">Promotional template</label>
              {locked ? (
                <p className="m-0">{detail ? `${detail.template.key} v${detail.template.version}` : '—'}</p>
              ) : templates === null ? <Skeleton kind="row" /> : templates.length === 0 ? (
                <p className="help m-0">No active promotional template exists in your scope. Write one under Templates and have it approved first.</p>
              ) : (
                <select id="cmp-template" className="ops-select" value={form.templateId ?? ''}
                  onChange={(e) => set('templateId', e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Choose a template</option>
                  {templates.map((t) => <option key={t.id} value={t.id}>{t.key} · {CHANNEL_WORDS[t.channel]} · {t.country}</option>)}
                </select>
              )}
              {template && template.variables.length > 0 ? (
                <div className="nf-samples">
                  {template.variables.map((v) => (
                    <div key={v} className="nf-field">
                      <label className="ops-form__label" htmlFor={`cmp-v-${v}`}>{v}</label>
                      <input id={`cmp-v-${v}`} className="input" value={form.values[v] ?? ''} disabled={locked}
                        onChange={(e) => set('values', { ...form.values, [v]: e.target.value })} />
                    </div>
                  ))}
                </div>
              ) : null}
              {preview ? (
                <div className="nf-bubble" aria-label="What it will say">
                  {template?.title ? <b className="nf-bubble__head">{renderPreview(template.title, form.values).text}</b> : null}
                  <p className="nf-bubble__body">{preview.text}</p>
                </div>
              ) : null}
            </section>

            <section className="ops-form" aria-label="Audience">
              <h3 className="ops-subhead">Audience</h3>
              <div className="nf-grid">
                <div className="nf-field">
                  <label className="ops-form__label" htmlFor="cmp-role">Who</label>
                  <select id="cmp-role" className="ops-select" value={form.role} disabled={locked}
                    onChange={(e) => set('role', e.target.value as 'drivers' | 'riders')}>
                    <option value="drivers">Drivers</option>
                    <option value="riders">Riders</option>
                  </select>
                </div>
                <div className="nf-field">
                  <label className="ops-form__label" htmlFor="cmp-active">Active in the last (days)</label>
                  <input id="cmp-active" className="input" inputMode="numeric" value={form.lastActiveDays} disabled={locked}
                    placeholder="any time" onChange={(e) => set('lastActiveDays', e.target.value.replace(/\D/g, ''))} />
                </div>
              </div>
              <fieldset className="nf-checks" disabled={locked}>
                <legend>Cities</legend>
                {locked ? (
                  <p className="m-0">{form.cities.join(', ') || '—'}</p>
                ) : cities === null ? <Skeleton kind="row" /> : cities.length === 0 ? (
                  <p className="help m-0">No city in your scope can be targeted.</p>
                ) : cities.map((c) => (
                  <label key={c.code} className="lo-check">
                    <input type="checkbox" checked={form.cities.includes(c.code)}
                      onChange={() => set('cities', toggle(form.cities, c.code))} />
                    {c.name}
                  </label>
                ))}
              </fieldset>
              {form.role === 'drivers' ? (
                <fieldset className="nf-checks" disabled={locked}>
                  <legend>Driver status</legend>
                  {DRIVER_STATUSES.map((s) => (
                    <label key={s} className="lo-check">
                      <input type="checkbox" checked={form.status.includes(s)}
                        onChange={() => set('status', toggle(form.status, s))} />
                      {s}
                    </label>
                  ))}
                </fieldset>
              ) : null}

              <div className="nf-funnel" aria-live="polite">
                {funnel === 'loading' ? <Skeleton kind="row" count={2} /> : funnel ? (
                  <ul aria-label="Audience count">
                    {funnelLines(funnel).map((line, i, all) => (
                      <li key={line} className={i === all.length - 1 || line.endsWith('will receive it') ? 'nf-funnel__key' : undefined}>{line}</li>
                    ))}
                  </ul>
                ) : <p className="help m-0">Count the audience before you submit: it excludes anyone who has not opted in.</p>}
                {!locked ? (
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => void count()} disabled={funnel === 'loading'}>
                    Count the audience
                  </button>
                ) : null}
              </div>
            </section>

            {!locked ? (
              <section className="ops-form" aria-label="Schedule and reason">
                <label className="ops-form__label" htmlFor="cmp-when">Send at (blank: as soon as approved)</label>
                <input id="cmp-when" className="input" type="datetime-local" value={form.scheduledAt}
                  onChange={(e) => set('scheduledAt', e.target.value)} />
                <p className="help m-0">Promotional messages are never sent in quiet hours; anyone it would reach then is held until the window ends, in their own time.</p>
                <label className="ops-form__label" htmlFor="cmp-why">Why (kept in the audit log)</label>
                <textarea id="cmp-why" className="input" rows={2} value={form.reason} onChange={(e) => set('reason', e.target.value)} />
              </section>
            ) : detail && Object.keys(detail.message_counts).length > 0 ? (
              <section aria-label="Result">
                <h3 className="ops-subhead">Result</h3>
                <Facts>
                  {Object.entries(detail.message_counts).map(([k, v]) => <Fact key={k} label={k}>{v}</Fact>)}
                </Facts>
              </section>
            ) : null}

            {problem ? <div className="alert-error" role="alert">{problem}</div> : null}
          </div>
        )}
    </Drawer>
  );
}
