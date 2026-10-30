'use client';

import { PageButtonLink, PageLink } from '@/components/console/PageLink';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  ISSUE_LABEL, PRIORITIES, PRIORITY_LABEL, STATUS_LABEL, type MacroSummary, type Sla,
  type SupportActionKey, type SupportActions, composerModes, filterMacros, messageKind,
  priorityTone, slaSentence, visibleSupportActions,
} from '@/lib/supportDesk';
import { formatMinor, newIdempotencyKey, words } from '@/lib/trips';
import { ButtonLink } from '@/components/sg/Button';
import { Revealable } from '@/components/console/Revealable';
import { SlaChip } from '@/components/console/SlaChip';
import { ActionDrawer } from '@/components/console/TripActionDrawer';
import { CreditWalletDrawer } from '@/components/console/FinanceActionDrawers';
import { canCreditWallet } from '@/lib/financeActions';
import {
  Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * One ticket: the conversation, the composer, and everything around it.
 *
 * The thread reads like a conversation: theirs on the left, ours on the
 * right in the gold wash, the system's in the middle. An INTERNAL NOTE is
 * dashed, carries the word "Internal" and a lock, so it is never mistaken
 * for something the rider will read; colour alone does not say it.
 *
 * Every control comes from the server's per-ticket `allowed_actions`, so an
 * operator who may read but not reply sees a thread and no composer. Contact
 * details are masked by the server, in the requester block AND inside the
 * message text; `Revealable` is the logged way to them.
 *
 * "Review fare" opens the trip refund dialog with this ticket attached. It
 * is the SAME refund the Trips page makes (same limits, same second-approver
 * rule): over the limit it is sent for approval, and the ticket shows it as
 * pending until a checker decides. Nothing here changes a fare.
 */
type Message = {
  id: number; author_role: string; author_name: string | null; internal: boolean;
  body: string; created_at: string; created_by?: { label?: string } | null;
};

type FareBreakdown = {
  base_minor: number; distance_minor: number; time_minor: number; surge_multiplier: string;
  gross_minor: number; promo_discount_minor: number; promo_code: string | null;
  total_minor: number; rider_payable_minor: number; currency: string;
} | null;

type Trip = {
  id: number; status: string | null; requested_at: string | null; completed_at: string | null;
  pickup_address: string | null; destination_address: string | null; payment_method: string | null;
  currency: string; city: { code: string; name: string } | null;
  fare: {
    currency: string; estimated_minor: number | null; final_minor: number | null;
    charged_minor: number | null; cancellation_fee_minor: number | null;
    tax_minor: number | null; breakdown: FareBreakdown;
  } | null;
  payment: {
    method: string | null; status: string | null; paid_minor: number; refunded_minor: number;
    refundable_minor: number;
  } | null;
};

type Refund = {
  may_refund: boolean; refundable_minor: number; currency: string;
  action_key: 'support.refund' | 'finance.refund' | null;
  policy: { limit_kind: string; maker_limit: number | null; currency: string; always_checker: boolean } | null;
  requests: Array<{ id: number; status: string; amount_minor: number; currency: string; requested_at: string | null; money_action_status: string | null }>;
};

type AuditRow = {
  id: number; action: string; created_at: string | null; reason: string;
  created_by?: { label?: string } | null;
};

type Ticket = {
  id: number; status: string; priority: string; issue_type: string; issue_label?: string;
  description: string | null; trip_id: number | null; assigned_to: number | null;
  assignee: { id: number; label: string } | null;
  requester: {
    id: number; role: string; full_name: string | null; phone_number: string | null;
    email: string | null; page: { type: 'rider' | 'driver'; id: number } | null;
  };
  city: { code: string; name: string; country?: string } | null;
  country: string | null;
  created_at: string; updated_at: string; resolved_at: string | null;
  first_responded_at: string | null;
  /** Set while a refund request this ticket asked for has come back to its agent. */
  returned_at?: string | null;
  returned_reason?: string | null;
  sla: Sla;
  messages: Message[];
  trip: Trip | null;
  refund: Refund | null;
  audit_trail: AuditRow[];
  allowed_actions: SupportActions;
};

type Assignee = { id: number; label: string; me: boolean; assigned: boolean };

const STATUS_TONE: Record<string, 'good' | 'bad' | 'wait' | 'neutral'> = {
  OPEN: 'bad', IN_PROGRESS: 'wait', WAITING_USER: 'neutral', CLOSED: 'good',
};

function failure(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.fromServer ? err.message : fallback;
}

const Lock = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);

export default function SupportTicketPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const access = useAdminAccess();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ text: string; kind: 'pending' | 'done' } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [refundOpen, setRefundOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<Ticket>(`/support/admin/tickets/${id}/`);
      setTicket(data);
      setError(null);
    } catch (err) {
      setError(failure(err, 'We could not load this ticket.'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const mayAssign = Boolean(ticket?.allowed_actions?.assign);
  useEffect(() => {
    if (!mayAssign) return;
    api.get<{ results: Assignee[] }>(`/support/admin/tickets/${id}/assignees/`)
      .then((r) => setAssignees(r.results ?? []))
      .catch(() => setAssignees([]));
  }, [id, mayAssign]);

  if (loading && !ticket) {
    return (
      <div aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the ticket</span>
        <PageHeader title={`Ticket #${id}`} />
        <div className="ops-review"><Skeleton kind="block" /><Skeleton kind="block" /></div>
      </div>
    );
  }
  if (error || !ticket) {
    return (
      <>
        <PageHeader title={`Ticket #${id}`} actions={<ButtonLink href="/support" variant="ghost" size="sm">All tickets</ButtonLink>} />
        <ErrorState title="This ticket could not be loaded" detail={error ?? undefined} onRetry={() => void load()} />
      </>
    );
  }

  return (
    <TicketView
      ticket={ticket}
      access={access}
      assignees={assignees}
      notice={notice}
      actionError={actionError}
      refundOpen={refundOpen}
      setRefundOpen={setRefundOpen}
      setNotice={setNotice}
      setActionError={setActionError}
      reload={load}
    />
  );
}

function TicketView({
  ticket, access, assignees, notice, actionError, refundOpen, setRefundOpen, setNotice, setActionError, reload,
}: {
  ticket: Ticket;
  access: ReturnType<typeof useAdminAccess>;
  assignees: Assignee[];
  notice: { text: string; kind: 'pending' | 'done' } | null;
  actionError: string | null;
  refundOpen: boolean;
  setRefundOpen: (open: boolean) => void;
  setNotice: (n: { text: string; kind: 'pending' | 'done' } | null) => void;
  setActionError: (e: string | null) => void;
  reload: () => Promise<void>;
}) {
  const [creditOpen, setCreditOpen] = useState(false);
  const tz = timeZoneFor(ticket.city?.code);
  const actions = ticket.allowed_actions;
  const visible = visibleSupportActions(actions, access);
  const has = (k: SupportActionKey) => visible.includes(k);
  const target = { type: 'support_ticket', id: ticket.id } as const;
  const name = ticket.requester.full_name?.trim() || `${ticket.requester.role === 'driver' ? 'Driver' : 'Rider'} #${ticket.requester.id}`;
  const pageHref = ticket.requester.page
    ? (ticket.requester.page.type === 'driver' ? `/drivers/${ticket.requester.page.id}` : `/riders/${ticket.requester.page.id}`)
    : null;

  const done = (text: string, kind: 'pending' | 'done' = 'done') => { setNotice({ text, kind }); setActionError(null); void reload(); };

  return (
    <>
      <PageHeader
        title={`Ticket #${ticket.id}`}
        subtitle={
          <>
            {ticket.issue_label ?? ISSUE_LABEL[ticket.issue_type] ?? words(ticket.issue_type)}
            {' · raised by '}{name}
            {' · opened '}{stamp(ticket.created_at, tz)}
            {ticket.city ? ` · ${ticket.city.name}` : ''}
          </>
        }
        actions={
          <>
            <Pill tone={priorityTone(ticket.priority)}>{PRIORITY_LABEL[ticket.priority] ?? ticket.priority}</Pill>
            <SlaChip sla={ticket.sla} />
            <Pill tone={STATUS_TONE[ticket.status] ?? 'neutral'}>{STATUS_LABEL[ticket.status] ?? ticket.status}</Pill>
            <ButtonLink href="/support" variant="ghost" size="sm">All tickets</ButtonLink>
          </>
        }
      />

      {notice && (
        <div className={notice.kind === 'pending' ? 'ops-confirm mb-5' : 'alert-success mb-5'} role="status">
          <b>{notice.text}</b>
        </div>
      )}
      {actionError && <div className="alert-error mb-5" role="alert">{actionError}</div>}
      {ticket.returned_at ? (
        <div className="ops-confirm mb-5" role="status">
          <b>Returned to you</b>
          <span>
            The refund you asked for on this ticket was turned down
            {ticket.returned_reason ? `: ${ticket.returned_reason}` : '.'}{' '}
            Nothing was sent to the {ticket.requester.role === 'driver' ? 'driver' : 'rider'}. Reply or add a note to pick it up again.
          </span>
        </div>
      ) : null}

      <div className="ops-review">
        <div className="grid gap-5">
          <Panel
            title={`Conversation · ${ticket.messages.length} message${ticket.messages.length === 1 ? '' : 's'}`}
            action={
              <Revealable
                value={<span className="muted">Contact details in the text are masked</span>}
                label="full conversation" target={target} field="thread"
                render={(v) => <FullThread value={v} />}
              />
            }
          >
            <Thread ticket={ticket} tz={tz} name={name} />
          </Panel>

          {composerModes(visible).length > 0 ? (
            <Composer ticket={ticket} modes={composerModes(visible)} onDone={done} onError={setActionError} />
          ) : (
            <Panel title="Reply">
              <p className="help m-0">You can read this ticket but not reply to it.</p>
            </Panel>
          )}

          <Panel title="Audit trail" flush>
            {ticket.audit_trail.length === 0 ? (
              <Empty title="No operator has acted on this ticket" />
            ) : (
              <ol className="ops-audit" aria-label="Audit trail">
                {ticket.audit_trail.map((a) => (
                  <li key={a.id}>
                    <time dateTime={a.created_at ?? undefined}>{stamp(a.created_at, tz)}</time>
                    <b>{words(a.action.replace(/^support_ticket_/, ''))}</b>
                    <span>{a.created_by?.label || '—'}{a.reason ? ` · ${a.reason}` : ''}</span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>

        <div className="grid gap-5">
          <Panel title="Requester">
            <Facts>
              <Fact label="Name">
                <Revealable value={ticket.requester.full_name ?? '—'} label="requester name" target={target} field="requester_name" />
              </Fact>
              <Fact label="Phone">
                <Revealable value={ticket.requester.phone_number ?? '—'} label="requester phone" target={target} field="requester_phone" />
              </Fact>
              <Fact label="Email">
                <Revealable value={ticket.requester.email || <span className="muted">None on file</span>} label="requester email" target={target} field="requester_email" />
              </Fact>
              <Fact label="Is a">{ticket.requester.role}</Fact>
              <Fact label="Page">
                {pageHref
                  ? (
                    <PageLink page={ticket.requester.page?.type === 'driver' ? 'drivers' : 'riders'} href={pageHref}>
                      Open the {ticket.requester.page?.type} page
                    </PageLink>
                  ) : <span className="muted">None</span>}
              </Fact>
            </Facts>
          </Panel>

          <TicketPanel ticket={ticket} tz={tz} has={has} assignees={assignees} onDone={done} onError={setActionError} />

          {canCreditWallet(access) && ticket.requester.page?.type === 'rider' ? (
            <Panel title="Wallet credit">
              <p className="help m-0">
                Add closed-loop credit to this rider&apos;s wallet. It needs a second admin to approve it; this
                ticket gets an internal note now and the rider is told only once the credit is added.
              </p>
              <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm mt-3"
                onClick={() => setCreditOpen(true)}>Credit wallet…</button>
            </Panel>
          ) : null}

          {ticket.trip ? (
            <TripPanel
              trip={ticket.trip} refund={ticket.refund} tz={tz}
              onReview={has('refund') ? () => setRefundOpen(true) : undefined}
            />
          ) : (
            <Panel title="Trip"><p className="help m-0">No trip attached to this ticket.</p></Panel>
          )}
        </div>
      </div>

      {creditOpen && ticket.requester.page?.type === 'rider' ? (
        <CreditWalletDrawer
          riderId={ticket.requester.page.id} riderName={name} ticketId={ticket.id}
          onClose={() => setCreditOpen(false)}
          onDone={(text, kind) => done(text, kind)}
        />
      ) : null}

      {refundOpen && ticket.trip && ticket.refund ? (
        <ActionDrawer
          action="refund" tripId={ticket.trip.id} ticketId={ticket.id}
          currency={ticket.refund.currency} refundable={ticket.refund.refundable_minor}
          refundKey={ticket.refund.action_key} riderName={name}
          onClose={() => setRefundOpen(false)}
          onDone={(text, kind) => done(text, kind)}
        />
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------

function Thread({ ticket, tz, name }: { ticket: Ticket; tz: string | undefined; name: string }) {
  return (
    <>
      {/* The app mirrors the description as the first message; show it once. */}
      {ticket.description && !ticket.messages.some((m) => m.author_role === 'user' && m.body === ticket.description) ? (
        <div className="ops-msg mb-3">
          <div className="ops-msg__meta">
            <span>{name} · opened the ticket</span>
            <time dateTime={ticket.created_at}>{stamp(ticket.created_at, tz)}</time>
          </div>
          <p className="ops-msg__body">{ticket.description}</p>
        </div>
      ) : null}
      {ticket.messages.length === 0 && !ticket.description ? (
        <Empty title="Nothing said yet" />
      ) : (
        <div className="ops-thread">
          {ticket.messages.map((m) => {
            const kind = messageKind(m.author_role);
            const who = kind === 'support' ? (m.created_by?.label || 'Support')
              : kind === 'internal' ? (m.created_by?.label || 'Operator')
                : kind === 'system' ? 'System' : (m.author_name || name);
            return (
              <div key={m.id} className={`ops-msg ops-msg--${kind}`}>
                <div className="ops-msg__meta">
                  <span>
                    {kind === 'internal' ? (
                      <span className="ops-msg__tag"><Lock /> Internal note</span>
                    ) : null}
                    {kind === 'internal' ? ' · ' : ''}{who}
                  </span>
                  <time dateTime={m.created_at}>{stamp(m.created_at, tz)}</time>
                </div>
                <p className="ops-msg__body">{m.body}</p>
                {kind === 'internal' ? <p className="ops-msg__hint">Only operators see this. The rider never does.</p> : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function FullThread({ value }: { value: unknown }) {
  const v = (value ?? {}) as { description?: string | null; messages?: Array<{ id: number; author_role: string; body: string }> };
  return (
    <div className="ops-fullthread">
      {v.description ? <p>{v.description}</p> : null}
      {(v.messages ?? []).map((m) => (
        <p key={m.id}><b>{m.author_role === 'internal' ? 'Internal note' : words(m.author_role)}:</b> {m.body}</p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Composer({
  ticket, modes, onDone, onError,
}: {
  ticket: Ticket; modes: Array<'reply' | 'note'>;
  onDone: (text: string) => void; onError: (e: string | null) => void;
}) {
  const [mode, setMode] = useState<'reply' | 'note'>(modes[0]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  const [macroId, setMacroId] = useState<number | null>(null);

  const closed = ticket.status === 'CLOSED';
  const statuses = ticket.allowed_actions.statuses ?? Object.keys(STATUS_LABEL);
  const needsStatus = closed && mode === 'reply';
  const canSend = !busy && text.trim() !== '' && (!needsStatus || status !== '' && status !== 'CLOSED');

  async function send() {
    setBusy(true); onError(null);
    try {
      if (mode === 'note') {
        await api.post(`/support/admin/tickets/${ticket.id}/note/`, { body: text.trim(), idempotency_key: key });
        onDone('Internal note added. Only operators can see it.');
      } else {
        await api.post(`/support/admin/tickets/${ticket.id}/reply/`, {
          body: text.trim(), idempotency_key: key,
          ...(status ? { status } : {}), ...(macroId ? { macro_id: macroId } : {}),
        });
        onDone('Reply sent. They will see it in the app.');
      }
      setText(''); setStatus(''); setMacroId(null); setKey(newIdempotencyKey());
    } catch (err) {
      onError(failure(err, mode === 'note' ? 'The note did not go through.' : 'The reply did not go through.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title={mode === 'note' ? 'Internal note' : 'Reply'}>
      <form className="ops-form" onSubmit={(e) => { e.preventDefault(); if (canSend) void send(); }}>
        {modes.length > 1 ? (
          <div className="ops-filters" role="group" aria-label="What to write">
            {modes.map((m) => (
              <button key={m} type="button" className="ops-filter" aria-pressed={mode === m} onClick={() => setMode(m)}>
                {m === 'reply' ? 'Reply to rider' : 'Internal note'}
              </button>
            ))}
          </div>
        ) : null}

        {mode === 'reply' && ticket.allowed_actions.macros ? (
          <MacroPicker
            ticketId={ticket.id}
            onPick={(body, id) => { setText(body); setMacroId(id); }}
          />
        ) : null}

        <label className="sr-only" htmlFor="ticket-compose">{mode === 'note' ? 'Your note' : 'Your reply'}</label>
        <textarea
          id="ticket-compose"
          className={`input${mode === 'note' ? ' ops-compose--note' : ''}`}
          rows={5} value={text}
          onChange={(e) => { setText(e.target.value); if (macroId && e.target.value === '') setMacroId(null); }}
          placeholder={mode === 'note'
            ? 'A note for your colleagues. The rider will not see it.'
            : 'Write to them the way you would want to be written to.'}
        />
        {mode === 'note' ? (
          <p className="help m-0"><Lock /> Internal. Only operators can see this note, and it does not stop the first-reply clock.</p>
        ) : null}

        <div className="ops-form__row">
          {mode === 'reply' ? (
            <>
              <label className="ops-form__label" htmlFor="compose-status">{needsStatus ? 'Reopen as' : 'Then mark as'}</label>
              <select id="compose-status" className="ops-select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">{needsStatus ? 'Choose a status' : 'No change'}</option>
                {statuses.filter((s) => !needsStatus || s !== 'CLOSED').map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s] ?? s}</option>
                ))}
              </select>
            </>
          ) : null}
          <span style={{ flex: 1 }} />
          <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm" disabled={!canSend}>
            {busy ? 'Sending…' : mode === 'note' ? 'Add note' : 'Send reply'}
          </button>
        </div>
      </form>
    </Panel>
  );
}

function MacroPicker({ ticketId, onPick }: { ticketId: number; onPick: (body: string, id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [macros, setMacros] = useState<MacroSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<{ id: number; body: string; missing: string[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!open || macros !== null) return;
    api.get<{ results: MacroSummary[] }>(`/support/admin/macros/?ticket=${ticketId}`)
      .then((r) => setMacros(r.results ?? []))
      .catch((err) => { setProblem(failure(err, 'Macros could not be loaded.')); setMacros([]); });
  }, [open, macros, ticketId]);

  const shown = useMemo(() => filterMacros(macros ?? [], query), [macros, query]);

  async function show(id: number) {
    setProblem(null);
    try {
      const r = await api.get<{ body: string; missing: string[] }>(`/support/admin/macros/${id}/preview/?ticket=${ticketId}`);
      setPreview({ id, body: r.body, missing: r.missing });
    } catch (err) {
      setProblem(failure(err, 'That macro could not be previewed.'));
    }
  }

  if (!open) {
    return (
      <div className="ops-form__row">
        <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setOpen(true)}>Insert a macro…</button>
      </div>
    );
  }
  return (
    <div className="ops-macros" role="group" aria-label="Macros">
      <div className="ops-form__row">
        <label className="ops-form__label" htmlFor="macro-search">Find a macro</label>
        <input id="macro-search" className="ops-select" value={query} onChange={(e) => setQuery(e.target.value)} size={26} />
        <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => { setOpen(false); setPreview(null); }}>Close</button>
      </div>
      {problem ? <div className="alert-error" role="alert">{problem}</div> : null}
      {macros === null ? (
        <p className="help m-0" aria-busy="true">Loading macros…</p>
      ) : shown.length === 0 ? (
        <p className="help m-0">{macros.length === 0 ? 'No macros fit this ticket.' : 'No macro matches that search.'}</p>
      ) : (
        <ul className="ops-macros__list" aria-label="Macros that fit this ticket">
          {shown.map((m) => (
            <li key={m.id}>
              <button type="button" className="ops-macros__item" aria-pressed={preview?.id === m.id} onClick={() => void show(m.id)}>
                <b>{m.title}</b>
                <span>{m.locale.toUpperCase()}{m.country ? ` · ${m.country}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {preview ? (
        <div className="ops-macros__preview">
          <p className="ops-msg__body">{preview.body}</p>
          {preview.missing.length > 0 ? (
            <p className="help m-0">No value for {preview.missing.map((p) => `{${p}}`).join(', ')} on this ticket: it will be left blank.</p>
          ) : null}
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => { onPick(preview.body, preview.id); setOpen(false); setPreview(null); }}>
            Use this text
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FieldEditor({
  id, label, current, options, onSave, disabled,
}: {
  id: string; label: string; current: string; options: Array<[string, string]>;
  onSave: (value: string) => Promise<void>; disabled?: boolean;
}) {
  const [value, setValue] = useState(current);
  const [busy, setBusy] = useState(false);
  useEffect(() => setValue(current), [current]);
  return (
    <div className="ops-form__row">
      <label className="ops-form__label" htmlFor={id}>{label}</label>
      <select id={id} className="ops-select" value={value} disabled={disabled || busy} onChange={(e) => setValue(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <button
        type="button" className="sg-btn sg-btn--secondary sg-btn--sm"
        disabled={disabled || busy || value === current}
        onClick={async () => { setBusy(true); try { await onSave(value); } finally { setBusy(false); } }}
      >{busy ? 'Saving…' : 'Save'}</button>
    </div>
  );
}

function TicketPanel({
  ticket, tz, has, assignees, onDone, onError,
}: {
  ticket: Ticket; tz: string | undefined; has: (k: SupportActionKey) => boolean; assignees: Assignee[];
  onDone: (text: string) => void; onError: (e: string | null) => void;
}) {
  const base = `/support/admin/tickets/${ticket.id}`;
  const save = (tail: string, field: string, text: string) => async (value: string): Promise<void> => {
    onError(null);
    try {
      await api.post(`${base}/${tail}/`, { [field]: value });
      onDone(text);
    } catch (err) {
      onError(failure(err, 'That did not go through. Nothing was changed.'));
    }
  };
  const statuses = ticket.allowed_actions.statuses ?? Object.keys(STATUS_LABEL);
  const issueTypes = Object.entries(ticket.allowed_actions.issue_types ?? ISSUE_LABEL);
  const known = assignees.some((a) => a.id === ticket.assigned_to);
  const assigneeOptions: Array<[string, string]> = [
    ['none', 'Unassigned'],
    ...(ticket.assignee && !known ? [[String(ticket.assignee.id), ticket.assignee.label] as [string, string]] : []),
    ...assignees.map((a) => [String(a.id), `${a.label}${a.me ? ' (you)' : ''}`] as [string, string]),
  ];

  return (
    <Panel title="Ticket">
      <Facts>
        <Fact label="SLA">
          <SlaChip sla={ticket.sla} />
          <span className="ops-sla-sentence">{slaSentence(ticket.sla)}</span>
        </Fact>
        <Fact label="First reply due">{stamp(ticket.sla.first_response.due_at, tz)}{ticket.first_responded_at ? ` · answered ${stamp(ticket.first_responded_at, tz)}` : ''}</Fact>
        <Fact label="Resolution due">{stamp(ticket.sla.resolution.due_at, tz)}{ticket.resolved_at ? ` · resolved ${stamp(ticket.resolved_at, tz)}` : ''}</Fact>
        <Fact label="Opened">{stamp(ticket.created_at, tz)}</Fact>
        <Fact label="Last update">{stamp(ticket.updated_at, tz)}</Fact>
        {!has('assign') ? <Fact label="Assigned to">{ticket.assignee?.label ?? 'Nobody yet'}</Fact> : null}
      </Facts>
      <div className="ops-form ops-form--spaced">
        {has('status') ? (
          <FieldEditor
            id="set-status" label="Status" current={ticket.status}
            options={statuses.map((s) => [s, STATUS_LABEL[s] ?? s])}
            onSave={save('status', 'status', 'Status changed.')}
          />
        ) : null}
        {has('priority') ? (
          <FieldEditor
            id="set-priority" label="Priority" current={ticket.priority}
            options={PRIORITIES.map((p) => [p, PRIORITY_LABEL[p]])}
            onSave={save('priority', 'priority', 'Priority changed. The deadlines were recalculated.')}
          />
        ) : null}
        {has('category') ? (
          <FieldEditor
            id="set-category" label="Category" current={ticket.issue_type}
            options={issueTypes}
            onSave={save('category', 'issue_type', 'Category changed.')}
          />
        ) : null}
        {has('assign') ? (
          <FieldEditor
            id="set-assignee" label="Assignee" current={ticket.assigned_to ? String(ticket.assigned_to) : 'none'}
            options={assigneeOptions}
            onSave={save('assign', 'assigned_to', 'Assignment changed.')}
          />
        ) : null}
        {has('assign') && assignees.some((a) => a.me) && ticket.assigned_to !== assignees.find((a) => a.me)?.id ? (
          <div className="ops-form__row">
            <button
              type="button" className="sg-btn sg-btn--ghost sg-btn--sm"
              onClick={() => void save('assign', 'assigned_to', 'Assigned to you.')('me')}
            >Assign to me</button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function TripPanel({
  trip, refund, tz, onReview,
}: {
  trip: Trip; refund: Refund | null; tz: string | undefined; onReview?: () => void;
}) {
  const f = trip.fare;
  const b = f?.breakdown ?? null;
  const cur = trip.currency;
  return (
    <Panel
      title={`Trip #${trip.id}`}
      action={<PageLink page="trips" href={`/trips/${trip.id}`} className="sg-link">Open trip</PageLink>}
    >
      <Facts>
        <Fact label="Status">{words(trip.status)}</Fact>
        <Fact label="City">{trip.city?.name ?? '—'}</Fact>
        <Fact label="Requested">{stamp(trip.requested_at, tz)}</Fact>
        <Fact label="From">{trip.pickup_address ?? '—'}</Fact>
        <Fact label="To">{trip.destination_address ?? '—'}</Fact>
      </Facts>
      {f ? (
        <>
          <h3 className="ops-subhead">Fare</h3>
          <Facts>
            <Fact label="Quoted">{formatMinor(f.estimated_minor, cur)}</Fact>
            <Fact label="Charged">{formatMinor(f.charged_minor, cur)}</Fact>
            {b ? (
              <>
                <Fact label="Base">{formatMinor(b.base_minor, cur)}</Fact>
                <Fact label="Distance">{formatMinor(b.distance_minor, cur)}</Fact>
                <Fact label="Time">{formatMinor(b.time_minor, cur)}</Fact>
                <Fact label="Surge">{`×${b.surge_multiplier}`}</Fact>
                {b.promo_discount_minor ? <Fact label={`Promo${b.promo_code ? ` ${b.promo_code}` : ''}`}>{formatMinor(-b.promo_discount_minor, cur)}</Fact> : null}
                <Fact label="Rider payable">{formatMinor(b.rider_payable_minor, cur)}</Fact>
              </>
            ) : null}
            {f.cancellation_fee_minor ? <Fact label="Cancellation fee">{formatMinor(f.cancellation_fee_minor, cur)}</Fact> : null}
            <Fact label="Tax">{f.tax_minor === null ? '—' : `${formatMinor(f.tax_minor, cur)} (recorded; GST is stubbed)`}</Fact>
          </Facts>
        </>
      ) : (
        <p className="help">You do not hold trip access here, so the fare is not shown.</p>
      )}
      {trip.payment ? (
        <Facts>
          <Fact label="Paid">{formatMinor(trip.payment.paid_minor, cur)} by {words(trip.payment.method)}</Fact>
          <Fact label="Refunded">{formatMinor(trip.payment.refunded_minor, cur)}</Fact>
          <Fact label="Left to refund">{formatMinor(trip.payment.refundable_minor, cur)}</Fact>
        </Facts>
      ) : null}

      {refund && refund.requests.length > 0 ? (
        <ul className="ops-refunds" aria-label="Refunds raised from this ticket">
          {refund.requests.map((r) => (
            <li key={r.id} className={r.status === 'requested' ? 'ops-confirm' : undefined}>
              <b>{formatMinor(r.amount_minor, r.currency)}</b>{' · '}
              {r.status === 'requested' ? `waiting for a checker · request #${r.id}`
                : r.status === 'executed' ? `done${r.money_action_status ? ` (${words(r.money_action_status)})` : ''} · request #${r.id}`
                  : `${words(r.status)} · request #${r.id}`}
            </li>
          ))}
        </ul>
      ) : null}

      {onReview ? (
        <div className="ops-form__row">
          <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={onReview}>Review fare…</button>
          {refund?.policy?.maker_limit != null && !refund.policy.always_checker ? (
            <span className="help">
              You can refund up to {formatMinor(refund.policy.maker_limit, refund.policy.currency || cur)} on your own; more goes to a second admin.
            </span>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
