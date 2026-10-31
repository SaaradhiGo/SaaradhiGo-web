'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { useDensity } from '@/lib/consolePrefs';
import { stamp } from '@/lib/consoleTime';
import {
  CHANNELS, CHANNEL_WORDS, MESSAGE_STATUS_WORDS, logQuery, messageTone, type Message, type MessageStatus,
} from '@/lib/notifications';
import {
  NoAccess, NotificationsNav, messageOf,
} from '@/components/console/notifications';
import {
  DataTable, Drawer, Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Notifications: the delivery log.
 *
 * "Did the rider get the message?" One row per recipient and channel, with the provider's
 * message id and the status the provider reported back (signature-verified webhooks). The
 * recipient is masked: a delivery log is not a way to read someone's phone number or email.
 * Rows are scoped by the recipient's city.
 */
type Payload = { count: number; limit: number; offset: number; results: Message[] };
const PAGE = 50;
const STATUSES: MessageStatus[] = ['queued', 'sending', 'sent', 'delivered', 'failed', 'suppressed'];
const PROVIDERS = ['stub', 'msg91', 'twilio', 'ses', 'fcm', 'in_app'];

type Filters = { status: string; channel: string; provider: string; template: string; userId: string };
const NONE: Filters = { status: '', channel: '', provider: '', template: '', userId: '' };

export default function DeliveryPage() {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const [filters, setFilters] = useState<Filters>(NONE);
  const [draft, setDraft] = useState<Filters>(NONE);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<Payload>(withScope(
        `/notifications/admin/messages/?limit=${PAGE}&offset=${offset}${logQuery(filters)}`)));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The delivery log could not be loaded.'));
    }
  }, [filters, offset]);
  useEffect(() => { void load(); }, [load]);

  const columns = useMemo(() => [
    { key: 'when', label: 'Queued', width: '9rem', sortValue: (m: Message) => m.created_at, render: (m: Message) => stamp(m.created_at) },
    { key: 'tpl', label: 'Template', sortValue: (m: Message) => m.template_key,
      render: (m: Message) => <><b>{m.template_key}</b> <span className="muted">v{m.template_version}</span></> },
    { key: 'ch', label: 'Channel', width: '7rem', sortValue: (m: Message) => m.channel, render: (m: Message) => CHANNEL_WORDS[m.channel] },
    { key: 'to', label: 'Recipient', width: '11rem', render: (m: Message) => <span className="nf-masked">{m.recipient || '—'}</span> },
    { key: 'prov', label: 'Provider', width: '7rem', hideBelow: 1100 as const, render: (m: Message) => m.provider || '—' },
    { key: 'status', label: 'Status', width: '10rem', sortValue: (m: Message) => m.status,
      render: (m: Message) => (
        <Pill tone={messageTone(m.status)}>{MESSAGE_STATUS_WORDS[m.status]}</Pill>
      ) },
    { key: 'why', label: 'Why', hideBelow: 1280 as const,
      render: (m: Message) => m.suppression_reason || m.last_error || <span className="muted">—</span> },
  ], []);

  if (!canOpen(access, 'notifications')) {
    return (<><PageHeader title="Notifications" /><NoAccess /></>);
  }

  const active = Object.values(filters).filter(Boolean).length;
  const apply = (next: Filters) => { setFilters(next); setOffset(0); };

  return (
    <>
      <PageHeader title="Notifications"
        subtitle="Every message the platform queued, to whom (masked), on which channel, and what the provider said happened." />
      <NotificationsNav />

      <Panel title="Delivery log" flush>
        <form className="nf-filterbar" onSubmit={(e) => { e.preventDefault(); apply(draft); }} aria-label="Filter the delivery log">
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="d-status">Status</label>
            <select id="d-status" className="ops-select" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value="">Any</option>
              {STATUSES.map((s) => <option key={s} value={s}>{MESSAGE_STATUS_WORDS[s]}</option>)}
            </select>
          </div>
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="d-channel">Channel</label>
            <select id="d-channel" className="ops-select" value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
              <option value="">Any</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_WORDS[c]}</option>)}
            </select>
          </div>
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="d-provider">Provider</label>
            <select id="d-provider" className="ops-select" value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })}>
              <option value="">Any</option>
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="d-template">Template key</label>
            <input id="d-template" className="input" value={draft.template} placeholder="payout.missing_details"
              onChange={(e) => setDraft({ ...draft, template: e.target.value })} />
          </div>
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="d-user">User id</label>
            <input id="d-user" className="input" inputMode="numeric" value={draft.userId}
              onChange={(e) => setDraft({ ...draft, userId: e.target.value.replace(/\D/g, '') })} />
          </div>
          <div className="nf-filterbar__go">
            <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm">Apply</button>
            {active > 0 ? (
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
                onClick={() => { setDraft(NONE); apply(NONE); }}>Clear</button>
            ) : null}
          </div>
        </form>

        <TableToolbar density={density} onDensity={setDensity}
          summary={data ? `${data.results.length ? offset + 1 : 0}–${offset + data.results.length} of ${data.count}` : null} />
        {error ? (
          <ErrorState title="The delivery log could not be loaded" detail={error} onRetry={() => void load()} />
        ) : data === null ? (
          <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
            <span className="sr-only">Loading the delivery log</span>
            <Skeleton kind="row" count={6} />
          </div>
        ) : data.results.length === 0 ? (
          <Empty title={active ? 'No messages match those filters' : 'Nothing has been queued yet'}
            detail={active ? 'Try widening them. The log only shows recipients in your scope.'
              : 'Messages appear here when the platform queues them, including ones that were suppressed and why.'} />
        ) : (
          <>
            <DataTable caption="Delivery log" rows={data.results} columns={columns} rowKey={(m) => m.id}
              density={density} onRow={(m) => setOpen(m.id)} selectedKey={open} maxHeight={false} />
            <div className="nf-pager">
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE))}>Newer</button>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
                disabled={offset + data.results.length >= data.count} onClick={() => setOffset(offset + PAGE)}>Older</button>
            </div>
          </>
        )}
      </Panel>

      {open !== null ? <MessageDrawer id={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function MessageDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const [m, setM] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setM(await api.get<Message>(`/notifications/admin/messages/${id}/`));
    } catch (err) {
      setError(messageOf(err, 'That message could not be loaded.'));
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Drawer open wide onClose={onClose} title={m ? `${m.template_key} · ${CHANNEL_WORDS[m.channel]}` : 'Message'}>
      {error ? <ErrorState title="That message could not be loaded" detail={error} onRetry={() => void load()} />
        : !m ? (
          <div className="ops-skel-rows" aria-busy="true"><span className="sr-only">Loading the message</span><Skeleton kind="row" count={4} /></div>
        ) : (
          <div className="grid gap-5">
            <Facts>
              <Fact label="Status"><Pill tone={messageTone(m.status)}>{MESSAGE_STATUS_WORDS[m.status]}</Pill></Fact>
              <Fact label="Recipient"><span className="nf-masked">{m.recipient || '—'}</span> <span className="muted">user {m.recipient_user_id}</span></Fact>
              <Fact label="Place">{m.city ? m.city.name : 'Unplaced'}</Fact>
              <Fact label="Provider">{m.provider || '—'}</Fact>
              <Fact label="Provider message id">{m.provider_message_id || '—'}</Fact>
              <Fact label="Template">{m.template_key} v{m.template_version} · {m.category}</Fact>
              <Fact label="Source">{m.source || '—'}</Fact>
              <Fact label="Attempts">{m.attempts}</Fact>
              {m.not_before ? <Fact label="Held until">{stamp(m.not_before)}</Fact> : null}
              {m.suppression_reason ? <Fact label="Suppressed because">{m.suppression_reason}</Fact> : null}
              {m.last_error ? <Fact label="Last error">{m.last_error}</Fact> : null}
            </Facts>

            <section aria-label="Status timeline">
              <h3 className="ops-subhead">Status timeline</h3>
              {m.timeline && m.timeline.length > 0 ? (
                <ol className="nf-timeline">
                  {m.timeline.map((e, i) => (
                    <li key={`${e.status}-${e.at}-${i}`}>
                      <Pill tone={messageTone(e.status)}>{MESSAGE_STATUS_WORDS[e.status]}</Pill>
                      <span className="nf-timeline__at">{stamp(e.at)}</span>
                      <span className="muted">{e.source === 'dispatcher' ? 'platform' : e.source.replace('webhook:', 'reported by ')}</span>
                      {e.detail ? <span className="nf-timeline__detail">{e.detail}</span> : null}
                    </li>
                  ))}
                </ol>
              ) : <p className="help m-0">No events recorded.</p>}
            </section>

            <section aria-label="What was sent">
              <h3 className="ops-subhead">What was sent</h3>
              {m.body ? (
                <div className="nf-bubble">
                  {m.subject || m.title ? <b className="nf-bubble__head">{m.subject || m.title}</b> : null}
                  <p className="nf-bubble__body">{m.body}</p>
                </div>
              ) : (
                <p className="help m-0">The text is not kept for messages built from personal data. Its fingerprint is {m.body_hash.slice(0, 12) || '—'}…</p>
              )}
            </section>
          </div>
        )}
    </Drawer>
  );
}
