'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp } from '@/lib/consoleTime';
import {
  EVENT_WORDS, KIND_WORDS, ageWords, evidenceLines, canReadFraud, type FlagDetail, type LinkedAccount, type Options,
} from '@/lib/fraud';
import { PageLink } from '@/components/console/PageLink';
import { FlagDecisionDrawer, type FlagAction } from '@/components/console/fraud/FlagDecisionDrawer';
import { FlagMoney } from '@/components/console/fraud/FlagMoney';
import { HandoffButtons } from '@/components/console/fraud/HandoffButtons';
import { FraudNav, NoFraudAccess, SeverityPill, StatusPill } from '@/components/console/fraud/parts';
import {
  Empty, ErrorState, Fact, Facts, PageHeader, Panel, Pill, Skeleton,
} from '@/components/console/ui';

/**
 * One flag: the case file.
 *
 * What the rule saw (in words, from signal names and counts, never a value), who else is linked to
 * the person and by what (masked labels; accounts outside your scope are counted, not named), the
 * trips and campaigns involved, and the timeline. Reviewers (fraud.review) can assign, note,
 * dismiss and confirm; Marketing sees the same page without the buttons. Confirming records a
 * decision and offers hand-offs to actions that already exist elsewhere; it tells the person nothing.
 * The only money a flag moves is a reward HOLD; recovering a reward, an online-payment-only restriction
 * and a payout hold are separate actions on the Rewards and money panel (AUDIT 27.56).
 */
const LINK_TONE = { active: 'neutral', suspended: 'bad', inactive: 'wait' } as const;

function Linked({ a }: { a: LinkedAccount }) {
  const role = a.role === 'driver' ? 'drivers' : 'riders';
  return (
    <li>
      <span className="ops-linklist__kind">{a.role === 'driver' ? 'Driver' : 'Rider'}</span>
      {a.href ? <PageLink page={role} href={a.href}>{a.ref}</PageLink> : <span>{a.ref}</span>}
      <span className="muted">{a.signal_labels.join(', ')}</span>
      <Pill tone={LINK_TONE[a.status]}>{a.status === 'suspended' ? 'Suspended' : a.status === 'inactive' ? 'Inactive' : 'Active'}</Pill>
    </li>
  );
}

export default function FlagPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const access = useAdminAccess();
  const [data, setData] = useState<FlagDetail | null>(null);
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<FlagAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const may = canReadFraud(access);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await api.get<FlagDetail>(`/fraud/admin/flags/${id}/`));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'We could not load this flag.');
    }
  }, [id]);

  useEffect(() => { if (may) void load(); }, [load, may]);
  useEffect(() => {
    if (!may) return;
    api.get<Options>('/fraud/admin/options/').then(setOptions).catch(() => setOptions(null));
  }, [may]);

  async function simple(path: string, message: string) {
    setBusy(true);
    try {
      await api.post(`/fraud/admin/flags/${id}/${path}/`, {});
      setNotice(message);
      await load();
    } catch (err) {
      setError(err instanceof ApiError && err.fromServer ? err.message : 'That did not go through.');
    } finally {
      setBusy(false);
    }
  }

  if (!canOpen(access, 'fraud') || !may) {
    return (<><PageHeader title="Fraud & Risk" /><NoFraudAccess /></>);
  }
  if (!data && !error) {
    return (
      <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading the flag</span>
        <Skeleton kind="block" count={3} />
      </div>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Flag" subtitle={<Link href="/fraud">Back to the queue</Link>} />
        <ErrorState title="This flag could not be opened" detail={error ?? ''} onRetry={() => void load()} />
      </>
    );
  }

  const active = data.status === 'open' || data.status === 'in_review';
  const lines = evidenceLines(data);
  const review = data.may_review;
  const subjectPage = data.subject.role === 'driver' ? 'drivers' : 'riders';
  const taken = new Set(data.handoffs_taken.map((h) => h.kind));
  const withTaken = data.handoffs.map((h) => (taken.has(h.kind) && !h.taken_at ? { ...h, taken_at: 'yes' } : h));

  return (
    <>
      <PageHeader
        title={`Flag #${data.id}`}
        subtitle={<><Link href="/fraud">Fraud &amp; Risk</Link> · {KIND_WORDS[data.kind] ?? data.kind}</>}
        actions={review ? (
          <div className="ops-actions" role="group" aria-label="Flag actions">
            {active ? (
              <>
                {data.assigned_to === null ? (
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
                    onClick={() => void simple('assign', 'Assigned to you.')}>Assign to me</button>
                ) : (
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy}
                    onClick={() => void simple('unassign', 'Unassigned.')}>Unassign</button>
                )}
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setDrawer('assign')}>Assign to…</button>
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setDrawer('note')}>Add note</button>
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setDrawer('dismiss')}>Dismiss</button>
                <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setDrawer('confirm')}>Confirm fraud</button>
              </>
            ) : (
              <>
                <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => setDrawer('note')}>Add note</button>
                <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setDrawer('reopen')}>Reopen</button>
              </>
            )}
          </div>
        ) : undefined}
      />

      {notice && <div className="alert-success mb-4" role="status">{notice}</div>}
      {error && <div className="alert-error mb-4" role="alert">{error}</div>}
      {!review ? (
        <p className="help mb-4">You can read this flag. Reviewing it needs the fraud.review capability.</p>
      ) : null}

      <div className="ops-grid-2">
        <Panel title="The flag">
          <Facts>
            <Fact label="Severity"><SeverityPill severity={data.severity} /> <span className="muted">score {data.score} of 100</span></Fact>
            <Fact label="Status"><StatusPill status={data.status} /></Fact>
            <Fact label="Person">
              {data.subject.href ? <PageLink page={subjectPage} href={data.subject.href}>{data.subject.ref}</PageLink> : data.subject.ref}
            </Fact>
            <Fact label="Raised by">{KIND_WORDS[data.rule_key] ?? data.rule_key}{data.rule_version ? <span className="muted"> · rule version {data.rule_version}</span> : null}</Fact>
            <Fact label="City">{data.scope_name ?? 'Not placed'}</Fact>
            <Fact label="Assigned">{data.assigned_to ? data.assigned_to.label : <span className="muted">Unassigned</span>}</Fact>
            <Fact label="Raised">{stamp(data.created_at)} <span className="muted">· {ageWords(data.age_hours)} ago</span></Fact>
            {data.hit_count > 1 ? <Fact label="Last seen">{stamp(data.last_seen_at ?? data.created_at)} <span className="muted">· {data.hit_count} hits</span></Fact> : null}
            {data.decided_at ? (
              <>
                <Fact label="Decided">{stamp(data.decided_at)}{data.decided_by ? <span className="muted"> · {data.decided_by.label}</span> : null}</Fact>
                <Fact label="Reason">{data.decision_reason.replace(/_/g, ' ')}</Fact>
                <Fact label="Note">{data.decision_note}</Fact>
              </>
            ) : null}
          </Facts>
        </Panel>

        <Panel title="What the rule saw">
          <ul className="fr-evidence" aria-label="Evidence">
            {lines.map((l) => <li key={l}>{l}</li>)}
          </ul>
          <p className="help">Counts and signal names only. A phone number, a push token or an account number is never stored in a flag.</p>
          {data.related.trips.length > 0 || data.related.campaigns.length > 0 ? (
            <div className="fr-related">
              {data.related.trips.length > 0 ? (
                <p>
                  <b>Trips</b>{data.related.trip_count > data.related.trips.length ? ` (latest ${data.related.trips.length} of ${data.related.trip_count})` : ''}:{' '}
                  {data.related.trips.map((t, i) => (
                    <span key={t.id}>{i > 0 ? ', ' : ''}<PageLink page="trips" href={t.href}>#{t.id}</PageLink></span>
                  ))}
                </p>
              ) : null}
              {data.related.campaigns.length > 0 ? (
                <p>
                  <b>Campaigns</b>:{' '}
                  {data.related.campaigns.map((c, i) => (
                    <span key={c.id}>{i > 0 ? ', ' : ''}<PageLink page="promotions" href={c.href}>{c.name}</PageLink></span>
                  ))}
                </p>
              ) : null}
            </div>
          ) : null}
        </Panel>
      </div>

      <Panel title={`Linked accounts (${data.linked.accounts.length + data.linked.outside_scope})`}>
        {data.linked.accounts.length === 0 && data.linked.outside_scope === 0 ? (
          <Empty title="No linked accounts" detail="No other account shares a device, phone number or payout instrument with this person." />
        ) : (
          <>
            <ul className="ops-linklist" aria-label="Linked accounts">
              {data.linked.accounts.map((a) => <Linked key={a.user_id} a={a} />)}
            </ul>
            {data.linked.outside_scope_label ? <p className="muted fr-outside">{data.linked.outside_scope_label}</p> : null}
          </>
        )}
      </Panel>

      <FlagMoney flag={data} onDone={(m) => { setNotice(m); void load(); }} />

      {data.status === 'confirmed' && withTaken.some((h) => h.available) ? (
        <Panel title="Take it further">
          <p className="help">Each opens the page where that action already lives, with its own permission and, where the rules say so, a second approver. Choosing one is recorded below.</p>
          <HandoffButtons flagId={data.id} handoffs={withTaken} />
        </Panel>
      ) : null}

      <Panel title="Timeline">
        <ol className="ops-timeline">
          {[...data.timeline].reverse().map((e) => (
            <li key={e.id} className="ops-timeline__item">
              <time dateTime={e.at}>{stamp(e.at)}</time>
              <span>
                <b>{EVENT_WORDS[e.action] ?? e.action}</b>
                {e.reason ? <> · {e.reason.replace(/_/g, ' ')}</> : null}
                {e.note ? <> — {e.note}</> : null}
              </span>
              <span className="muted">{e.actor ? e.actor.label : 'system'}</span>
            </li>
          ))}
        </ol>
      </Panel>

      {drawer && (
        <FlagDecisionDrawer action={drawer} flag={data} options={options}
          onClose={() => setDrawer(null)}
          onDone={(m) => { setNotice(m); void load(); }} />
      )}
    </>
  );
}
