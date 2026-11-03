'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { stamp, timeZoneFor } from '@/lib/consoleTime';
import {
  KIND_WORDS, STATE_WORDS, termsWords, type Campaign, type State,
} from '@/lib/promotions';
import { formatMinor } from '@/lib/trips';
import { PageLink } from '@/components/console/PageLink';
import { History, RecordPanel, RecordStat, type HistoryEntry } from '@/components/console/kit/RecordPanel';
import { StatusChip, type ChipTone } from '@/components/console/kit/StatusChip';
import { BudgetBar } from '@/components/console/promotions';
import { messageOf } from '@/components/console/notifications';
import { Fact, Facts } from '@/components/console/ui';

/**
 * One campaign beside the list: its budget (exact), its rules and its
 * history. Every change to it (edit a draft, submit, pause, resume, cancel,
 * raise the budget) still happens in the campaign drawer, opened from here,
 * so the maker-checker flow is the one it always was.
 */
export function campaignTone(s: State): ChipTone {
  switch (s) {
    case 'live': return 'good';
    case 'exhausted': return 'caution';
    case 'pending_approval': case 'scheduled': case 'paused': return 'info';
    default: return 'neutral';
  }
}

export function CampaignChip({ state }: { state: State }) {
  return <StatusChip tone={campaignTone(state)}>{STATE_WORDS[state]}</StatusChip>;
}

function historyOf(c: Campaign, tz: string | undefined): HistoryEntry[] {
  const rows: Array<{ iso: string | null; text: string; who?: string | null }> = [
    { iso: c.created_at, text: 'Draft created', who: c.created_by.label || null },
    { iso: c.launched_at, text: 'Went live' },
    { iso: c.paused_at, text: 'Paused' },
    { iso: c.exhausted_at, text: 'Budget used up; stopped by itself' },
    { iso: c.cancelled_at, text: 'Cancelled' },
    { iso: c.ended_at, text: 'Ended' },
  ];
  return rows
    .filter((r): r is { iso: string; text: string; who?: string | null } => Boolean(r.iso))
    .sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0))
    .map((r) => ({ at: stamp(r.iso, tz), text: r.text, who: r.who }));
}

export function CampaignRecord({ id, onClose, onManage, refreshKey = 0 }: {
  id: number;
  onClose: () => void;
  onManage: () => void;
  refreshKey?: number;
}) {
  const [c, setC] = useState<Campaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setC(await api.get<Campaign>(`/promotions/admin/campaigns/${id}/`));
    } catch (err) {
      setC(null);
      setError(messageOf(err, 'That campaign could not be loaded.'));
    }
  }, [id]);
  useEffect(() => { void load(); }, [load, refreshKey]);

  if (!c || c.id !== id) {
    return (
      <RecordPanel label="Campaign" title="Campaign" refId={`#${id}`} onClose={onClose}
        tabs={[{ key: 'budget', label: 'Budget', content: error ? (
          <div>
            <p className="alert-error" role="alert">{error}</p>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void load()}>Try again</button>
          </div>
        ) : <p className="ops-record__empty" aria-busy="true">Loading the campaign…</p> }]} />
    );
  }

  const tz = timeZoneFor(c.scope) ?? timeZoneFor(c.country);
  const cfg = c.config;
  const b = c.budget;
  return (
    <RecordPanel
      label="Campaign"
      title={c.name}
      refId={`#${c.id}`}
      subtitle={<>{KIND_WORDS[c.kind]} · {c.scope_name ?? c.country}</>}
      status={<CampaignChip state={c.state} />}
      onClose={onClose}
      actions={(
        <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={onManage}>
          {c.state === 'draft' && !c.is_legacy ? 'Edit or submit…' : 'Manage…'}
        </button>
      )}
      tabs={[
        {
          key: 'budget', label: 'Budget', content: (
            <div className="grid gap-3">
              {b.budget_minor === null ? (
                <p className="ops-record__empty">No budget: an existing code from before budgets.</p>
              ) : (
                <>
                  <div className="ops-record__stats">
                    <RecordStat label="Budget" value={formatMinor(b.budget_minor, c.currency)} note={c.currency} />
                    <RecordStat label="Spent" value={formatMinor(b.spent_minor, c.currency)} />
                    <RecordStat label="Reserved" value={formatMinor(b.committed_minor, c.currency)} />
                    <RecordStat label="Left" value={formatMinor(b.remaining_minor ?? 0, c.currency)} />
                  </div>
                  {c.state !== 'draft' ? <BudgetBar budget={b} /> : null}
                  {b.overshoot_minor > 0 ? (
                    <p className="nf-refusal" role="status"><b>{formatMinor(b.overshoot_minor, c.currency)} over the cap.</b> Discounts reserved on trips already booked were honoured past the budget.</p>
                  ) : null}
                </>
              )}
              {c.projection?.budget_minor ? (
                <Facts>
                  <Fact label="Projected spend">{formatMinor(c.projection.budget_minor, c.currency)}</Fact>
                  {c.projection.max_redemptions ? <Fact label="At most">{c.projection.max_redemptions.toLocaleString('en-IN')} uses</Fact> : null}
                </Facts>
              ) : null}
              {c.state === 'pending_approval' && c.approval_request_id ? (
                <p className="ops-note" role="status">
                  Waiting for a second admin: <PageLink page="approvals" href={`/approvals?id=${c.approval_request_id}`}>APR-{c.approval_request_id}</PageLink>. Nothing goes live until they approve.
                </p>
              ) : null}
              {c.budget_request_id ? (
                <p className="ops-note" role="status">
                  Budget raise waiting: <PageLink page="approvals" href={`/approvals?id=${c.budget_request_id}`}>APR-{c.budget_request_id}</PageLink>.
                </p>
              ) : null}
            </div>
          ),
        },
        {
          key: 'rules', label: 'Rules', content: (
            <Facts>
              <Fact label="Terms">{termsWords(c)}</Fact>
              <Fact label="Where">{c.scope_name ?? '—'}</Fact>
              <Fact label="Runs">{stamp(c.starts_at, tz)} to {stamp(c.ends_at, tz)}</Fact>
              {c.kind === 'rider_promo' ? (
                <>
                  <Fact label="Code">{cfg.auto_apply ? 'Applied automatically' : cfg.code || '—'}</Fact>
                  <Fact label="Minimum fare">{formatMinor(cfg.min_fare_minor ?? 0, c.currency)}</Fact>
                  <Fact label="Per rider">{cfg.max_per_user ?? '—'}</Fact>
                  <Fact label="New riders only">{cfg.new_riders_only ? 'Yes' : 'No'}</Fact>
                  {cfg.zone_code ? <Fact label="Zone">{cfg.zone_code}</Fact> : null}
                </>
              ) : null}
              {c.kind === 'driver_incentive' ? (
                <>
                  <Fact label="Trips to complete">{cfg.target_trips ?? '—'}</Fact>
                  <Fact label="Reward">{formatMinor(cfg.reward_minor ?? 0, c.currency)}</Fact>
                  {cfg.zone_code ? <Fact label="Zone">{cfg.zone_code}</Fact> : null}
                  {cfg.vehicle_type ? <Fact label="Vehicle class">{cfg.vehicle_type}</Fact> : null}
                </>
              ) : null}
              {c.kind === 'referral' ? (
                <>
                  <Fact label="Who">{cfg.audience === 'driver' ? 'Driver referrals' : 'Rider referrals'}</Fact>
                  <Fact label="Trips to qualify">{cfg.required_trips ?? '—'}</Fact>
                  <Fact label="Referrer gets">{formatMinor(cfg.referrer_reward_minor ?? 0, c.currency)}</Fact>
                  <Fact label="New person gets">{formatMinor(cfg.referee_reward_minor ?? 0, c.currency)}</Fact>
                </>
              ) : null}
              {c.tax ? <Fact label="Tax">{c.tax}</Fact> : null}
              {c.description ? <Fact label="About">{c.description}</Fact> : null}
              {c.reason ? <Fact label="Why">{c.reason}</Fact> : null}
            </Facts>
          ),
        },
        { key: 'history', label: 'History', content: <History entries={historyOf(c, tz)} /> },
      ]}
    />
  );
}
