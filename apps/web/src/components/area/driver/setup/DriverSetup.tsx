'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useTr } from '@/i18n/website';
import { vehicles as loadVehicles } from '@/lib/area/driver';
import { dateOrder } from '@/lib/area/format';
import {
  type Step, type StepKey, STEP_INFO, setupHref, stepFromSlug, stepSub,
} from '@/lib/area/requirements';
import { blockingLabels, readyToDrive, stepWords } from '@/lib/area/setupChecks';
import { useLoad } from '@/lib/area/useLoad';
import { IBack, ICheck, IClock } from '../../icons';
import { LoadError, Skel } from '../../states';
import { DriverTop, useDriver } from '../parts';
import { useRequirementsLoad } from '../profile/shared';
import { CheckContext, SaveContext, useChecks, useSaveState } from './fields';
import { type Car, STEP_BODY } from './steps';

function StepMark({ step, current }: { step: Step; current: boolean }) {
  const tr = useTr();
  const s = step.status;
  const cls = current ? 'su-mark--current' : s === 'done' ? 'su-mark--done' : s === 'in_review' ? 'su-mark--review'
    : s === 'action' ? 'su-mark--action' : 'su-mark--todo';
  return (
    <span className={`su-mark ${cls}`} role="img" aria-label={tr(stepWords(s, step.key))}>
      {!current && s === 'done' ? <ICheck size={18} /> : !current && s === 'in_review' ? <IClock size={18} />
        : !current && s === 'action' ? '!' : step.number}
    </span>
  );
}

/** "Saved automatically", or what is happening with the last save. */
function SaveNote({ saving, error }: { saving: number; error: string | null }) {
  const tr = useTr();
  if (error) return <span className="a14 ared" role="alert">{error}</span>;
  return <span className="a14 amut" role="status">{tr(saving ? 'Saving…' : 'Saved automatically')}</span>;
}

/**
 * /driver/setup/[step] (driver-v2-onboarding): the six steps on the left with their state, the
 * open step on the right. Every step can be opened in any order; fields save as the driver
 * leaves them; "Save and continue" opens the next step (or, from Profile, goes back there).
 */
export function DriverSetup({ slug }: { slug: string }) {
  const tr = useTr();
  const router = useRouter();
  const search = useSearchParams();
  const fromProfile = search?.get('from') === 'profile';
  const me = useDriver();
  const load = useRequirementsLoad();
  const cars = useLoad(loadVehicles);
  const saver = useSaveState();
  const checks = useChecks();
  const [moving, setMoving] = useState(false);
  const data = load.data;
  const c = data?.checklist;
  const steps = c?.steps ?? [];
  const key: StepKey | null = stepFromSlug(slug) ?? c?.next_step ?? steps[0]?.key ?? null;
  const step = steps.find((s) => s.key === key) ?? steps[0];
  const at = step ? steps.indexOf(step) : -1;
  const prev = at > 0 ? steps[at - 1] : null;
  const next = at >= 0 && at < steps.length - 1 ? steps[at + 1] : null;
  const car = (cars.data?.[0] ?? null) as Car | null;
  const Body = step ? STEP_BODY[step.key] : null;
  const minutes = c?.minutes_left ?? 0;
  const ready = readyToDrive(data);
  const held = !!c?.approved && !ready;
  const sub = !c ? null : ready ? tr("You're approved to drive")
    : held ? tr('Approved, but offline until: {items}').replace('{items}', blockingLabels(data).map((l) => tr(l)).join(', '))
      : step ? tr('Step {n} of {total} · about {m} minutes left').replace('{n}', String(step.number))
        .replace('{total}', String(steps.length)).replace('{m}', String(Math.max(minutes, 1))) : null;
  const done = c?.steps_done ?? 0;

  function go(to: StepKey | null) {
    if (fromProfile) router.push('/driver/profile');
    else router.push(to ? setupHref(to) : '/driver');
  }

  /** Save and continue / return (11 Nov): wait for the saves, check every field, move only when all is well. */
  async function saveAndMove() {
    setMoving(true);
    try {
      const saved = await saver.settled();
      const ok = checks.runAll();
      if (!saved || !ok) {
        requestAnimationFrame(() => (document.querySelector('[data-testid="setup-step"] [role="alert"]') as HTMLElement | null)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
        return;
      }
      (load.refresh ?? load.retry)();
      go(next?.key ?? null);
    } finally { setMoving(false); }
  }

  return (
    <>
      <DriverTop title={tr('Get ready to drive')} sub={sub} me={me} />
      <main className="dr-main">
        {load.state === 'error' && <LoadError what="profile" retry={load.retry} />}
        {!data && load.state !== 'error' && <Skel h={420} />}
        {data && c && step && Body && (
          <div className="su">
            <nav className="acard su-steps" aria-label={tr('Setup steps')} data-testid="setup-steps">
              <div className="su-progress">
                <div className="arow" style={{ justifyContent: 'space-between' }}>
                  <span className="ab">{tr('Your progress')}</span>
                  <span className="a14 amut" data-testid="steps-done">{tr('{a} of {n} steps').replace('{a}', String(done)).replace('{n}', String(steps.length))}</span>
                </div>
                <div className="su-bar"><div style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} /></div>
              </div>
              {steps.map((s) => (
                <Link key={s.key} href={setupHref(s.key, fromProfile ? 'profile' : undefined)} data-step={s.key} data-state={s.status}
                  className={`su-step${s.key === step.key ? ' su-step--current' : ''}`} aria-current={s.key === step.key ? 'step' : undefined}>
                  <StepMark step={s} current={s.key === step.key} />
                  <span className="agrow">
                    <span className="ab" style={{ display: 'block' }}>{tr(STEP_INFO[s.key].title)}</span>
                    <span className="a14 amut" style={{ display: 'block' }}>{stepSub(s, tr)}</span>
                  </span>
                </Link>
              ))}
              {!ready && <p className="a14 amut su-foot">{tr('You can go online once every step is approved. We usually review within one working day.')}</p>}
            </nav>
            <section className="acard su-card" data-testid="setup-step" data-current={step.key}>
              {fromProfile && (
                <Link href="/driver/profile" className="arow aacc ab a14" style={{ gap: 4, textDecoration: 'none' }}><IBack size={16} />{tr('Back to Profile')}</Link>
              )}
              {ready && (
                <div className="su-approved" data-testid="approved"><ICheck size={20} /><span className="ab">{tr("You're approved to drive")}</span></div>
              )}
              {held && (
                <div className="anote" data-testid="approved-held" role="note">
                  <div className="agrow"><div className="ab">{tr('You are approved, but you cannot go online yet')}</div>
                    <div className="a14 amut">{tr('Fix these first: {items}').replace('{items}', blockingLabels(data).map((l) => tr(l)).join(', '))}</div></div>
                </div>
              )}
              <div>
                <div className="albl">{tr('Step {n} of {total}').replace('{n}', String(step.number)).replace('{total}', String(steps.length))}</div>
                <h2 className="a28" style={{ marginTop: 4 }}>{tr(STEP_INFO[step.key].title)}</h2>
                <p className="amut">{tr(STEP_INFO[step.key].lead)}</p>
              </div>
              <SaveContext.Provider value={saver}>
                <CheckContext.Provider value={checks.ctx}>
                  <Body key={step.key + String(car?.id ?? '')} data={data} reload={load.refresh ?? load.retry} order={dateOrder(data.config.country)}
                    car={car} reloadCar={cars.refresh ?? cars.retry} />
                </CheckContext.Provider>
              </SaveContext.Provider>
              <div className="su-actions">
                {prev || fromProfile ? (
                  <Link href={fromProfile ? '/driver/profile' : setupHref(prev!.key)} className="abtn abtn--ghost"><IBack size={18} />{tr('Back')}</Link>
                ) : <span />}
                <div className="arow" style={{ gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <SaveNote saving={saver.state.saving} error={saver.state.error} />
                  <button type="button" className="abtn abtn--pri" data-testid="save-continue" disabled={moving}
                    onClick={() => void saveAndMove()}>
                    {tr(fromProfile ? 'Save and return' : next ? 'Save and continue' : 'Finish')}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
