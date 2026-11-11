'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess, withScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  CHANNELS, CHANNEL_WORDS, MESSAGE_STATUS_WORDS, logQuery, messageTone, type Message, type MessageStatus,
} from '@/lib/notifications';
import {
  NoAccess, NotificationsNav, messageOf,
} from '@/components/console/notifications';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { History, RecordPanel } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { chipToneOf, viewsOf } from '@/components/console/listKit';
import { Drawer, Fact, Facts, PageHeader } from '@/components/console/ui';

/**
 * Messages: the delivery log, paged on the server.
 *
 * "Did the rider get the message?" One row per recipient and channel, with the provider's
 * message id and the status the provider reported back (signature-verified webhooks). The
 * recipient is masked: a delivery log is not a way to read someone's phone number or email.
 * Rows are scoped by the recipient's city, and times are in that city's zone.
 */
type Payload = { count: number; limit: number; offset: number; results: Message[] };
const PAGE = 50;
const STATUSES: MessageStatus[] = ['failed', 'suppressed', 'queued', 'sending', 'sent', 'delivered'];
const PROVIDERS = ['stub', 'msg91', 'twilio', 'ses', 'fcm', 'in_app'];

type Filters = { status: string; channel: string; provider: string; template: string; userId: string };
const NONE: Filters = { status: '', channel: '', provider: '', template: '', userId: '' };

const zoneOf = (m: Pick<Message, 'city' | 'country'>) => timeZoneFor(m.city?.code) ?? timeZoneFor(m.country);

function MessageChip({ status }: { status: MessageStatus }) {
  return <StatusChip tone={chipToneOf(messageTone(status))}>{MESSAGE_STATUS_WORDS[status]}</StatusChip>;
}

export default function DeliveryPage() {
  const access = useAdminAccess();
  const [filters, setFilters] = useState<Filters>(NONE);
  const [draft, setDraft] = useState<Filters>(NONE);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await api.get<Payload>(withScope(
        `/notifications/admin/messages/?limit=${PAGE}&offset=${(page - 1) * PAGE}${logQuery(filters)}`)));
    } catch (err) {
      setError(messageOf(err, 'The delivery log could not be loaded.'));
    }
  }, [filters, page]);
  useEffect(() => { void load(); }, [load]);

  if (!canOpen(access, 'notifications')) {
    return (<><PageHeader title="Messages" /><NoAccess /></>);
  }

  const apply = (next: Filters) => { setFilters(next); setDraft(next); setPage(1); };
  const columns: ListColumn<Message>[] = [
    { key: 'when', label: 'Queued', render: (m) => stamp(m.created_at, zoneOf(m)) },
    { key: 'tpl', label: 'Template', primary: true, render: (m) => <>{m.template_key} <span className="muted">v{m.template_version}</span></> },
    { key: 'ch', label: 'Channel', render: (m) => CHANNEL_WORDS[m.channel] },
    { key: 'to', label: 'Recipient', render: (m) => <span className="nf-masked">{m.recipient || '—'}</span> },
    { key: 'place', label: 'Place', render: (m) => (m.city ? m.city.name : 'Unplaced') },
    { key: 'prov', label: 'Provider', render: (m) => m.provider || '—' },
    { key: 'status', label: 'Status', render: (m) => <MessageChip status={m.status} /> },
    { key: 'why', label: 'Why', render: (m) => m.suppression_reason || m.last_error || <span className="muted">—</span> },
  ];
  const drop = (k: keyof Filters) => () => apply({ ...filters, [k]: '' });
  const chips = [
    ...(filters.channel ? [{ key: 'channel', label: `Channel: ${CHANNEL_WORDS[filters.channel as keyof typeof CHANNEL_WORDS] ?? filters.channel}`, onRemove: drop('channel') }] : []),
    ...(filters.provider ? [{ key: 'provider', label: `Provider: ${filters.provider}`, onRemove: drop('provider') }] : []),
    ...(filters.template ? [{ key: 'template', label: `Template: ${filters.template}`, onRemove: drop('template') }] : []),
    ...(filters.userId ? [{ key: 'user', label: `User ${filters.userId}`, onRemove: drop('userId') }] : []),
  ];
  const saved = new URLSearchParams(logQuery(filters).slice(1));
  const active = Object.values(filters).filter(Boolean).length;

  return (
    <>
      <NotificationsNav />
      <div className={open !== null ? 'ops-split' : undefined}>
        <ListPage<Message>
          pageKey="messages-delivery"
          title="Delivery log"
          summary="Every message the platform queued, to whom (masked), on which channel, and what the provider said happened."
          views={viewsOf(STATUSES, (s) => MESSAGE_STATUS_WORDS[s], filters.status, data?.count)}
          view={filters.status}
          onView={(v) => apply({ ...filters, status: v })}
          chips={chips}
          filterSlot={(
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => { setDraft(filters); setMore(true); }}>Filters</button>
          )}
          columns={columns}
          rows={data?.results ?? []}
          rowKey={(m) => m.id}
          total={data ? data.count : null}
          page={page}
          pageSize={PAGE}
          onPage={setPage}
          onRow={(m) => setOpen(m.id)}
          activeKey={open}
          loading={data === null && !error}
          error={error}
          empty={active ? 'No messages match those filters. The log only shows recipients in your scope.'
            : 'Nothing has been queued yet. Messages appear here when the platform queues them, including ones that were suppressed and why.'}
          currentQuery={saved.toString() || undefined}
          onSavedView={(query) => {
            const p = new URLSearchParams(query);
            apply({
              status: p.get('status') ?? '', channel: p.get('channel') ?? '', provider: p.get('provider') ?? '',
              template: p.get('template') ?? '', userId: p.get('user_id') ?? '',
            });
          }}
        />
        {open !== null ? <MessageRecord id={open} onClose={() => setOpen(null)} /> : null}
      </div>

      <Drawer open={more} title="Filter the delivery log" onClose={() => setMore(false)}
        footer={(
          <>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => setDraft({ ...NONE, status: draft.status })}>Clear</button>
            <button type="button" className="sg-btn sg-btn--primary sg-btn--sm"
              onClick={() => { apply(draft); setMore(false); }}>Show messages</button>
          </>
        )}>
        <div className="ops-form">
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="d-channel">Channel</label>
            <select id="d-channel" className="ops-select" value={draft.channel} onChange={(e) => setDraft({ ...draft, channel: e.target.value })}>
              <option value="">Any</option>
              {CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_WORDS[c]}</option>)}
            </select>
          </div>
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="d-provider">Provider</label>
            <select id="d-provider" className="ops-select" value={draft.provider} onChange={(e) => setDraft({ ...draft, provider: e.target.value })}>
              <option value="">Any</option>
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="d-template">Template key</label>
            <input id="d-template" className="input" value={draft.template} placeholder="payout.missing_details"
              onChange={(e) => setDraft({ ...draft, template: e.target.value })} />
          </div>
          <div className="ops-form__row">
            <label className="ops-form__label" htmlFor="d-user">User id</label>
            <input id="d-user" className="input" inputMode="numeric" value={draft.userId}
              onChange={(e) => setDraft({ ...draft, userId: e.target.value.replace(/\D/g, '') })} />
          </div>
        </div>
      </Drawer>
    </>
  );
}

function MessageRecord({ id, onClose }: { id: number; onClose: () => void }) {
  const [m, setM] = useState<Message | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setM(await api.get<Message>(`/notifications/admin/messages/${id}/`));
    } catch (err) {
      setM(null);
      setError(messageOf(err, 'That message could not be loaded.'));
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (!m || m.id !== id) {
    return (
      <RecordPanel label="Message" title="Message" refId={`#${id}`} onClose={onClose}
        tabs={[{ key: 'sent', label: 'Message', content: error ? (
          <div>
            <p className="alert-error" role="alert">{error}</p>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void load()}>Try again</button>
          </div>
        ) : <p className="ops-record__empty" aria-busy="true">Loading the message…</p> }]} />
    );
  }
  const tz = zoneOf(m);
  return (
    <RecordPanel
      label="Message"
      title={m.template_key}
      refId={`#${m.id}`}
      subtitle={<>{CHANNEL_WORDS[m.channel]} · {m.city ? m.city.name : 'Unplaced'} · {stamp(m.created_at, tz)}</>}
      status={<MessageChip status={m.status} />}
      onClose={onClose}
      tabs={[
        {
          key: 'sent', label: 'Message', content: (
            <div className="grid gap-4">
              <Facts>
                <Fact label="Recipient"><span className="nf-masked">{m.recipient || '—'}</span> <span className="muted">user {m.recipient_user_id}</span></Fact>
                <Fact label="Provider">{m.provider || '—'}</Fact>
                <Fact label="Provider message id">{m.provider_message_id || '—'}</Fact>
                <Fact label="Template">{m.template_key} v{m.template_version} · {m.category}</Fact>
                <Fact label="Source">{m.source || '—'}</Fact>
                <Fact label="Attempts">{m.attempts}</Fact>
                {m.not_before ? <Fact label="Held until">{stamp(m.not_before, tz)}</Fact> : null}
                {m.suppression_reason ? <Fact label="Suppressed because">{m.suppression_reason}</Fact> : null}
                {m.last_error ? <Fact label="Last error">{m.last_error}</Fact> : null}
              </Facts>
              <section className="ops-record__section" aria-label="What was sent">
                <h3>What was sent</h3>
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
          ),
        },
        {
          key: 'history', label: 'History', content: (
            <History
              empty="No events recorded."
              entries={[...(m.timeline ?? [])].reverse().map((e) => ({
                at: stamp(e.at, tz),
                text: <>{MESSAGE_STATUS_WORDS[e.status]}{e.detail ? `: ${e.detail}` : ''}</>,
                who: e.source === 'dispatcher' ? 'platform' : e.source.replace('webhook:', 'reported by '),
              }))}
            />
          ),
        },
      ]}
    />
  );
}
