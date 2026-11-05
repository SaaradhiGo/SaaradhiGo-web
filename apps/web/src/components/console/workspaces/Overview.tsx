'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { type AdminAccess, can, withScope, writeSelectedScope } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { canReadLive, canSeeAggregate, cellSentence, dotsInCity, shadeLevel } from '@/lib/liveOps';
import { useHeatmap, useLiveOps } from '@/lib/useLiveOps';
import type { IntegrationsPayload } from '@/lib/platform';
import { formatWhole } from '@/lib/trips';
import {
  type CitySquare, type Health, type PlaceRow, type PlacesResponse, type PulseResponse,
  HEALTH_WORD, againstUsual,
} from '@/lib/workspace';
import { LiveMap } from '@/components/console/liveops/LiveMap';
import { HealthChip, StatusChip } from '@/components/console/kit/StatusChip';
import { MetricCard } from '@/components/console/kit/MetricCard';
import { NeedsActionInbox } from '@/components/console/kit/NeedsActionInbox';
import { SuperAdminBanner } from '@/components/console/command-centre/SuperAdminBanner';
import { SelfApprovalNotice } from '@/components/console/SelfApprovalNotice';
import { ErrorState, Skeleton } from '@/components/console/ui';

/**
 * The Overview (owner, 2026-11-03; design boards C and D). One page, three
 * altitudes, chosen by the operator's place:
 *
 *   Global or a country/state -> every city as a health square, the place
 *                                 table one row per child, Needs action,
 *                                 platform health, money per currency;
 *   a city                     -> the map-first city workspace: four numbers
 *                                 against their usual range, the supply and
 *                                 demand map, a "why" that is computed from
 *                                 the data or not shown, the hourly line, and
 *                                 Needs action beside it.
 *
 * Every figure comes from `command-centre/admin/places/` (five-minute rollups)
 * and `pulse/`; nothing here invents a number. No block repeats per city.
 */

const RANK: Record<Health, number> = { critical: 0, watch: 1, normal: 2, quiet: 3 };

export function goToPlace(code: string | null) {
  writeSelectedScope(code);
  window.location.assign('/dashboard');
}

function usePlaces() {
  const [data, setData] = useState<PlacesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setData(await api.get<PlacesResponse>(withScope('/command-centre/admin/places/?window=today')));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError && e.fromServer ? e.message : 'The overview could not be loaded.');
    }
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [load]);
  return { data, error, reload: load };
}

export function Overview({ access }: { access: AdminAccess | null }) {
  const { data, error, reload } = usePlaces();
  if (error && !data) return <ErrorState title="The overview could not be loaded" detail={error} onRetry={() => void reload()} />;
  if (!data) return <Skeleton kind="block" count={3} />;
  if (data.node?.kind === 'city') return <CityWorkspace access={access} places={data} />;
  return <PlaceWorkspace access={access} places={data} />;
}

// ---------------------------------------------------------------------------
// Global, a country or a state (board C)
// ---------------------------------------------------------------------------

function fmt(n: number | null | undefined) {
  return typeof n === 'number' ? n.toLocaleString('en-IN') : '—';
}

function rateCell(row: PlaceRow) {
  if (!row.requests) return <span className="muted">—</span>;
  if (!row.rates_reliable) return <span className="muted">Not enough data yet</span>;
  return <>{row.unfulfilled_rate}%</>;
}

function PlaceWorkspace({ access, places }: { access: AdminAccess | null; places: PlacesResponse }) {
  const node = places.node;
  const t = places.totals;
  const childWord = node?.kind === 'global' ? 'Country' : node?.kind === 'country' ? 'State' : 'City';
  const byCountry = useMemo(() => {
    const groups = new Map<string, CitySquare[]>();
    for (const c of places.cities) {
      const key = c.country ?? '—';
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    return Array.from(groups.entries()).map(([country, cities]) => ({
      country,
      name: places.children.find((r) => r.code === country)?.name
        ?? places.quiet.find((r) => r.code === country)?.name
        ?? places.breadcrumb.find((b) => b.code === country)?.name ?? country,
      cities: [...cities].sort((a, b) => RANK[a.health] - RANK[b.health] || a.name.localeCompare(b.name)),
    })).sort((a, b) => b.cities.length - a.cities.length);
  }, [places]);
  const counts = places.health_counts;
  const money = t.collected_minor ? Object.entries(t.collected_minor) : null;

  return (
    <div className="ops-ws">
      <SuperAdminBanner access={access} />
      <SelfApprovalNotice />
      <header className="ops-ws__head">
        <div>
          <nav className="ops-crumbs" aria-label="Place">
            {places.breadcrumb.slice(0, -1).map((b) => (
              <button key={b.code} type="button" className="ops-crumbs__link" onClick={() => goToPlace(b.kind === 'global' ? null : b.code)}>
                {b.name} ›
              </button>
            ))}
          </nav>
          <h1>{node?.name ?? 'Overview'}</h1>
          <p className="sg-num">
            {t.live_cities} live {t.live_cities === 1 ? 'city' : 'cities'}
            {t.paused_cities ? ` · ${t.paused_cities} not live` : ''}
            {` · ${fmt(t.requests)} requests today · ${fmt(t.drivers_online)} drivers online`}
            {t.sos_active ? ` · ${t.sos_active} SOS active` : ''}
          </p>
        </div>
      </header>

      <div className="ops-ws__grid ops-ws__grid--c">
        <div className="ops-ws__main">
        <section className="ops-card" aria-label="Every city at a glance">
          <header className="ops-card__head">
            <div>
              <h2>Every city at a glance</h2>
              <p>One square per city, worst first in each country. Choose a square to open that city.</p>
            </div>
            <div className="ops-legend" aria-label="Legend">
              {(['critical', 'watch', 'normal', 'quiet'] as Health[]).map((h) => (
                <span key={h} className="ops-legend__item">
                  <span className={`ops-square ops-square--${h}`} aria-hidden="true" />
                  {HEALTH_WORD[h]} <span className="sg-num">{counts[h] ?? 0}</span>
                </span>
              ))}
            </div>
          </header>
          <div className="ops-squares">
            {byCountry.map((g) => {
              const crit = g.cities.filter((c) => c.health === 'critical').length;
              const watch = g.cities.filter((c) => c.health === 'watch').length;
              return (
                <div key={g.country} className="ops-squares__row">
                  <div className="ops-squares__name"><b>{g.name}</b><span className="sg-num">{g.cities.length} cities</span></div>
                  <div className="ops-squares__grid">
                    {g.cities.map((c) => (
                      <button key={c.code} type="button" className={`ops-square ops-square--${c.health}`}
                        title={`${c.name}: ${HEALTH_WORD[c.health]}${c.health_reason ? ` (${c.health_reason})` : ''}`}
                        aria-label={`${c.name}: ${HEALTH_WORD[c.health]}${c.health_reason ? `, ${c.health_reason}` : ''}`}
                        onClick={() => goToPlace(c.code)} />
                    ))}
                  </div>
                  <div className="ops-squares__sum sg-num">
                    {crit || watch ? `${crit ? `${crit} critical` : ''}${crit && watch ? ' · ' : ''}${watch ? `${watch} watch` : ''}` : 'all normal'}
                  </div>
                </div>
              );
            })}
          </div>
        </section>


      <section className="ops-card" aria-label={`${childWord} by ${childWord.toLowerCase()}`}>
        <header className="ops-card__head">
          <div><h2>{childWord === 'Country' ? 'Countries' : childWord === 'State' ? 'States' : 'Cities'}</h2>
            <p>Worst first. Choose a row to open it.</p></div>
        </header>
        <div className="ops-list__table">
          <table>
            <caption className="sr-only">{childWord} table</caption>
            <thead>
              <tr>
                <th scope="col">{childWord}</th><th scope="col">Status</th><th scope="col" className="num">Requests today</th>
                <th scope="col" className="num">Completed</th><th scope="col" className="num">Unfulfilled</th>
                <th scope="col" className="num">Drivers online</th><th scope="col" className="num">Active SOS</th>
                <th scope="col" className="num">Stuck trips</th><th scope="col">Worst city</th>
              </tr>
            </thead>
            <tbody>
              {places.children.map((r) => (
                <tr key={r.code} className="is-link" tabIndex={0}
                  onClick={() => goToPlace(r.code)}
                  onKeyDown={(e) => { if (e.key === 'Enter') goToPlace(r.code); }}>
                  <td className="primary">{r.name}</td>
                  <td><HealthChip health={r.health} reason={r.health_reason} /></td>
                  <td className="num">{fmt(r.requests)}</td>
                  <td className="num">{fmt(r.completed)}</td>
                  <td className="num">{rateCell(r)}</td>
                  <td className="num">{fmt(r.drivers_online)}</td>
                  <td className="num">{r.sos_active ? <b className="ops-text--critical">{r.sos_active}</b> : 0}</td>
                  <td className="num">{fmt(r.stuck_trips)}</td>
                  <td>{r.worst_city ? `${r.worst_city.name}${r.worst_city.reason ? ` · ${r.worst_city.reason}` : ''}` : '—'}</td>
                </tr>
              ))}
              {places.quiet.length ? (
                <tr className="ops-row--quiet">
                  <td colSpan={9}>{places.quiet.length} with no activity today: {places.quiet.map((q) => q.name).join(', ')}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

        </div>
        <NeedsActionInbox access={access} placeName={node?.name} compact limit={8} />
      </div>

      <div className="ops-ws__grid ops-ws__grid--2">
        {money ? (
          <section className="ops-card" aria-label="Money today">
            <header className="ops-card__head"><div><h2>Money today</h2><p>Fares from trips completed today, per currency. Nothing adds two currencies.</p></div>
              {canOpen(access, 'finance') ? <Link href="/finance" className="sg-btn sg-btn--ghost sg-btn--sm">Money overview</Link> : null}</header>
            <dl className="ops-money">
              {money.length === 0 ? <p className="muted">No completed trips yet today.</p> : money.map(([cur, minor]) => (
                <div key={cur}><dt>{cur}</dt><dd className="sg-num">{formatWhole(minor, cur)}</dd></div>
              ))}
            </dl>
          </section>
        ) : null}
        {can(access, 'platform.integrations.read') || can(access, 'platform.read') ? <PlatformHealth /> : null}
      </div>
    </div>
  );
}

function PlatformHealth() {
  const [data, setData] = useState<IntegrationsPayload | null>(null);
  useEffect(() => { void api.get<IntegrationsPayload>('/platform/admin/integrations/').then(setData).catch(() => setData(null)); }, []);
  if (!data) return null;
  const rows = data.rows.slice(0, 8);
  return (
    <section className="ops-card" aria-label="Platform health">
      <header className="ops-card__head"><div><h2>Platform health</h2><p>What each provider is set to, and when it last worked.</p></div>
        <Link href="/settings/integrations" className="sg-btn sg-btn--ghost sg-btn--sm">Integrations</Link></header>
      <ul className="ops-health">
        {rows.map((r) => (
          <li key={`${r.type}-${r.country}`}>
            <span>{r.label} · {r.country}</span>
            <StatusChip tone={r.mode === 'live' ? 'good' : r.mode === 'off' ? 'critical' : 'caution'}>
              {r.mode === 'live' ? 'Live' : r.mode === 'off' ? 'Off' : r.mode === 'stubbed' ? 'Stubbed' : 'Sandbox'}
            </StatusChip>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// A city (board D)
// ---------------------------------------------------------------------------

function usePulse() {
  const [data, setData] = useState<PulseResponse | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.get<PulseResponse>(withScope('/command-centre/admin/pulse/'))
      .then((d) => { if (alive) setData(d); }).catch(() => undefined);
    void load();
    const t = window.setInterval(load, 60_000);
    return () => { alive = false; window.clearInterval(t); };
  }, []);
  return data;
}

function cityClock(tz: string | null | undefined, now: number) {
  if (!tz) return '';
  try {
    const text = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
    return `${text} ${tz === 'Asia/Kolkata' ? 'IST' : new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'short' }).formatToParts(now).find((p) => p.type === 'timeZoneName')?.value ?? ''}`;
  } catch {
    return '';
  }
}

function HourlyLine({ hours }: { hours: PulseResponse['hourly'] }) {
  if (hours.length < 2) return <p className="muted">The hourly line starts once today has two hours of trips.</p>;
  const w = 600;
  const h = 48;
  const hi = Math.max(1, ...hours.map((x) => Math.max(x.requests, x.completed)));
  const line = (key: 'requests' | 'completed') => hours.map((x, i) => `${((i * w) / (hours.length - 1)).toFixed(1)},${(h - 4 - (x[key] / hi) * (h - 8)).toFixed(1)}`).join(' ');
  return (
    <svg className="ops-hourly" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img"
      aria-label={`Requests and completed trips by hour today, peak ${hi} requests in an hour`}>
      <polyline points={line('requests')} fill="none" className="ops-hourly__req" strokeWidth="1.5" />
      <polyline points={line('completed')} fill="none" className="ops-hourly__done" strokeWidth="1.75" />
    </svg>
  );
}

function CityWorkspace({ access, places }: { access: AdminAccess | null; places: PlacesResponse }) {
  const city = places.node!;
  const square = places.cities.find((c) => c.code === city.code);
  const tz = square?.timezone ?? null;
  const pulse = usePulse();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(t); }, []);
  const full = canReadLive(access);
  const mapOk = full || canSeeAggregate(access);
  const live = useLiveOps(city.code, full);
  const heat = useHeatmap(city.code, 15, mapOk);
  const dots = useMemo(() => dotsInCity(live.dots, city.code), [live.dots, city.code]);
  const trips = useMemo(() => (live.snapshot?.trips ?? []).filter((t) => t.city === city.code), [live.snapshot, city.code]);
  const alerts = useMemo(() => (live.snapshot?.alerts ?? []).filter((a) => a.city === city.code || a.city === null), [live.snapshot, city.code]);
  const cells = heat.data?.cells ?? [];
  const short = cells.filter((c) => shadeLevel(c) > 0).sort((a, b) => (b.demand_per_baseline - b.supply) - (a.demand_per_baseline - a.supply));

  const n = pulse?.now;
  const usual = pulse?.usual;
  const reliable = (n?.requests ?? 0) >= 20;
  const fulfil = reliable ? n?.fulfilment_rate ?? null : null;
  const eta = (n?.eta_samples ?? 0) >= 5 ? n?.eta_minutes ?? null : null;
  const fulfilVsUsual = againstUsual(fulfil, usual?.fulfilment_rate ?? null, '%');
  const below = fulfil !== null && usual?.fulfilment_rate && fulfil < usual.fulfilment_rate.low;
  const reqPoints = (pulse?.hourly ?? []).map((x) => x.requests);
  const t = places.totals;

  return (
    <div className="ops-ws">
      <SuperAdminBanner access={access} />
      <SelfApprovalNotice />
      <header className="ops-ws__head">
        <div>
          <nav className="ops-crumbs" aria-label="Place">
            {places.breadcrumb.slice(0, -1).map((b) => (
              <button key={b.code} type="button" className="ops-crumbs__link" onClick={() => goToPlace(b.kind === 'global' ? null : b.code)}>{b.name} ›</button>
            ))}
          </nav>
          <h1>{city.name} {square ? <HealthChip health={square.health} reason={square.health_reason} /> : null}</h1>
          <p className="sg-num">{cityClock(tz, now)}{square?.health_reason ? ` · ${square.health_reason}` : ''}</p>
        </div>
      </header>

      <div className="ops-ws__grid ops-ws__grid--d">
        <div className="ops-ws__main">
          <div className="ops-metrics">
            <MetricCard label="Requests · last hour" value={n ? fmt(n.requests) : null} points={reqPoints}
              usual={againstUsual(n?.requests ?? null, usual?.requests ?? null)} />
            <MetricCard label="Fulfilment" value={fulfil === null ? null : `${fulfil}%`}
              usual={fulfilVsUsual} tone={below ? 'critical' : 'neutral'} />
            <MetricCard label="Pickup ETA · average" value={eta === null ? null : `${eta}`} unit="min"
              usual={againstUsual(eta, usual?.eta_minutes ?? null, ' min')} />
            <MetricCard label="Drivers online" value={fmt(t.drivers_online)}
              note={t.stuck_trips ? `${t.stuck_trips} stuck trip${t.stuck_trips === 1 ? '' : 's'}` : undefined} />
          </div>

          {below && short.length ? (
            <section className="ops-why" aria-label="Why">
              <div className="ops-why__tag">WHY</div>
              <b>{short.length} area{short.length === 1 ? ' is' : 's are'} short of drivers</b>
              <p>
                Fulfilment {fulfil}% in the last hour, against {usual!.fulfilment_rate!.low}–{usual!.fulfilment_rate!.high}% at this
                hour on the last {usual!.fulfilment_rate!.weeks} weeks&apos; same weekday. The shortest area: {cellSentence(short[0], 15)}
              </p>
              <div className="ops-why__acts">
                {canOpen(access, 'liveops') ? <Link href="/live-ops" className="sg-btn sg-btn--secondary sg-btn--sm">Open the live map</Link> : null}
                {canOpen(access, 'promotions') ? <Link href="/promotions/incentives" className="sg-btn sg-btn--ghost sg-btn--sm">Propose a peak incentive</Link> : null}
              </div>
              <p className="ops-why__note">Suggestions only: nothing happens until a person acts, and an incentive needs a second approver.</p>
            </section>
          ) : null}

          {mapOk ? (
            <section className="ops-card ops-card--map" aria-label="Live city map">
              <LiveMap zones={live.snapshot?.zones ?? []} dots={full ? dots : []} trips={full ? trips : []}
                alerts={full ? alerts : []} cells={cells}
                layers={{ drivers: full, trips: full, alerts: full, heatmap: true }}
                driverHref={(id) => (canOpen(access, 'drivers') ? `/drivers/${id}` : null)}
                windowMinutes={15} focus={[city.code]}
                caption={`${city.name}: drivers against riders in the last 15 minutes`} />
              <div className="ops-legend ops-legend--map">
                <span className="ops-legend__item"><span className="ops-square ops-square--critical" aria-hidden="true" /> Short of drivers</span>
                <span className="ops-legend__item"><span className="ops-square ops-square--quiet" aria-hidden="true" /> Balanced</span>
              </div>
            </section>
          ) : null}

          <section className="ops-card" aria-label="Today, hour by hour">
            <header className="ops-card__head"><div><h2>Today, hour by hour</h2><p>Requests and completed trips.</p></div>
              <div className="ops-legend">
                <span className="ops-legend__item"><span className="ops-key ops-key--req" aria-hidden="true" /> Requests</span>
                <span className="ops-legend__item"><span className="ops-key ops-key--done" aria-hidden="true" /> Completed</span>
              </div></header>
            <HourlyLine hours={pulse?.hourly ?? []} />
          </section>
        </div>
        <NeedsActionInbox access={access} placeName={city.name} limit={20} />
      </div>
    </div>
  );
}
