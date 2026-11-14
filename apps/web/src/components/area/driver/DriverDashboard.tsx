'use client';

import Link from 'next/link';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { balance as loadBalance, daily, nextExpiry, period, vehicles as loadVehicles } from '@/lib/area/driver';
import { money, rangeLabel, setMarketZone } from '@/lib/area/format';
import { type FileTile, type Requirements, STEP_INFO, fixAt, setupHref } from '@/lib/area/requirements';
import { blockingLabels, readyToDrive } from '@/lib/area/setupChecks';
import { useLoad } from '@/lib/area/useLoad';
import { IAlert, IDoc } from '../icons';
import { LoadError, Skel } from '../states';
import { DriverTop, WeekChart, useDriver } from './parts';
import { useRequirementsLoad } from './profile/shared';
import { FilePill } from './setup/fields';

/** While not approved: how far setup is, what is next and about how long it takes. */
function SetupCard({ data }: { data: Requirements | null }) {
  const tr = useTr();
  const c = data?.checklist;
  if (!c || readyToDrive(data) || !c.steps?.length) return null;
  if (c.approved) {
    // Approved before the market's checklist, or a paper expired (11 Nov): offline until fixed.
    return (
      <section className="acard dr-setup" data-testid="setup-card" data-held="true">
        <div className="agrow">
          <h2 className="a20">{tr('You cannot go online yet')}</h2>
          <div className="amut">{tr('Fix these first: {items}').replace('{items}', blockingLabels(data).map((l) => tr(l)).join(', '))}</div>
        </div>
        <Link href={fixAt(c.blocking[0])} className="abtn abtn--pri dr-setup__go" data-testid="continue-setup">{tr('Fix now →')}</Link>
      </section>
    );
  }
  const n = c.steps.length;
  const done = c.steps_done ?? 0;
  const next = c.next_step ?? c.steps[0].key;
  return (
    <section className="acard dr-setup" data-testid="setup-card">
      <div className="dr-ring" style={{ background: `conic-gradient(var(--c-green) 0 ${(done / n) * 100}%, var(--c-muted) 0 100%)` }}
        role="img" aria-label={tr('{a} of {n} steps').replace('{a}', String(done)).replace('{n}', String(n))}>
        <span className="ab">{done}/{n}</span>
      </div>
      <div className="agrow">
        <h2 className="a20">{tr('Finish setting up to start driving')}</h2>
        <div className="amut">{tr('Next: {step}. About {n} minutes left.').replace('{step}', tr(STEP_INFO[next].title))
          .replace('{n}', String(Math.max(c.minutes_left ?? 0, 1)))}</div>
      </div>
      <Link href={setupHref(next)} className="abtn abtn--pri dr-setup__go" data-testid="continue-setup">{tr('Continue setup →')}</Link>
    </section>
  );
}

const URGENCY: FileTile['status'][] = ['rejected', 'missing', 'in_review'];

/** The three most urgent files: rejected, then missing, then in review; front before back. */
export function urgentFiles(data: Requirements | null, hasVehicle: boolean): FileTile[] {
  const tiles = (data?.checklist?.items ?? []).filter((i) => i.need === 'required')
    .flatMap((i) => i.files ?? []).filter((f) => hasVehicle || !f.vehicle);
  return URGENCY.flatMap((s) => tiles.filter((f) => f.status === s)).slice(0, 3);
}

function DocumentsCard({ data, hasVehicle, noVehicle, failed, retry }: {
  data: Requirements | null; hasVehicle: boolean; noVehicle: boolean; failed: boolean; retry: () => void;
}) {
  const tr = useTr();
  const rows = urgentFiles(data, hasVehicle);
  return (
    <section className="acard" style={{ padding: 20 }} data-testid="documents-card">
      <div className="arow" style={{ justifyContent: 'space-between' }}>
        <h2 className="a20">{tr('Documents')}</h2>
        <Link href="/driver/documents" className="aacc ab a14 ahit">{tr('Open all')}</Link>
      </div>
      {failed ? <LoadError what="documents" retry={retry} /> : !data ? <Skel h={20} lines={3} gap={18} style={{ marginTop: 16 }} /> : (
        <div style={{ marginTop: 8 }}>
          {rows.length === 0 && <p className="aempty">{tr('All approved')}</p>}
          {rows.map((f) => (
            <div key={f.key} className="arow" style={{ padding: '12px 0', borderTop: '1px solid var(--c-muted)' }} data-file={f.key}>
              <span className="aico"><IDoc /></span>
              <span className="ab agrow">{tr(f.label)}</span>
              <FilePill status={f.status} />
            </div>
          ))}
        </div>
      )}
      {data && noVehicle && <p className="a14 amut" style={{ marginTop: 8 }}>{tr('Vehicle papers appear after you add your vehicle.')}</p>}
    </section>
  );
}

/**
 * /driver (driver-v2-dashboard): the setup card until approved, today's and this week's earnings
 * and what is ready to withdraw, "Your first ride" until the first trip (then the last 7 days),
 * and the three documents that need the driver most.
 */
export function DriverDashboard() {
  const tr = useTr();
  const { locale } = useLocale();
  const me = useDriver();
  // Each card on its own (8 Nov): one failing leaves the others showing.
  const today = useLoad(() => period('today'));
  const week = useLoad(() => period('week'));
  const bal = useLoad(loadBalance);
  const seven = useLoad(daily);
  const req = useRequirementsLoad();
  const car = useLoad(async () => (await loadVehicles())[0] ?? null);

  const t = today.data; const w = week.data; const b = bal.data;
  setMarketZone(t?.timezone ?? seven.data?.timezone);
  const cur = t?.currency ?? w?.currency ?? seven.data?.currency ?? b?.currency ?? null;
  const soon = nextExpiry(me, car.data);
  // Only a profile that loaded says "no trips yet" (11 Nov); a failed one is not a first ride.
  const firstRide = me?.total_trips != null && !(Number(me.total_trips) > 0);
  const days = { ...seven, data: seven.data?.days ?? null };

  return (
    <>
      <DriverTop title={tr('Dashboard')} me={me} />
      <main className="dr-main">
        <SetupCard data={req.data} />
        {soon && (
          <div className="anote">
            <span className="anote__icon"><IAlert /></span>
            <div className="agrow">
              <div className="ab">
                {soon.days < 0
                  ? tr('Your {doc} has expired').replace('{doc}', tr(soon.label).toLowerCase())
                  : tr('Your {doc} expires in {n} days').replace('{doc}', tr(soon.label).toLowerCase()).replace('{n}', `${soon.days}`)}
              </div>
              <div className="a14 amut">{tr('Upload the renewed document so you can keep driving without a break.')}</div>
            </div>
            <Link href="/driver/documents" className="abtn abtn--dark">{tr('Upload renewal')}</Link>
          </div>
        )}
        <div className="dr-grid3">
          <div className="acard acard--ink dr-stat">
            <div className="albl">{tr('Today you earned')}</div>
            {today.state === 'error' ? <LoadError what="earnings" retry={today.retry} ink /> : t ? (
              <>
                <div className="a40">{money(t.net, t.currency, locale)}</div>
                <div className="a14">{tr('{n} trips').replace('{n}', `${t.trips}`)}</div>
              </>
            ) : <Skel h={40} w={140} />}
          </div>
          <div className="acard dr-stat">
            <div className="albl">{tr('This week')}</div>
            {week.state === 'error' ? <LoadError what="earnings" retry={week.retry} /> : w ? (
              <>
                <div className="a40">{money(w.net, w.currency, locale)}</div>
                <div className="a14">{rangeLabel(w.start, w.end, locale)} · {tr('{n} trips').replace('{n}', `${w.trips}`)}</div>
              </>
            ) : <Skel h={40} w={140} />}
          </div>
          <div className="acard dr-stat">
            <div className="albl">{tr('Ready to withdraw')}</div>
            {bal.state === 'error' ? <LoadError what="balance" retry={bal.retry} /> : b ? (
              <div className="a40">{money(b.available_balance ?? 0, b.currency ?? cur, locale)}</div>
            ) : <Skel h={40} w={140} />}
            {/* Idaho bans cash (49-3712): the cash half of the line only where cash is taken. */}
            {today.data?.cash_allowed !== false && <div className="a14">{tr('Earned minus cash you collected')}</div>}
          </div>
        </div>
        <div className="dr-grid2">
          {firstRide ? (
            <section className="acard" style={{ padding: 20 }} data-testid="first-ride">
              <h2 className="a20">{tr('Your first ride')}</h2>
              <p className="amut" style={{ marginTop: 4 }}>{tr("Once you're approved, go online in the driver app. Requests show your earning before you accept.")}</p>
              <div className="arow" style={{ gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
                <Link href="/drive" className="abtn abtn--ghost">{tr('How our fee works')}</Link>
                <Link href="/driver/support" className="abtn abtn--ghost">{tr('Driver guide')}</Link>
              </div>
            </section>
          ) : (
            <section className="acard" style={{ padding: 20 }}>
              <div className="arow" style={{ justifyContent: 'space-between' }}>
                <h2 className="a20">{tr('Last 7 days')}</h2>
                <Link href="/driver/earnings" className="aacc ab a14 ahit">{tr('See earnings')}</Link>
              </div>
              <WeekChart load={days} currency={cur} />
            </section>
          )}
          <DocumentsCard data={req.data} hasVehicle={car.state !== 'ok' || !!car.data} noVehicle={car.state === 'ok' && !car.data}
            failed={req.state === 'error'} retry={req.retry} />
        </div>
      </main>
    </>
  );
}
