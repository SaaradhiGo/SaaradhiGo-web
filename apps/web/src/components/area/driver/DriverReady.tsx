'use client';

import Link from 'next/link';
import { useTr } from '@/i18n/website';
import { FIX_AT, type ChecklistItem, requirements as loadRequirements } from '@/lib/area/requirements';
import { useLoad } from '@/lib/area/useLoad';
import { LoadError, Skel } from '../states';
import { StatusPill } from './profile/shared';
import { DriverTop, useDriver } from './parts';

const SECTIONS: [ChecklistItem['section'], string][] = [
  ['personal', 'About you'], ['identity', 'Identity and checks'], ['vehicle', 'Your vehicle'], ['payouts', 'Payouts'],
];
const DONE = ['approved', 'done', 'expiring'];

/**
 * /driver/ready (10 Nov): every item the driver's market asks for, its status and where to fix
 * it, and how far along they are. Going online waits for every item marked as blocking.
 */
export function DriverReady() {
  const tr = useTr();
  const me = useDriver();
  const load = useLoad(loadRequirements);
  const c = load.data?.checklist;
  const blocking = c ? c.items.filter((i) => c.blocking.includes(i.key)) : [];

  return (
    <>
      <DriverTop title={tr('Get ready to drive')} me={me} />
      <main className="dr-main">
        {load.state === 'error' && <LoadError what="profile" retry={load.retry} />}
        {load.state === 'loading' && <Skel h={120} />}
        {c && (
          <section className="acard" style={{ padding: 20 }} data-testid="ready-progress">
            <h2 className="a20">{tr('{a} of {n} done').replace('{a}', String(c.done)).replace('{n}', String(c.total))}</h2>
            <div style={{ marginTop: 12, height: 10, borderRadius: 5, background: 'var(--c-muted)' }}>
              <div style={{ width: `${c.total ? (c.done / c.total) * 100 : 0}%`, height: 10, borderRadius: 5, background: 'var(--c-green)' }} />
            </div>
            <p className="a14 amut" style={{ marginTop: 12 }}>
              {c.approved ? tr('You are approved. Keep your documents up to date to stay online.')
                : blocking.length ? tr('You can go online once these are done and approved: {list}.').replace('{list}', blocking.map((i) => tr(i.label)).join(', '))
                  : tr('Everything is in. Our team reviews it, usually the same day.')}
            </p>
          </section>
        )}
        {c && SECTIONS.map(([key, title]) => {
          const rows = c.items.filter((i) => i.section === key);
          if (!rows.length) return null;
          return (
            <section key={key} className="acard" style={{ padding: '8px 20px' }}>
              <h2 className="a20" style={{ padding: '12px 0' }}>{tr(title)}</h2>
              {rows.map((i) => (
                <div key={i.key} className="arow" data-item={i.key} style={{ padding: '12px 0', borderTop: '1px solid var(--c-border)', gap: 12, flexWrap: 'wrap' }}>
                  <div className="agrow" style={{ minWidth: 0 }}>
                    <div className="ab">{tr(i.label)}{i.need === 'optional' && <span className="a14 amut"> · {tr('optional')}</span>}</div>
                    <div className="a14 amut">{tr(i.help)}</div>
                    {i.reason && !DONE.includes(i.status) && <div className="a14 ared">{i.reason}</div>}
                  </div>
                  <StatusPill it={i} />
                  {!DONE.includes(i.status) && i.status !== 'in_review' && FIX_AT[i.key] && (
                    <Link href={FIX_AT[i.key]} className="abtn abtn--ghost a14" style={{ height: 36, padding: '0 14px' }}>
                      {tr(i.status === 'rejected' ? 'Fix' : 'Add')}
                    </Link>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </main>
    </>
  );
}

/** The Dashboard's pointer to the checklist, for a driver who is not approved yet. */
export function ReadyCard() {
  const tr = useTr();
  const load = useLoad(loadRequirements);
  const c = load.data?.checklist;
  if (!c || c.approved) return null;
  return (
    <section className="acard arow" style={{ padding: 20, gap: 12, flexWrap: 'wrap', borderColor: 'var(--c-warn-border)', borderWidth: 2 }} data-testid="ready-card">
      <div className="agrow">
        <h2 className="a20">{tr('Get ready to drive')}</h2>
        <div className="amut">{tr('{a} of {n} done').replace('{a}', String(c.done)).replace('{n}', String(c.total))}</div>
      </div>
      <Link href="/driver/ready" className="abtn abtn--dark">{tr('See what is left')}</Link>
    </section>
  );
}
