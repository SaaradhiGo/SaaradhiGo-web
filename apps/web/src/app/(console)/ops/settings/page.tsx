'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import {
  MARKET_STATUS_WORDS, READINESS_WORDS, canReadPlatform, canWritePlatform, launchBlockedBy,
  readinessSummary, type CityRow, type CountryRow, type MarketStatus, type MarketsPayload,
} from '@/lib/platform';
import { NoticeBanner, messageOf, type Notice } from '@/components/console/notifications';
import {
  PendingRequests, PlatformNav, PlatformNoAccess, outcomeNotice,
} from '@/components/console/platform';
import { ListPage, type ListColumn } from '@/components/console/kit/ListPage';
import { RecordPanel } from '@/components/console/kit/RecordPanel';
import { StatusChip } from '@/components/console/kit/StatusChip';
import { Drawer, PageHeader } from '@/components/console/ui';

/**
 * Platform settings: countries and cities, as ONE table (country > state > city).
 *
 * Countries and cities, and whether each is live. A city goes live only when every BLOCKING item of
 * its readiness checklist is ready (zone, fare cards, commission, safety cover, payout rules,
 * approval policies, a payment gateway; a stubbed SMS provider is a warning on QA and a blocker in
 * production; tax is always a warning). Launching, pausing and adding a place are requests a second
 * admin approves; the launch is checked again at the moment of approval.
 */
type Detail = CityRow & { readiness: NonNullable<CityRow['readiness']> };

/** One line of the place table: a country, a state under it, or a city under that. */
type PlaceLine =
  | { level: 0; key: string; country: CountryRow }
  | { level: 1; key: string; code: string; name: string; cities: CityRow[] }
  | { level: 2; key: string; city: CityRow };

const STATUS_VIEWS: Array<'' | MarketStatus> = ['', 'live', 'draft', 'paused'];

function MarketChip({ status }: { status: MarketStatus }) {
  const tone = status === 'live' ? 'good' : status === 'paused' ? 'caution' : 'info';
  return <StatusChip tone={tone}>{MARKET_STATUS_WORDS[status]}</StatusChip>;
}

function ReadinessChip({ city }: { city: CityRow }) {
  if (city.blocking_count > 0) return <StatusChip tone="caution">{readinessSummary(city)}</StatusChip>;
  return <StatusChip tone={city.warning_count > 0 ? 'info' : 'good'}>{readinessSummary(city)}</StatusChip>;
}

/** Country > state > city, filtered by status and a search, as one ordered list of lines. */
function hierarchy(countries: readonly CountryRow[], status: '' | MarketStatus, search: string): PlaceLine[] {
  const needle = search.trim().toLowerCase();
  const hit = (...texts: Array<string | null | undefined>) => !needle || texts.some((t) => (t ?? '').toLowerCase().includes(needle));
  const lines: PlaceLine[] = [];
  for (const country of [...countries].sort((a, b) => a.name.localeCompare(b.name))) {
    const countryHit = hit(country.name, country.code);
    const cities = country.cities.filter((c) => (!status || c.status === status)
      && (countryHit || hit(c.name, c.code, c.state?.name, c.state?.code)));
    const countryShown = (!status || country.status === status || cities.length > 0) && (countryHit || cities.length > 0);
    if (!countryShown) continue;
    lines.push({ level: 0, key: `c:${country.code}`, country });
    const byState = new Map<string, { code: string; name: string; cities: CityRow[] }>();
    for (const c of cities) {
      const k = c.state?.code ?? '';
      const group = byState.get(k) ?? { code: k, name: c.state?.name ?? 'No state', cities: [] };
      group.cities.push(c);
      byState.set(k, group);
    }
    for (const group of [...byState.values()].sort((a, b) => a.name.localeCompare(b.name))) {
      lines.push({ level: 1, key: `s:${country.code}:${group.code}`, ...group });
      for (const city of group.cities.sort((a, b) => a.name.localeCompare(b.name))) {
        lines.push({ level: 2, key: `t:${city.code}`, city });
      }
    }
  }
  return lines;
}

export default function MarketsPage() {
  const access = useAdminAccess();
  const [data, setData] = useState<MarketsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState<'' | MarketStatus>('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await api.get<MarketsPayload>('/platform/admin/markets/'));
    } catch (err) {
      setData(null);
      setError(messageOf(err, 'The markets could not be loaded.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const lines = useMemo(() => hierarchy(data?.countries ?? [], status, search), [data, status, search]);

  if (!canReadPlatform(access)) {
    return (<><PageHeader title="Countries and cities" /><PlatformNav /><PlatformNoAccess what="Markets" /></>);
  }

  const allCities = (data?.countries ?? []).flatMap((c) => c.cities);
  const countOf = (s: '' | MarketStatus) => (s ? allCities.filter((c) => c.status === s).length : allCities.length);
  const columns: ListColumn<PlaceLine>[] = [
    {
      key: 'place', label: 'Place', primary: true,
      render: (l) => (
        <span className={`ops-tree ops-tree--${l.level}`}>
          {l.level === 0 ? <>{l.country.name} <span className="muted">{l.country.code}</span></>
            : l.level === 1 ? <>{l.name} <span className="muted">{l.code}</span></>
              : <>{l.city.name} <span className="muted">{l.city.code}</span></>}
        </span>
      ),
    },
    { key: 'kind', label: 'Kind', render: (l) => (l.level === 0 ? 'Country' : l.level === 1 ? 'State' : 'City') },
    {
      key: 'status', label: 'Status',
      render: (l) => (l.level === 0 ? <MarketChip status={l.country.status} /> : l.level === 2 ? <MarketChip status={l.city.status} /> : null),
    },
    {
      key: 'ready', label: 'Readiness',
      render: (l) => {
        if (l.level === 2) return <ReadinessChip city={l.city} />;
        const cities = l.level === 0 ? l.country.cities : l.cities;
        const live = cities.filter((c) => c.status === 'live').length;
        return <span className="muted">{live} of {cities.length} cit{cities.length === 1 ? 'y' : 'ies'} live</span>;
      },
    },
    {
      key: 'money', label: 'Currency',
      render: (l) => (l.level === 0 ? l.country.currency ?? '—' : ''),
    },
    {
      key: 'req', label: 'Request',
      render: (l) => (l.level === 2 && l.city.pending_request ? <StatusChip tone="info">Awaiting a checker</StatusChip> : null),
    },
  ];

  return (
    <>
      <PlatformNav />
      <NoticeBanner notice={notice} />
      {data ? (
        <PendingRequests items={data.pending} onDecided={(n) => { setNotice(n); void load(); }} />
      ) : null}
      <div className={open ? 'ops-split' : undefined}>
        <div className="ops-list__tree">
          <ListPage<PlaceLine>
            pageKey="settings-markets"
            title="Countries and cities"
            summary="Which countries and cities exist, which are live, and what each still needs. Launching, pausing or adding a place needs a second admin."
            actionsSlot={canWritePlatform(access) ? (
              <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setAdding(true)}>Add a place…</button>
            ) : undefined}
            views={STATUS_VIEWS.map((s) => ({
              key: s, label: s ? `${MARKET_STATUS_WORDS[s]} cities` : 'All places', count: data ? countOf(s) : undefined,
            }))}
            view={status}
            onView={(v) => setStatus(v as '' | MarketStatus)}
            chips={search.trim() ? [{ key: 'q', label: `Search: ${search.trim()}`, onRemove: () => setSearch('') }] : []}
            filterSlot={(
              <>
                <label className="sr-only" htmlFor="mk-q">Search places</label>
                <input id="mk-q" className="input ops-list__search" type="search" placeholder="Search a country, state or city"
                  value={search} onChange={(e) => setSearch(e.target.value)} />
              </>
            )}
            columns={columns}
            rows={lines}
            rowKey={(l) => l.key}
            total={data ? lines.length : null}
            page={1}
            pageSize={Math.max(1, lines.length)}
            onPage={() => undefined}
            onRow={(l) => { if (l.level === 2) setOpen(l.city.code); }}
            activeKey={open ? `t:${open}` : null}
            loading={data === null && !error}
            error={error}
            empty={data && data.countries.length === 0 ? 'No countries in your scope. Nothing here is held at a place you can see.' : 'No place matches.'}
          />
        </div>
        {open ? (
          <CityRecord key={open} code={open} onClose={() => setOpen(null)}
            onDone={(n) => { setOpen(null); setNotice(n); void load(); }} />
        ) : null}
      </div>
      {adding && data ? (
        <AddPlaceDrawer countries={data.countries} onClose={() => setAdding(false)}
          onDone={(n) => { setAdding(false); setNotice(n); void load(); }} />
      ) : null}
    </>
  );
}

function CityRecord({ code, onClose, onDone }: { code: string; onClose: () => void; onDone: (n: Notice) => void }) {
  const [city, setCity] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setCity(await api.get<Detail>(`/platform/admin/markets/${encodeURIComponent(code)}/readiness/`));
    } catch (err) {
      setError(messageOf(err, 'That city could not be loaded.'));
    }
  }, [code]);
  useEffect(() => { void load(); }, [load]);

  async function ask(status: 'live' | 'paused') {
    if (reason.trim().length < 5) { setProblem('Say why, in a few words.'); return; }
    setBusy(true); setProblem(null);
    try {
      const out = await api.post<{ state?: string; approval_request?: { id: number } }>(
        `/platform/admin/markets/${encodeURIComponent(code)}/status/`, { status, reason: reason.trim() });
      onDone(outcomeNotice(out, 'Done.'));
    } catch (err) {
      setProblem(messageOf(err, 'That did not go through. Nothing changed.'));
    } finally {
      setBusy(false);
    }
  }

  if (!city) {
    return (
      <RecordPanel label="City" title="City readiness" refId={code} onClose={onClose}
        tabs={[{ key: 'ready', label: 'Readiness', content: error ? (
          <div>
            <p className="alert-error" role="alert">{error}</p>
            <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => void load()}>Try again</button>
          </div>
        ) : <p className="ops-record__empty" aria-busy="true">Loading the checklist…</p> }]} />
    );
  }

  const blocked = launchBlockedBy(city.readiness);
  const canAsk = !city.pending_request && (city.may_launch || city.may_pause);
  return (
    <RecordPanel
      label="City"
      title={city.name}
      refId={city.code}
      subtitle={<>{city.state?.name ?? 'No state'} · {readinessSummary(city)}</>}
      status={<MarketChip status={city.status} />}
      onClose={onClose}
      tabs={[{
        key: 'ready', label: 'Readiness', content: (
          <div className="nf-editor">
            <p className="help mb-0">
              Blocking items must be ready before a launch can be asked for; it is checked again when the second admin approves.
            </p>
            {city.pending_request ? (
              <div className="ops-confirm" role="status">
                <b>Awaiting a checker</b>
                <span>Request APR-{city.pending_request.id} from {city.pending_request.maker_label}: {city.pending_request.reason}</span>
              </div>
            ) : null}
            <ul className="ps-checklist" aria-label="Readiness checklist">
              {city.readiness.map((item) => (
                <li key={item.key} className="ps-check">
                  <div className="ps-check__head">
                    <b>{item.label}</b>
                    <StatusChip tone={item.status === 'ok' ? 'good' : item.status === 'missing' ? 'caution' : 'info'}>{READINESS_WORDS[item.status]}</StatusChip>
                    {item.blocking ? <span className="ps-check__flag">Blocks launch</span> : null}
                  </div>
                  <p className="help mb-0">{item.detail}</p>
                  {item.status !== 'ok' && item.href ? (
                    <Link href={item.href} className="ps-check__fix">Fix this under {item.href.replace(/^\//, '').split('/')[0] || 'settings'}</Link>
                  ) : null}
                </li>
              ))}
            </ul>
            {canAsk ? (
              <div className="nf-field">
                <label className="ops-form__label" htmlFor="city-reason">Reason</label>
                <textarea id="city-reason" className="input" rows={3} value={reason}
                  onChange={(e) => setReason(e.target.value)} />
              </div>
            ) : null}
            {problem ? <p className="nf-problems" role="alert">{problem}</p> : null}
            {canAsk ? (
              <div className="nf-inline">
                {city.may_pause ? (
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" disabled={busy} onClick={() => void ask('paused')}>
                    Request pause
                  </button>
                ) : null}
                {city.may_launch ? (
                  <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy || blocked.length > 0}
                    onClick={() => void ask('live')}>
                    Request launch
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ),
      }]}
    />
  );
}

function AddPlaceDrawer({ countries, onClose, onDone }: {
  countries: CountryRow[]; onClose: () => void; onDone: (n: Notice) => void;
}) {
  const [kind, setKind] = useState<'country' | 'state' | 'city'>('city');
  const [parent, setParent] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const parents = useMemo(() => {
    const states = new Map<string, string>();
    countries.forEach((c) => c.cities.forEach((city) => { if (city.state) states.set(city.state.code, city.state.name); }));
    if (kind === 'state') return countries.map((c) => ({ code: c.code, name: c.name }));
    if (kind === 'city') return Array.from(states, ([k, v]) => ({ code: k, name: v }));
    return [];
  }, [countries, kind]);

  async function submit() {
    setBusy(true); setProblem(null);
    try {
      const out = await api.post<{ state?: string; approval_request?: { id: number } }>('/platform/admin/markets/nodes/', {
        kind, code: code.trim().toUpperCase(), name: name.trim(), parent_code: kind === 'country' ? '' : parent, reason: reason.trim(),
      });
      onDone(outcomeNotice(out, 'Done.'));
    } catch (err) {
      setProblem(messageOf(err, 'That did not go through. Nothing was added.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer open onClose={onClose} title="Add a place"
      footer={<button type="button" className="sg-btn sg-btn--primary sg-btn--sm" disabled={busy} onClick={() => void submit()}>Send for approval</button>}>
      <div className="nf-editor">
        <p className="help mb-0">
          A new country, state or city starts as a draft and is not bookable. A country must already be in the country registry (its
          calling code, currency and tax mode are code).
        </p>
        <div className="nf-field">
          <label className="ops-form__label" htmlFor="add-kind">Kind</label>
          <select id="add-kind" className="ops-select" value={kind} onChange={(e) => { setKind(e.target.value as typeof kind); setParent(''); }}>
            <option value="country">Country</option><option value="state">State or region</option><option value="city">City</option>
          </select>
        </div>
        {kind !== 'country' ? (
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="add-parent">{kind === 'state' ? 'Country' : 'State or region'}</label>
            <select id="add-parent" className="ops-select" value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">Choose…</option>
              {parents.map((p) => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
            </select>
          </div>
        ) : null}
        <div className="nf-grid">
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="add-code">Code</label>
            <input id="add-code" className="input" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
          <div className="nf-field">
            <label className="ops-form__label" htmlFor="add-name">Name</label>
            <input id="add-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>
        <div className="nf-field">
          <label className="ops-form__label" htmlFor="add-reason">Reason</label>
          <textarea id="add-reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {problem ? <p className="nf-problems" role="alert">{problem}</p> : null}
      </div>
    </Drawer>
  );
}
