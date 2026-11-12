'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useLegal } from '@/components/sg/LegalProvider';
import { SUPPORT_EMAIL } from '@/lib/support';
import * as content from '@/lib/legalContent';
import type { Ctx, Doc } from '@/lib/legalContent';
import { Masthead } from './PageShell';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';

export type DocKind = 'riderTerms' | 'driverTerms' | 'privacy' | 'refunds' | 'textMessages' | 'grievance' | 'cookies' | 'deleteAccount';

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

export function DocBody({ doc }: { doc: Doc }) {
  return (
    <>
      <Masthead title={doc.title} lead={doc.lead} />
      <section className="hp hp-section sg-legal-doc">
        {doc.sections.map((s) => {
          const lines = s.p.filter((x): x is string => Boolean(x));
          if (!lines.length) return null;
          return (
            <div className="sg-legal-doc__block" key={s.h}>
              <h2>{s.h}</h2>
              {lines.map((line) => (
                <p key={line.slice(0, 48)}>
                  {content.linkParts(line).map((part, i) => ('href' in part
                    ? <Link key={i} href={part.href}>{part.label}</Link>
                    : <span key={i}>{part.text}</span>))}
                </p>
              ))}
            </div>
          );
        })}
        <p className="sg-legal-doc__updated">Last updated {doc.updated}</p>
      </section>
    </>
  );
}

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
    default: {
      const city = (fares ?? []).find((c) => c.cancellation);
      doc = content.refunds(ctx, city ? content.cancellationLine(city.cancellation, city.currency) : null);
    }
  }
  return <DocBody doc={doc} />;
}

function money(v: string, currency: string) {
  const n = Number(v);
  const symbol = currency === 'USD' ? '$' : '₹';
  return `${symbol}${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

/** /fares: how a fare is worked out, then each city's rate cards and cancellation rule, live. */
export function FaresContent() {
  const { market } = useLegal();
  const cities = useFares(market);
  const india = market === 'IN';
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
        {cities?.map((c) => (
          <div className="sg-legal-doc__block" key={c.zone}>
            <h2>{c.city}{c.city_status === 'soon' ? ' (launching soon)' : ''}</h2>
            <div className="sg-legal-doc__table">
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
                      <th scope="row">{v.vehicle}</th>
                      <td>{money(v.base_fare, c.currency)}</td><td>{money(v.per_distance, c.currency)}</td>
                      <td>{money(v.per_minute, c.currency)}</td><td>{money(v.minimum_fare, c.currency)}</td>
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
            <p>{content.cancellationLine(c.cancellation, c.currency) ?? 'Cancelling is free.'}</p>
          </div>
        ))}
      </section>
    </>
  );
}
