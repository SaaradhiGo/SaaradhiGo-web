'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { canAny, useAdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp } from '@/lib/consoleTime';
import { messageOf } from '@/components/console/notifications';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { History, RecordPanel, type HistoryEntry } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { ActionNotice, RecordFacts, RecordFailed, RecordLoading, RecordSection } from '@/components/console/kit/ListBits';

/** Staff and roles: who can sign in to the console and what they may do. Super Admin only. */
type Assignment = {
  id: number; role: string; role_name: string; scope: string; scope_name: string; scope_kind: string;
  is_active: boolean; granted_by: string | null; reason: string; created_at: string;
};
type Person = {
  id: number; ref: string; name: string; email: string; phone: string; is_active: boolean;
  is_superuser: boolean; is_break_glass: boolean; invite_pending: boolean; mfa_enrolled: boolean;
  last_login: string | null; created_at: string; assignments: Assignment[];
};
type Detail = Person & {
  is_self: boolean;
  history: { id: number; action: string; actor: string | null; reason: string; at: string; role?: string | null; scope?: string | null }[];
};
type Options = {
  roles: { code: string; name: string; description: string; global_only: boolean; permissions: { code: string; label: string }[] }[];
  scopes: { code: string; name: string; kind: string }[];
};

const PAGE_SIZE = 25;
const VIEWS = [{ key: 'active', label: 'Active' }, { key: 'inactive', label: 'Off' }, { key: 'all', label: 'All' }];

const rolesText = (p: Person) => {
  const live = p.assignments.filter((a) => a.is_active);
  return live.length ? live.map((a) => `${a.role_name} @ ${a.scope_name}`).join(', ') : 'No role yet';
};

function statusOf(p: Person) {
  if (!p.is_active) return <StatusChip tone="neutral">Off</StatusChip>;
  if (p.invite_pending) return <StatusChip tone="caution">Invite pending</StatusChip>;
  return <StatusChip tone="good">Active</StatusChip>;
}

function InviteForm({ onDone }: { onDone: (text: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api.post<{ invite_sent: boolean; email_delivery_configured: boolean }>('/auth/admin/invite/', {
        email: email.trim(), full_name: name.trim(), ...(phone.trim() ? { phone_number: phone.trim() } : {}),
      });
      onDone(r.email_delivery_configured === false || r.invite_sent === false
        ? 'The operator was created, but the invite email could not be sent.'
        : `Invite sent to ${email.trim()}.`);
    } catch (err) {
      setError(messageOf(err, 'The invite could not be sent.'));
    } finally { setBusy(false); }
  }
  return (
    <form className="ops-form" aria-label="Invite an operator" onSubmit={send}>
      <div className="ops-form__row">
        <label className="ops-form__label" htmlFor="inv-name">Name</label>
        <input id="inv-name" className="ops-select" value={name} onChange={(e) => setName(e.target.value)} required />
        <label className="ops-form__label" htmlFor="inv-email">Work email</label>
        <input id="inv-email" type="email" className="ops-select" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <label className="ops-form__label" htmlFor="inv-phone">Phone (optional)</label>
        <input id="inv-phone" className="ops-select" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || !name.trim() || !email.trim()}>Send invite</button>
      </div>
      {error ? <p className="alert-error" role="alert">{error}</p> : null}
    </form>
  );
}

function Reasoned({ label, confirm, tone, onRun }: {
  label: string; confirm: string; tone?: 'danger'; onRun: (reason: string) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return <button type="button" className={`sg-btn sg-btn--sm ${tone ? 'sg-btn--ghost' : 'sg-btn--secondary'}`} onClick={() => setOpen(true)}>{label}</button>;
  }
  const run = async () => {
    setBusy(true);
    const msg = await onRun(reason.trim());
    setBusy(false);
    if (msg) setError(msg); else { setOpen(false); setReason(''); setError(null); }
  };
  return (
    <div className="ops-form" role="group" aria-label={label}>
      <label className="ops-form__label" htmlFor={`why-${label}`}>Reason</label>
      <input id={`why-${label}`} className="ops-select" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || reason.trim().length < 5} onClick={run}>{confirm}</button>
      <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setOpen(false)}>Cancel</button>
      {error ? <p className="alert-error" role="alert">{error}</p> : null}
    </div>
  );
}

function GiveRole({ person, options, onDone }: { person: Detail; options: Options; onDone: () => void }) {
  const [role, setRole] = useState('');
  const [scope, setScope] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picked = options.roles.find((r) => r.code === role);
  const globalScope = options.scopes.find((s) => s.kind === 'global');
  const places = picked?.global_only ? (globalScope ? [globalScope] : []) : options.scopes.filter((s) => s.kind !== 'global');
  const place = picked?.global_only ? (globalScope?.code ?? '') : scope;
  const ready = Boolean(picked && place && reason.trim().length >= 5);
  async function give(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await api.post(`/admin-access/staff/${person.id}/assignments/`, { role, scope: place, reason: reason.trim() });
      setRole(''); setScope(''); setReason('');
      onDone();
    } catch (err) {
      setError(messageOf(err, 'The role could not be given.'));
    } finally { setBusy(false); }
  }
  return (
    <form className="ops-form" aria-label="Give a role" onSubmit={give}>
      <div className="ops-form__row">
        <label className="ops-form__label" htmlFor="gr-role">Role</label>
        <select id="gr-role" className="ops-select" value={role} onChange={(e) => { setRole(e.target.value); setScope(''); }}>
          <option value="">Choose a role</option>
          {options.roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
        </select>
        <label className="ops-form__label" htmlFor="gr-place">Place</label>
        <select id="gr-place" className="ops-select" value={place} disabled={Boolean(picked?.global_only)} onChange={(e) => setScope(e.target.value)}>
          <option value="">Choose a place</option>
          {places.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>
      </div>
      {picked ? (
        <div>
          <p>{picked.description}</p>
          <ul aria-label="What this role can do">{picked.permissions.map((p) => <li key={p.code}>{p.label}</li>)}</ul>
        </div>
      ) : null}
      <div className="ops-form__row">
        <label className="ops-form__label" htmlFor="gr-why">Reason</label>
        <input id="gr-why" className="ops-select" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || !ready}>Give role</button>
      </div>
      {error ? <p className="alert-error" role="alert">{error}</p> : null}
    </form>
  );
}

function StaffRecord({ id, options, onChanged, onClose }: {
  id: number; options: Options; onChanged: () => void; onClose: () => void;
}) {
  const [data, setData] = useState<Detail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    setFailed(null);
    try { setData(await api.get<Detail>(`/admin-access/staff/${id}/`)); }
    catch (err) { setFailed(messageOf(err, 'This person could not be loaded.')); }
  }, [id]);
  useEffect(() => { setData(null); void load(); }, [load]);
  const changed = () => { void load(); onChanged(); };

  const act = (path: string) => async (reason: string): Promise<string | null> => {
    try {
      await api.post(path, { reason });
      changed();
      return null;
    } catch (err) {
      // 409 is the Super Admin floor: the last one cannot be taken away.
      if (err instanceof ApiError && err.status === 409) {
        return 'This is the last Super Admin allowed. Appoint another Super Admin first.';
      }
      return messageOf(err, 'That did not go through.');
    }
  };

  if (failed) return <RecordFailed label="Staff record" message={failed} onRetry={() => void load()} onClose={onClose} />;
  if (!data) return <RecordLoading label="Staff record" />;
  const locked = data.is_self || data.is_break_glass;
  const why = data.is_self ? 'This is your own account; another Super Admin has to change it.'
    : 'This is the break-glass account; it is changed only outside the console.';
  const live = data.assignments.filter((a) => a.is_active);
  const history: HistoryEntry[] = data.history.map((h) => ({
    at: stamp(h.at),
    text: `${h.action}${h.role ? `: ${h.role}` : ''}${h.scope ? ` @ ${h.scope}` : ''}${h.reason ? ` (${h.reason})` : ''}`,
    who: h.actor,
  }));
  return (
    <RecordPanel label="Staff record" title={data.name} refId={data.ref} onClose={onClose} status={statusOf(data)}
      subtitle={`${data.email}${data.phone ? ` · ${data.phone}` : ''}`}
      tabs={[
        {
          key: 'access', label: 'Access', content: (
            <>
              {locked ? <p className="ops-record__empty">{why}</p> : null}
              <RecordSection title="Roles now">
                {live.length === 0 ? <p className="ops-record__empty">No role yet.</p> : (
                  <ul>
                    {live.map((a) => (
                      <li key={a.id}>
                        <b>{a.role_name}</b> @ {a.scope_name}
                        {a.reason ? <span> · {a.reason}</span> : null}
                        {!locked ? <Reasoned label="Take away…" confirm="Take away" tone="danger" onRun={act(`/admin-access/assignments/${a.id}/revoke/`)} /> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </RecordSection>
              {!locked ? <RecordSection title="Give a role"><GiveRole person={data} options={options} onDone={changed} /></RecordSection> : null}
            </>
          ),
        },
        { key: 'history', label: 'History', content: <History entries={history} empty="No changes recorded." /> },
        {
          key: 'account', label: 'Account', content: (
            <>
              <RecordFacts rows={[
                ['Email', data.email], ['Phone', data.phone || '—'],
                ['Two-step sign-in', data.mfa_enrolled ? 'Set up' : 'Not set up'],
                ['Last sign-in', stamp(data.last_login)], ['Added', stamp(data.created_at)],
                data.is_superuser && ['Super Admin', 'Yes'],
              ]} />
              {locked ? <p className="ops-record__empty">{why}</p> : data.is_active
                ? <Reasoned label="Deactivate…" confirm="Deactivate" tone="danger" onRun={act(`/admin-access/staff/${data.id}/deactivate/`)} />
                : <Reasoned label="Reactivate…" confirm="Reactivate" onRun={act(`/admin-access/staff/${data.id}/reactivate/`)} />}
            </>
          ),
        },
      ]} />
  );
}

export default function StaffPage() {
  const access = useAdminAccess();
  const allowed = canAny(access, ['admin.manage']) && canOpen(access, 'staff');
  const [view, setView] = useState('active');
  const [role, setRole] = useState('');
  const [term, setTerm] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Person[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [supers, setSupers] = useState<number | null>(null);
  const [options, setOptions] = useState<Options>({ roles: [], scopes: [] });
  const [openId, setOpenId] = useState<number | null>(null);
  const [inviting, setInviting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'done'; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    api.get<Options>('/admin-access/staff/options/').then(setOptions).catch(() => undefined);
  }, [allowed]);
  useEffect(() => {
    if (!allowed) return;
    const s = new URLSearchParams({ status: view, page: String(page) });
    if (role) s.set('role', role);
    if (q) s.set('q', q);
    setLoading(true);
    api.get<{ count: number; results: Person[]; super_admins: number }>(`/admin-access/staff/?${s}`)
      .then((r) => { setRows(r.results); setTotal(r.count); setSupers(r.super_admins); setError(null); })
      .catch((err) => setError(messageOf(err, 'The staff list could not be loaded.')))
      .finally(() => setLoading(false));
  }, [allowed, view, role, q, page, tick]);

  const columns = useMemo<ListColumn<Person>[]>(() => [
    { key: 'name', label: 'Name', primary: true, render: (p) => <span>{p.name} <span className="ops-ref sg-num">{p.ref}</span></span> },
    { key: 'roles', label: 'Roles', render: (p) => rolesText(p) },
    { key: 'status', label: 'Status', render: statusOf },
    { key: 'mfa', label: 'Two-step sign-in', render: (p) => (p.mfa_enrolled ? 'Set up' : 'Not set up') },
    { key: 'last', label: 'Last sign-in', render: (p) => stamp(p.last_login) },
  ], []);

  if (!allowed) return <p className="alert-error" role="alert">Staff and roles is for Super Admins.</p>;
  return (
    <>
      <ActionNotice notice={notice} onDismiss={() => setNotice(null)} />
      {supers !== null && supers < 2 ? (
        <p className="alert-error" role="status">Only {supers} Super Admin: appoint a second.</p>
      ) : null}
      <div className={openId !== null ? 'ops-split' : undefined}>
        <ListPage<Person>
          pageKey="staff" title="Staff and roles" summary="Contact details are masked."
          views={VIEWS} view={view} onView={(v) => { setView(v); setPage(1); }}
          actionsSlot={<button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setInviting((v) => !v)}>Invite operator…</button>}
          filterSlot={(
            <>
              <label className="sr-only" htmlFor="st-role">Role</label>
              <select id="st-role" className="ops-select" value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }}>
                <option value="">Any role</option>
                {options.roles.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
              <form role="search" aria-label="Find staff" onSubmit={(e) => { e.preventDefault(); setQ(term.trim()); setPage(1); }}>
                <label className="sr-only" htmlFor="st-q">Name or email</label>
                <input id="st-q" className="ops-select" value={term} placeholder="Name or email" onChange={(e) => setTerm(e.target.value)} />
              </form>
              {inviting ? <InviteForm onDone={(text) => { setInviting(false); setNotice({ kind: 'done', text }); setTick((t) => t + 1); }} /> : null}
            </>
          )}
          columns={columns} rows={rows} rowKey={(p) => p.id} total={total} page={page} pageSize={PAGE_SIZE} onPage={setPage}
          onRow={(p) => setOpenId(p.id)} activeKey={openId} loading={loading} error={error} empty="Nobody matches this view." />
        {openId !== null ? (
          <StaffRecord id={openId} options={options} onChanged={() => setTick((t) => t + 1)} onClose={() => setOpenId(null)} />
        ) : null}
      </div>
    </>
  );
}
