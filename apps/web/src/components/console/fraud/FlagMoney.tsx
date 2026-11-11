'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { can, useAdminAccess } from '@/lib/adminScope';
import { stamp } from '@/lib/consoleTime';
import {
  NOTE_MAX, NOTE_MIN, REWARD_KIND_WORDS, REWARD_STATE_WORDS, carryOverWords, holdBlockers, holdProblem,
  recoverAmountMinor, recoverProblem, rewardTone, type FlagDetail, type LinkedReward, type MoneyBlock,
  type PayoutHoldRow,
} from '@/lib/fraud';
import { exponentOf, formatMinor, interpretWrite, newIdempotencyKey } from '@/lib/trips';
import { PageButtonLink } from '@/components/console/PageLink';
import { Column, DataTable, Drawer, Empty, Panel, Pill } from '@/components/console/ui';

type Mode = 'recover' | 'hold' | 'renew' | 'cash' | 'release' | null;

function failure(err: unknown): string {
  return err instanceof ApiError && err.fromServer ? err.message : 'That did not go through. Nothing was changed.';
}

/**
 * Owner rulings 2026-10-31 (AUDIT 27.56), one panel on a flag:
 *
 *   * the rewards the flag is linked to (held, credited, paid, taken back) and what may still be
 *     recovered. A reward held for review is the only money a flag moves on its own, and the person
 *     sees "pending review" in their app, never why;
 *   * Recover: a Finance adjustment request, always a second approver, never more than the rewards;
 *   * Online payment only: for a flag confirmed as payment abuse. Blocking stays the separate
 *     action, for repeat or severe cases;
 *   * Hold payouts: offered only when the server says the conditions are met (a suspended driver,
 *     serious fraud), always a second approver, with a maximum length.
 *
 * The server decides each of these and refuses what is not allowed; this panel only asks.
 */
export function FlagMoney({ flag, onDone }: { flag: FlagDetail; onDone: (message: string) => void }) {
  const access = useAdminAccess();
  const [mode, setMode] = useState<Mode>(null);
  const money = flag.money;
  if (!money) return null;
  const cur = money.currency ?? 'INR';
  const fmt = (m: number, c: string = cur) => formatMinor(m, c);
  const confirmed = flag.status === 'confirmed';
  const activeHold = money.payout_hold.holds.find((h) => h.status === 'active') ?? null;
  const lastHold = money.payout_hold.holds[0] ?? null;
  const mayRecover = money.recover.applies && money.recover.may_request && money.recoverable_minor > 0
    && can(access, 'finance.adjust');
  const mayCash = money.cash?.offered && money.cash.may_set && !money.cash.active;
  const showHold = confirmed && flag.subject.role === 'driver';

  const columns: Column<LinkedReward>[] = [
    { key: 'kind', label: 'Reward', render: (r) => (
      <>{REWARD_KIND_WORDS[r.kind] ?? r.kind}{r.campaign ? <span className="muted"> · {r.campaign}</span> : null}</>
    ) },
    { key: 'amount', label: 'Amount', num: true, width: '8rem', render: (r) => fmt(r.amount_minor, r.currency) },
    { key: 'state', label: 'State', width: '12rem', render: (r) => (
      <Pill tone={rewardTone(r.state)}>{REWARD_STATE_WORDS[r.state]}</Pill>
    ) },
    { key: 'release', label: 'Held until', width: '10rem', hideBelow: 1100, render: (r) => (r.release_at ? stamp(r.release_at) : '—') },
  ];

  return (
    <>
      <Panel title="Rewards and money">
        {money.rewards.length === 0 ? (
          <Empty title="No rewards are linked to this flag"
            detail="Only an incentive or referral reward tied to the flagged activity can be held or recovered. Trip earnings are never touched." />
        ) : (
          <>
            <DataTable caption="Rewards linked to this flag" rows={money.rewards} columns={columns}
              rowKey={(r) => r.ledger_entry_id} density="compact" maxHeight={false} />
            <ul className="fr-evidence" aria-label="Reward totals">
              <li>Linked rewards {fmt(money.linked_minor)} · held {fmt(money.held_minor)} · already paid out {fmt(money.paid_minor)}</li>
              <li>
                {confirmed
                  ? (money.recoverable_minor > 0
                    ? `Up to ${fmt(money.recoverable_minor)} can still be recovered.`
                    : 'Nothing more can be recovered: never more than the linked rewards.')
                  : money.held_minor > 0
                    ? `Held until the flag is decided, or released automatically after ${money.hold_days ?? 7} days.`
                    : 'Nothing is held.'}
              </li>
            </ul>
            {money.debts.length > 0 ? (
              <ul className="fr-evidence" aria-label="Recoveries">
                {money.debts.map((d) => (
                  <li key={d.id}>
                    Recovery #{d.id}: {fmt(d.requested_minor, d.currency)} approved
                    {d.forfeited_minor > 0 ? `, ${fmt(d.forfeited_minor, d.currency)} taken from held rewards` : ''}
                    {d.amount_minor > 0 ? `, ${fmt(d.recovered_minor, d.currency)} of ${fmt(d.amount_minor, d.currency)} collected` : ''}
                    {d.uncollected_minor > 0 ? `, ${fmt(d.uncollected_minor, d.currency)} the wallet could not cover (recorded for Finance)` : ''}
                    . <span className="muted">{carryOverWords(d, fmt)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}

        {confirmed && money.recover.applies ? (
          <div className="ops-actions" role="group" aria-label="Recover rewards">
            {mayRecover ? (
              <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setMode('recover')}>
                Recover {fmt(money.recoverable_minor)}
              </button>
            ) : (
              <span className="help">
                {money.recoverable_minor <= 0
                  ? 'Recovery is fully requested.'
                  : 'Recovering needs both fraud.review and finance.adjust.'}
              </span>
            )}
          </div>
        ) : null}

        {money.cash?.offered ? (
          <div className="fr-next">
            <b>Online payment only</b>
            <span className="muted">{money.cash.note}</span>
            <div className="ops-actions" role="group" aria-label="Online payment only">
              {money.cash.active ? (
                <Pill tone="wait">Online only since {money.cash.set_at ? stamp(money.cash.set_at) : 'now'}</Pill>
              ) : mayCash ? (
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setMode('cash')}>
                  Online payment only
                </button>
              ) : null}
              <PageButtonLink page="riders" href={money.cash.block_href} variant="ghost">
                Blocking is on the rider&rsquo;s page, for repeat or severe cases
              </PageButtonLink>
            </div>
          </div>
        ) : null}

        {showHold ? (
          <div className="fr-next">
            <b>Payout hold</b>
            {money.payout_hold.holds.length > 0 ? (
              <ul className="fr-evidence" aria-label="Payout holds">
                {money.payout_hold.holds.map((h) => <li key={h.id}>{holdLine(h)}</li>)}
              </ul>
            ) : null}
            {!money.payout_hold.eligible ? (
              <span className="muted">
                A payout hold is for serious fraud on a suspended driver, with a second approver and a maximum of{' '}
                {money.payout_hold.max_days} days. Not available yet: {holdBlockers(money.payout_hold.blockers).join(' ')}
              </span>
            ) : (
              <span className="muted">
                Nothing is held automatically. Holding needs a second approver and ends after at most {money.payout_hold.max_days} days
                unless renewed.
              </span>
            )}
            <div className="ops-actions" role="group" aria-label="Payout hold">
              {money.payout_hold.eligible && money.payout_hold.may_request && !activeHold && !lastHold ? (
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setMode('hold')}>
                  Hold payouts
                </button>
              ) : null}
              {money.payout_hold.eligible && money.payout_hold.may_request && lastHold ? (
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setMode('renew')}>
                  Renew the hold
                </button>
              ) : null}
              {activeHold && money.payout_hold.may_request ? (
                <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setMode('release')}>
                  Release the hold now
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Panel>

      {mode === 'recover' ? (
        <RecoverDrawer flag={flag} money={money} onClose={() => setMode(null)} onDone={onDone} />
      ) : null}
      {mode === 'cash' ? <CashDrawer flag={flag} onClose={() => setMode(null)} onDone={onDone} /> : null}
      {mode === 'hold' || mode === 'renew' ? (
        <HoldDrawer flag={flag} money={money} renew={mode === 'renew'} onClose={() => setMode(null)} onDone={onDone} />
      ) : null}
      {mode === 'release' && activeHold ? (
        <ReleaseDrawer hold={activeHold} onClose={() => setMode(null)} onDone={onDone} />
      ) : null}
    </>
  );
}

function holdLine(h: PayoutHoldRow): string {
  const until = stamp(h.expires_at);
  if (h.status === 'active') return `Active until ${until}${h.renewal_of ? ' (renewed)' : ''}.`;
  if (h.status === 'lapsed') return `Ended at its maximum, ${until}. The driver is paid again unless it is renewed.`;
  return `Released${h.released_at ? ` ${stamp(h.released_at)}` : ''}${h.release_note ? `: ${h.release_note}` : ''}.`;
}

// ---------------------------------------------------------------------------

function Shell({
  title, busy, problem, touched, submitLabel, onSubmit, onClose, error, outcome, children,
}: {
  title: string; busy: boolean; problem: string | null; touched: boolean; submitLabel: string;
  onSubmit: () => void; onClose: () => void; error: string | null; outcome: string | null;
  children: React.ReactNode;
}) {
  return (
    <Drawer
      open wide title={title} onClose={onClose}
      footer={outcome ? (
        <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onClose}>Close</button>
      ) : (
        <>
          <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={onClose} disabled={busy}>Back</button>
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={onSubmit}
            disabled={busy || (touched && problem !== null)}>{busy ? 'Working…' : submitLabel}</button>
        </>
      )}
    >
      <div className="ops-form">
        {outcome ? <div className="alert-success" role="status"><b>{outcome}</b></div> : children}
        {touched && problem && !outcome ? <div className="alert-error" role="alert">{problem}</div> : null}
        {error ? <div className="alert-error" role="alert">{error}</div> : null}
      </div>
    </Drawer>
  );
}

function NoteField({ id, value, onChange, label }: { id: string; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <>
      <label className="ops-form__label" htmlFor={id}>{label}</label>
      <textarea id={id} className="input" rows={3} value={value} maxLength={NOTE_MAX + 100}
        onChange={(e) => onChange(e.target.value)} aria-describedby={`${id}-count`} />
      <span id={`${id}-count`} className="help">{NOTE_MIN} to {NOTE_MAX} characters · {value.trim().length}</span>
    </>
  );
}

function RecoverDrawer({
  flag, money, onClose, onDone,
}: { flag: FlagDetail; money: MoneyBlock; onClose: () => void; onDone: (m: string) => void }) {
  const cur = money.currency ?? 'INR';
  const exp = exponentOf(cur);
  const [amount, setAmount] = useState((money.recoverable_minor / 10 ** exp).toFixed(exp));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);
  const minor = recoverAmountMinor(amount, exp);
  const problem = recoverProblem(minor, money.recoverable_minor, note);

  async function submit() {
    setTouched(true);
    if (problem || minor === null) return;
    setBusy(true); setError(null);
    try {
      const body = await api.post(`/fraud/admin/flags/${flag.id}/recover/`,
        { amount_minor: minor, note: note.trim(), idempotency_key: key });
      const result = interpretWrite(body as never, 'Recovery done.');
      setOutcome(result.message);
      onDone(result.message);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={`Recover rewards · flag #${flag.id}`} busy={busy} problem={problem} touched={touched}
      submitLabel="Send for approval" onSubmit={() => void submit()} onClose={onClose} error={error} outcome={outcome}>
      <div className="ops-confirm">
        <b>A Finance adjustment, with a second approver</b>
        <span>
          Nothing is taken until a different finance admin approves. Held rewards are taken back first; the rest is
          collected from the person&rsquo;s payouts, at most half of any one payout, and carries over until it is
          done. It is never more than the linked rewards ({formatMinor(money.recoverable_minor, cur)}).
          Their app reads &ldquo;Recovery of reward (reviewed)&rdquo;.
        </span>
      </div>
      <label className="ops-form__label" htmlFor="fm-amount">Amount to recover ({cur})</label>
      <input id="fm-amount" className="input" inputMode="decimal" value={amount}
        onChange={(e) => setAmount(e.target.value)} />
      <NoteField id="fm-note" label="Note for the record (required)" value={note} onChange={setNote} />
    </Shell>
  );
}

function CashDrawer({ flag, onClose, onDone }: { flag: FlagDetail; onClose: () => void; onDone: (m: string) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const problem = holdProblem('1', 1, note, false);

  async function submit() {
    setTouched(true);
    if (problem) return;
    setBusy(true); setError(null);
    try {
      await api.post(`/fraud/admin/flags/${flag.id}/restrict-cash/`, { note: note.trim() });
      const m = 'The rider can now pay online only.';
      setOutcome(m); onDone(m);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={`Online payment only · flag #${flag.id}`} busy={busy} problem={problem} touched={touched}
      submitLabel="Set online payment only" onSubmit={() => void submit()} onClose={onClose} error={error} outcome={outcome}>
      <div className="ops-confirm">
        <b>{flag.subject.ref}</b>
        <span>
          The rider can still book rides but cannot choose cash. The app says &ldquo;Cash isn&rsquo;t available for
          your account. Please pay online.&rdquo; Nothing else changes. You or the Riders page can clear it later.
          Blocking the rider is a separate action, for repeat or severe cases.
        </span>
      </div>
      <NoteField id="fm-cash-note" label="Note for the record (required)" value={note} onChange={setNote} />
    </Shell>
  );
}

function HoldDrawer({
  flag, money, renew, onClose, onDone,
}: { flag: FlagDetail; money: MoneyBlock; renew: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const max = money.payout_hold.max_days;
  const [days, setDays] = useState(String(max));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [key] = useState(newIdempotencyKey);
  const problem = holdProblem(days, max, note);

  async function submit() {
    setTouched(true);
    if (problem) return;
    setBusy(true); setError(null);
    try {
      const body = await api.post(`/fraud/admin/flags/${flag.id}/payout-hold/`,
        { days: Number(days), note: note.trim(), renew, idempotency_key: key });
      const result = interpretWrite(body as never, 'Payout hold placed.');
      setOutcome(result.message); onDone(result.message);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={`${renew ? 'Renew the payout hold' : 'Hold payouts'} · flag #${flag.id}`} busy={busy}
      problem={problem} touched={touched} submitLabel="Send for approval" onSubmit={() => void submit()}
      onClose={onClose} error={error} outcome={outcome}>
      <div className="ops-confirm">
        <b>Stops all payouts to this suspended driver, with a second approver</b>
        <span>
          Only for serious fraud, and only while the driver is suspended. Nothing is held until a different finance
          admin approves. It ends by itself after the days below (at most {max}); Finance and the reviewers are
          told, and it can be renewed with another approval or released early.
        </span>
      </div>
      <label className="ops-form__label" htmlFor="fm-days">Days (1 to {max})</label>
      <input id="fm-days" className="input" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
      <NoteField id="fm-hold-note" label="Note for the record (required)" value={note} onChange={setNote} />
    </Shell>
  );
}

export function ReleaseDrawer({
  hold, onClose, onDone, path,
}: { hold: PayoutHoldRow; onClose: () => void; onDone: (m: string) => void; path?: string }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const problem = holdProblem('1', 1, note, false);

  async function submit() {
    setTouched(true);
    if (problem) return;
    setBusy(true); setError(null);
    try {
      await api.post(path ?? `/fraud/admin/payout-holds/${hold.id}/release/`, { note: note.trim() });
      const m = 'The payout hold is released. The driver is paid again.';
      setOutcome(m); onDone(m);
    } catch (err) {
      setError(failure(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title="Release the payout hold" busy={busy} problem={problem} touched={touched}
      submitLabel="Release the hold" onSubmit={() => void submit()} onClose={onClose} error={error} outcome={outcome}>
      <div className="ops-confirm">
        <b>No second approver is needed</b>
        <span>Releasing only lets the driver be paid, from the next payout. It is audited.</span>
      </div>
      <NoteField id="fm-release-note" label="Note for the record (required)" value={note} onChange={setNote} />
    </Shell>
  );
}
