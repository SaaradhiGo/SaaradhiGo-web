'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { type AdminAccess, withScope } from '@/lib/adminScope';
import { type NeedsItem, type NeedsResponse, sosClock, waited } from '@/lib/workspace';
import { SeverityChip } from '@/components/console/kit/StatusChip';

type Tab = 'all' | 'mine' | 'nobody';


/** The incident id an SOS item links to (`/safety-ops/incidents/<id>`), or null. */
function incidentId(item: NeedsItem): number | null {
  const m = /^\/safety-ops\/incidents\/(\d+)/.exec(item.link);
  return m ? Number(m[1]) : null;
}

/**
 * Needs action (design boards C and D): what needs a person, worst first, for
 * this operator's role and place, from `command-centre/admin/needs-action/`.
 *
 * Each row says what it is, where, for how long, who has it ("Nobody on it"
 * otherwise), time left against its target, and who else is looking. "Take
 * it" acknowledges and assigns an SOS to the operator in one click; every
 * other row opens the exact record or the filtered list. The server decides
 * what each role sees; nothing is hidden or added here.
 */
export function NeedsActionInbox({
  access, title = 'Needs action', placeName, compact = false, limit = 30,
}: {
  access: AdminAccess | null;
  title?: string;
  placeName?: string;
  compact?: boolean;
  limit?: number;
}) {
  const [data, setData] = useState<NeedsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const me = access?.id;

  const load = useCallback(async () => {
    try {
      setData(await api.get<NeedsResponse>(withScope(`/command-centre/admin/needs-action/?limit=${limit}`)));
      setFetchedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'What needs action could not be loaded.');
    }
  }, [limit]);

  useEffect(() => {
    void load();
    const poll = window.setInterval(load, 20_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [load]);

  const items = useMemo(() => data?.items ?? [], [data]);
  const shown = useMemo(() => items.filter((i) => (tab === 'all' ? true
    : tab === 'mine' ? i.owner && String(i.owner.id) === String(me)
      : !i.owner && (i.kind === 'sos' || i.kind === 'stuck_trip' || i.kind === 'alert'))), [items, tab, me]);
  const mine = items.filter((i) => i.owner && String(i.owner.id) === String(me)).length;
  const nobody = items.filter((i) => !i.owner && (i.kind === 'sos' || i.kind === 'stuck_trip' || i.kind === 'alert')).length;
  const drift = Math.round((now - fetchedAt) / 1000);

  async function takeIt(item: NeedsItem) {
    const id = incidentId(item);
    if (!id) return;
    setBusy(item.link);
    try {
      if (item.actions.includes('acknowledge')) await api.post(`/safety/admin/incidents/${id}/acknowledge/`, {});
      await api.post(`/safety/admin/incidents/${id}/assign/`, { assigned_to: 'me' });
      await load();
    } catch (e) {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'That did not go through. Try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={`ops-inbox${compact ? ' ops-inbox--compact' : ''}`} aria-label={title}>
      <header className="ops-inbox__head">
        <div>
          <h2>{title}</h2>
          <p>{placeName ? `${placeName} · ` : ''}{data ? `${data.total} open` : 'Loading…'}</p>
        </div>
        <div className="ops-inbox__tabs" role="tablist" aria-label="Show">
          {([['all', `All ${items.length}`], ['mine', `Mine ${mine}`], ['nobody', `Nobody on it ${nobody}`]] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className="ops-view"
              onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
      </header>
      {error ? <p className="alert-error" role="alert">{error}</p> : null}
      {data && shown.length === 0 ? (
        <p className="ops-inbox__empty">{tab === 'all' ? 'Nothing needs a person right now.' : 'Nothing here.'}</p>
      ) : null}
      <ol className="ops-inbox__list">
        {shown.map((item) => {
          const left = item.time_left_seconds !== null ? item.time_left_seconds - drift : null;
          const sos = item.kind === 'sos';
          return (
            <li key={`${item.kind}-${item.link}-${item.title}`} className={`ops-inbox__item ops-inbox__item--${item.severity}`}>
              <div className="ops-inbox__line">
                <SeverityChip severity={item.severity} />
                <Link href={item.link} className="ops-inbox__title">{item.title}</Link>
              </div>
              <div className="ops-inbox__meta">
                {item.where ? <span>{item.where.name}</span> : null}
                <span className="sg-num">{waited(item.age_seconds + drift)}</span>
                {item.detail ? <span className="ops-inbox__detail">{item.detail}</span> : null}
                {item.viewers?.length ? <span>{item.viewers.join(', ')} viewing</span> : null}
              </div>
              {left !== null ? (
                <div className={`ops-inbox__timer${left < 0 ? ' ops-inbox__timer--late' : ''}`}>
                  <span className="sg-num">{left >= 0 ? `${sosClock(left)} to target` : `${sosClock(-left)} past target`}</span>
                </div>
              ) : null}
              <div className="ops-inbox__foot">
                <span className={item.owner ? 'ops-inbox__owner' : 'ops-inbox__owner ops-inbox__owner--none'}>
                  {item.owner ? `${item.owner.label ?? 'Someone'} has it` : sos || item.kind === 'stuck_trip' ? 'Nobody on it' : ''}
                </span>
                {sos && !(item.owner && String(item.owner.id) === String(me)) ? (
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy === item.link}
                    onClick={() => void takeIt(item)}>
                    {item.actions.includes('acknowledge') ? 'Acknowledge and take it' : 'Take it'}
                  </button>
                ) : (
                  <Link href={item.link} className="sg-btn sg-btn--ghost sg-btn--sm">
                    {item.count > 1 ? 'Open list' : 'Open'}
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
