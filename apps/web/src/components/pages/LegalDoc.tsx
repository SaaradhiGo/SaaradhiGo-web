'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLegal } from '@/components/sg/LegalProvider';
import { SUPPORT_EMAIL } from '@/lib/support';
import { usEnglish, usEnglishDeep } from '@/i18n/usEnglish';
import * as content from '@/lib/legalContent';
import type { Ctx, Doc } from '@/lib/legalContent';
import { Masthead } from './PageShell';
import { useTr } from '@/i18n/website';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export type DocKind = 'riderTerms' | 'driverTerms' | 'privacy' | 'refunds' | 'textMessages' | 'grievance' | 'cookies' | 'deleteAccount'
  | 'zeroTolerance' | 'accessibility';

type FareCity = {
  zone: string; city: string; city_status: string; country: string; currency: string;
  distance_unit: string; tax_mode: string; tax_label: string;
  vehicles: { vehicle: string; base_fare: string; per_distance: string; per_minute: string;
    minimum_fare: string; night_multiplier: string; night_hours: [number, number];
    demand_band: { max_dynamic_multiplier: string; min_dynamic_multiplier: string | null } }[];
  cancellation: { percent: string; cap_minor: number | null; free_seconds: number } | null;
};

/** The public rate cards for a market (GET /pricing/fares/), or [] while loading or on error. */
export function useFares(country: string) {
  const [cities, setCities] = useState<FareCity[] | null>(null);
  useEffect(() => {
    let alive = true;
    setCities(null);
    fetch(`${API}/pricing/fares/?country=${country}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => alive && setCities(b?.data?.cities ?? []))
      .catch(() => alive && setCities([]));
    return () => { alive = false; };
  }, [country]);
  return cities;
}

/** The other policies, listed under every document so a reader never hunts the footer. */
const POLICIES: { href: string; label: string; only?: 'IN' | 'US' }[] = [
  { href: '/terms', label: 'Rider terms' },
  { href: '/driver-terms', label: 'Driver terms' },
  { href: '/privacy', label: 'Privacy policy' },
  { href: '/cookies', label: 'Cookie notice' },
  { href: '/refunds', label: 'Refunds and cancellations' },
  { href: '/text-messages', label: 'Text messages' },
  { href: '/zero-tolerance', label: 'Zero tolerance', only: 'US' },
  { href: '/accessibility', label: 'Accessibility', only: 'US' },
  { href: '/grievance', label: 'Grievance redressal', only: 'IN' },
  { href: '/delete-account', label: 'Delete your account' },
];

const slug = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * A policy document (20 Nov, owner: "basic UI sense"). One column the reader keeps: a masthead
 * with who it applies to and when it changed, a numbered contents list (sticky beside the text
 * on a wide screen, folded above it on a phone), numbered sections, then the other policies.
 */
export function DocBody({ doc, entityName, path, market }: { doc: Doc; entityName?: string; path?: string; market?: string }) {
  const tr = useTr();
  const sections = doc.sections
    .map((s) => ({ ...s, lines: s.p.filter((x): x is string => Boolean(x)) }))
    .filter((s) => s.lines.length);
  const toc = (
    <ol className="lg-toc__list">
      {sections.map((s, i) => (
        <li key={s.h}><a href={`#${slug(s.h)}`}><span className="lg-num">{i + 1}</span>{s.h}</a></li>
      ))}
    </ol>
  );
  return (
    <article className="lg">
      <header className="lg-head">
        <div className="hp">
          <p className="lg-kicker">{tr('Legal')}</p>
          <h1 className="lg-title">{doc.title}</h1>
          <p className="lg-lead">{doc.lead}</p>
          <p className="lg-meta">
            <span>{tr('Last updated')} {doc.updated}</span>
            {entityName && <span>{tr('Operated by')} {entityName}</span>}
          </p>
        </div>
      </header>
      <div className="hp lg-body">
        {sections.length > 2 && (
          <nav className="lg-toc" aria-label={tr('On this page')}>
            <details className="lg-toc__fold">
              <summary>{tr('On this page')}</summary>
              {toc}
            </details>
            <div className="lg-toc__side">
              <p className="lg-toc__title">{tr('On this page')}</p>
              {toc}
            </div>
          </nav>
        )}
        <div className="lg-text">
          {sections.map((s, i) => (
            <section className="lg-sec" id={slug(s.h)} key={s.h}>
              <h2><span className="lg-num" aria-hidden="true">{i + 1}</span>{s.h}</h2>
              {s.lines.map((line) => (
                <p key={line.slice(0, 48)}>
                  {content.linkParts(line).map((part, j) => ('href' in part
                    ? <Link key={j} href={part.href}>{part.label}</Link>
                    : <span key={j}>{part.text}</span>))}
                </p>
              ))}
            </section>
          ))}
          <aside className="lg-more" aria-label={tr('Other policies')}>
            <p className="lg-more__title">{tr('Other policies')}</p>
            <ul>
              {POLICIES.filter((x) => x.href !== path && (!x.only || x.only === market)).map((x) => (
                <li key={x.href}><Link href={x.href}>{tr(x.label)}</Link></li>
              ))}
            </ul>
            <p className="lg-more__ask">{tr('Questions about this page? Write to')} <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
          </aside>
        </div>
      </div>
    </article>
  );
}

const PATH: Record<DocKind, string> = {
  riderTerms: '/terms', driverTerms: '/driver-terms', privacy: '/privacy', refunds: '/refunds',
  textMessages: '/text-messages', grievance: '/grievance', cookies: '/cookies', deleteAccount: '/delete-account',
  zeroTolerance: '/zero-tolerance', accessibility: '/accessibility',
};

export function LegalDoc({ kind }: { kind: DocKind }) {
  const { market, entity, legal } = useLegal();
  // Grievance redressal is the Indian process: it always names the India entity.
  const ctx: Ctx = kind === 'grievance'
    ? { market: 'IN', entity: legal.IN, supportEmail: SUPPORT_EMAIL }
    : { market, entity, supportEmail: SUPPORT_EMAIL };
  const fares = useFares(kind === 'refunds' ? market : '');
  let doc: Doc;
  switch (kind) {
    case 'riderTerms': doc = content.riderTerms(ctx); break;
    case 'driverTerms': doc = content.driverTerms(ctx); break;
    case 'privacy': doc = content.privacy(ctx); break;
    case 'textMessages': doc = content.textMessages(ctx); break;
    case 'grievance': doc = content.grievance(ctx); break;
    case 'cookies': doc = content.cookies(ctx); break;
    case 'deleteAccount': doc = content.deleteAccount(ctx); break;
    case 'zeroTolerance': doc = content.zeroTolerance(ctx); break;
    case 'accessibility': doc = content.accessibility(ctx); break;
    default: {
      const city = (fares ?? []).find((c) => c.cancellation);
      doc = content.refunds(ctx, city ? content.cancellationLine(city.cancellation, city.currency) : null);
    }
  }
  // 14 Nov (owner): US spelling for US visitors only; spelling, never meaning. India keeps UK English.
  return <DocBody doc={ctx.market === 'US' ? usEnglishDeep(doc) : doc} entityName={ctx.entity?.legal_name} path={PATH[kind]} market={ctx.market} />;
}

function money(v: string, currency: string) {
  const n = Number(v);
  const symbol = currency === 'USD' ? '$' : '₹';
  return `${symbol}${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/** /fares: how a fare is worked out, then each city's rate cards and cancellation rule, live. */
/** The rider-facing class names (src/lib/vehicles.ts: `hatchback` is sold as Mini). */
const VEHICLE_NAME: Record<string, string> = { auto: 'Auto', hatchback: 'Mini', mini: 'Mini', sedan: 'Sedan', suv: 'SUV', bike: 'Bike' };

export function FaresContent() {
  const { market } = useLegal();
  const cities = useFares(market);
  const india = market === 'IN';
  const say = (t: string) => (india ? t : usEnglish(t));
  return (
    <>
      <Masthead title="Fares" lead="How SaaradhiGo works out a fare, and the rates in each city." />
      <section className="hp hp-section sg-legal-doc">
        <div className="sg-legal-doc__block">
          <h2>How a fare is worked out</h2>
          <p>Every fare is a base fare, plus a rate for the distance, plus a rate for the time the trip takes. If that comes to less than the minimum fare, you pay the minimum.</p>
          <p>{india
            ? 'When many people are booking at once the fare can go up, and when few are it can go down, but only within the band set for the city under the Motor Vehicles Aggregator Guidelines 2025. The fare you see before you book is the fare you pay unless the trip changes.'
            : 'When many people are booking at once the fare can go up, within the limit set for the city. The fare you see before you book is the fare you pay unless the trip changes.'}</p>
          <p>{india
            ? 'Any tax that applies is included in the fare shown.'
            : 'Sales tax, and any flat fee the city sets, are shown as separate lines before you book.'}</p>
          <p>The receipt lists every line of the fare so you can check it.</p>
        </div>
        {cities === null && <p className="sg-legal-doc__updated">Loading rates…</p>}
        {cities?.length === 0 && <p>Rates for {india ? 'India' : 'the United States'} are published here when a city opens.</p>}
        {cities?.map((c) => (c.city_status !== 'live' ? (
          // 13 Nov (owner): a city not yet open in the launch gate shows no rates.
          <div className="sg-legal-doc__block" key={c.zone} data-testid="fares-soon">
            <h2>{c.city}</h2>
            <p>Coming soon.</p>
          </div>
        ) : (
          <div className="sg-legal-doc__block" key={c.zone} data-testid="fares-city">
            <h2>{c.city}</h2>
            <div className="sg-legal-doc__table" tabIndex={0} role="region" aria-label={`Rates in ${c.city}`}>
              <table>
                <caption className="sr-only">Rates in {c.city}</caption>
                <thead>
                  <tr><th scope="col">Vehicle</th><th scope="col">Base fare</th>
                    <th scope="col">Per {c.distance_unit === 'mi' ? 'mile' : 'km'}</th>
                    <th scope="col">Per minute</th><th scope="col">Minimum fare</th></tr>
                </thead>
                <tbody>
                  {c.vehicles.map((v) => (
                    <tr key={v.vehicle}>
                      <th scope="row">{VEHICLE_NAME[v.vehicle] ?? v.vehicle}</th>
                      <td data-label="Base fare">{money(v.base_fare, c.currency)}</td>
                      <td data-label={`Per ${c.distance_unit === 'mi' ? 'mile' : 'km'}`}>{money(v.per_distance, c.currency)}</td>
                      <td data-label="Per minute">{money(v.per_minute, c.currency)}</td>
                      <td data-label="Minimum fare">{money(v.minimum_fare, c.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {c.vehicles[0] && Number(c.vehicles[0].night_multiplier) > 1 && (
              <p>Between {c.vehicles[0].night_hours[0]}:00 and {c.vehicles[0].night_hours[1]}:00 the fare is multiplied by {Number(c.vehicles[0].night_multiplier)}.</p>
            )}
            {c.vehicles[0] && (
              <p>Demand pricing stays between {Number(c.vehicles[0].demand_band.min_dynamic_multiplier ?? 1)}× and {Number(c.vehicles[0].demand_band.max_dynamic_multiplier)}× the normal fare.</p>
            )}
            <p>{say(content.cancellationLine(c.cancellation, c.currency) ?? 'Cancelling is free.')}</p>
          </div>
        )))}
      </section>
    </>
  );
}
