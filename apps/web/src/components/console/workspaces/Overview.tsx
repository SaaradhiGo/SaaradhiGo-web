'use client';

import { stamp } from '@/lib/consoleTime';

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
  type PlacesResponse, type PulseResponse,
  againstUsual,
} from '@/lib/workspace';
import { LiveMap } from '@/components/console/liveops/LiveMap';
import { HealthChip, StatusChip } from '@/components/console/kit/StatusChip';
import { MetricCard } from '@/components/console/kit/MetricCard';
import { TodayPanel, useToday } from '@/components/console/workspaces/TodayPanel';
import { NeedsActionInbox } from '@/components/console/kit/NeedsActionInbox';
import { SuperAdminBanner } from '@/components/console/command-centre/SuperAdminBanner';
import { SelfApprovalNotice } from '@/components/console/SelfApprovalNotice';
import { Empty, ErrorState, Skeleton } from '@/components/console/ui';
import { plural } from '@/lib/plural';

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


export function goToPlace(code: string | null) {
  writeSelectedScope(code);
  window.location.assign('/ops/dashboard');
}

function usePlaces() {
  const [data, setData] = useState<PlacesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api.get<PlacesResponse>(withScope('/command-centre/admin/places/?window=today')));
      setError(null);
    } catch (e) {
      // 18 Nov: a role without the overview (support, safety) is told so, not shown an error.
      if (e instanceof ApiError && e.status === 403) { setForbidden(true); return; }
      // The title already says it failed; the detail gives the next step.
      setError(e instanceof ApiError && e.fromServer ? e.message : 'Check your connection, then try again.');
    }
  }, []);
  useEffect(() => {
    void load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [load]);
  return { data, error, forbidden, reload: load };
}

export function Overview({ access }: { access: AdminAccess | null }) {
  const { data, error, forbidden, reload } = usePlaces();
  if (forbidden && !data) return <Empty title="The overview is not available to your role" detail="Your work starts from the menu. Ask a Super Admin (Govern › Staff and roles) if you need the overview." />;
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

function PlaceWorkspace({ access, places }: { access: AdminAccess | null; places: PlacesResponse }) {
  const node = places.node;
  // 24 Nov (owner): the whole platform is "All countries", the place bar's own words.
  const nodeName = node?.kind === 'global' ? 'All countries' : node?.name;
  const t = places.totals;
  const today = useToday();
  const money = t.collected_minor ? Object.entries(t.collected_minor) : null;

  return (
    <div className="ops-ws">
      <header className="ops-ws__head">
        <div>
          <h1>{nodeName ?? 'Overview'}</h1>
          <p className="sg-num">
            {t.live_cities} live {t.live_cities === 1 ? 'city' : 'cities'}
            {t.paused_cities ? ` · ${t.paused_cities} not live` : ''}
            {` · ${fmt(t.requests)} ${t.requests === 1 ? 'request' : 'requests'} today · ${fmt(t.drivers_online)} ${t.drivers_online === 1 ? 'driver' : 'drivers'} online`}
            {t.sos_active ? ` · ${t.sos_active} SOS active` : ''}
          </p>
        </div>
      </header>

      <TodayPanel data={today.data} range={today.range} onRange={today.setRange} placeName={nodeName} onOpenCountry={(code) => goToPlace(code)} />

      <SuperAdminBanner access={access} />
      <SelfApprovalNotice approver={can(access, 'approval.check')} />

      {/* 24 Nov (owner): the country tiles above replace "Every city at a glance" and the Countries table. */}
      <NeedsActionInbox access={access} placeName={nodeName} limit={8} />

      <div className="ops-ws__grid ops-ws__grid--2">
        {money ? (
          <section className="ops-card" aria-label="Money today">
            <header className="ops-card__head"><div><h2>Money today</h2><p>Fares from trips completed today, per currency. Nothing adds two currencies.</p></div>
              {canOpen(access, 'finance') ? <Link href="/ops/finance" className="sg-btn sg-btn--ghost sg-btn--sm">Money overview</Link> : null}</header>
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
        <Link href="/ops/settings/integrations" className="sg-btn sg-btn--ghost sg-btn--sm">Integrations</Link></header>
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
  // The one console format (owner 24 Nov): "16 Nov 2026, 9:37 PM IST".
  return stamp(new Date(now).toISOString(), tz);
}

function HourlyLine({ hours }: { hours: PulseResponse['hourly'] }) {
  if (hours.length < 2) return <p className="muted">The hourly line starts once today has two hours of trips.</p>;
  const w = 600;
  const h = 48;
  const hi = Math.max(1, ...hours.map((x) => Math.max(x.requests, x.completed)));
  const line = (key: 'requests' | 'completed') => hours.map((x, i) => `${((i * w) / (hours.length - 1)).toFixed(1)},${(h - 4 - (x[key] / hi) * (h - 8)).toFixed(1)}`).join(' ');
  return (
    <svg className="ops-hourly" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img"
      aria-label={`Requests and completed trips by hour today, peak ${hi} ${hi === 1 ? 'request' : 'requests'} in an hour`}>
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
  const today = useToday();

  return (
    <div className="ops-ws">
      <header className="ops-ws__head">
        <div>
          <h1>{city.name} {square ? <HealthChip health={square.health} reason={square.health_reason} /> : null}</h1>
          <p className="sg-num">{cityClock(tz, now)}{square?.health_reason ? ` · ${square.health_reason}` : ''}</p>
        </div>
      </header>

      <TodayPanel data={today.data} range={today.range} onRange={today.setRange} placeName={city.name} onOpenCountry={(code) => goToPlace(code)} />
      <SelfApprovalNotice approver={can(access, 'approval.check')} />

      <div className="ops-ws__grid ops-ws__grid--d">
        <div className="ops-ws__main">
          {n && n.requests === 0 && !t.drivers_online && fulfil === null && eta === null ? (
            <p className="ops-today__clear" role="status">
              {/* 22 Nov (owner): no large empty number tiles when a value is zero. */}
              No requests in the last hour · no drivers online.
            </p>
          ) : (
          <div className="ops-metrics ops-metrics--dense">
            <MetricCard label="Requests · last hour" value={n ? fmt(n.requests) : null} points={reqPoints}
              usual={againstUsual(n?.requests ?? null, usual?.requests ?? null)} />
            <MetricCard label="Fulfilment" value={fulfil === null ? null : `${fulfil}%`}
              usual={fulfilVsUsual} tone={below ? 'critical' : 'neutral'} />
            <MetricCard label="Pickup ETA · average" value={eta === null ? null : `${eta}`} unit="min"
              usual={againstUsual(eta, usual?.eta_minutes ?? null, ' min')} />
            <MetricCard label="Drivers online" value={fmt(t.drivers_online)}
              note={t.stuck_trips ? `${t.stuck_trips} stuck trip${t.stuck_trips === 1 ? '' : 's'}` : undefined} />
          </div>
          )}

          {below && short.length ? (
            <section className="ops-why" aria-label="Why">
              <div className="ops-why__tag">WHY</div>
              <b>{short.length} area{short.length === 1 ? ' is' : 's are'} short of drivers</b>
              <p>
                Fulfilment {fulfil}% in the last hour, against {usual!.fulfilment_rate!.low}–{usual!.fulfilment_rate!.high}% at this
                hour on the last {plural(usual!.fulfilment_rate!.weeks, 'week')}&apos; same weekday. The shortest area: {cellSentence(short[0], 15)}
              </p>
              <div className="ops-why__acts">
                {canOpen(access, 'liveops') ? <Link href="/ops/live-ops" className="sg-btn sg-btn--secondary sg-btn--sm">Open the live map</Link> : null}
                {canOpen(access, 'promotions') ? <Link href="/ops/promotions/incentives" className="sg-btn sg-btn--ghost sg-btn--sm">Propose a peak incentive</Link> : null}
              </div>
              <p className="ops-why__note">Suggestions only: nothing happens until a person acts, and an incentive needs a second approver.</p>
            </section>
          ) : null}

          {mapOk ? (
            <section className="ops-card ops-card--map" aria-label="Live city map">
              <LiveMap zones={live.snapshot?.zones ?? []} dots={full ? dots : []} trips={full ? trips : []}
                alerts={full ? alerts : []} cells={cells}
                layers={{ drivers: full, trips: full, alerts: full, heatmap: true }}
                driverHref={(id) => (canOpen(access, 'drivers') ? `/ops/drivers/${id}` : null)}
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
