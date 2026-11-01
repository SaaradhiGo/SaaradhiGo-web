'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAdminAccess } from '@/lib/adminScope';
import { useDensity } from '@/lib/consolePrefs';
import {
  MARKET_STATUS_WORDS, READINESS_WORDS, canReadPlatform, canWritePlatform, launchBlockedBy, marketTone,
  readinessSummary, readinessTone, type CityRow, type CountryRow, type MarketsPayload,
} from '@/lib/platform';
import { NoticeBanner, messageOf, type Notice } from '@/components/console/notifications';
import {
  PendingRequests, PlatformNav, PlatformNoAccess, outcomeNotice,
} from '@/components/console/platform';
import {
  DataTable, Drawer, Empty, ErrorState, PageHeader, Panel, Pill, Skeleton, TableToolbar,
} from '@/components/console/ui';

/**
 * Platform settings: Markets.
 *
 * Countries and cities, and whether each is live. A city goes live only when every BLOCKING item of
 * its readiness checklist is ready (zone, fare cards, commission, safety cover, payout rules,
 * approval policies, a payment gateway; a stubbed SMS provider is a warning on QA and a blocker in
 * production; tax is always a warning). Launching, pausing and adding a place are requests a second
 * admin approves; the launch is checked again at the moment of approval.
 */
type Detail = CityRow & { readiness: NonNullable<CityRow['readiness']> };

export default function MarketsPage() {
  const access = useAdminAccess();
  const [density, setDensity] = useDensity();
  const [data, setData] = useState<MarketsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  const columns = useMemo(() => [
    { key: 'city', label: 'City', sortValue: (c: CityRow) => c.name,
      render: (c: CityRow) => <><b>{c.name}</b> <span className="muted">{c.code}</span></> },
    { key: 'state', label: 'State', width: '11rem', hideBelow: 1100 as const, render: (c: CityRow) => c.state?.name ?? '—' },
    { key: 'status', label: 'Status', width: '8rem', sortValue: (c: CityRow) => c.status,
      render: (c: CityRow) => <Pill tone={marketTone(c.status)}>{MARKET_STATUS_WORDS[c.status]}</Pill> },
    { key: 'ready', label: 'Readiness', width: '15rem', sortValue: (c: CityRow) => c.blocking_count,
      render: (c: CityRow) => (c.blocking_count > 0
        ? <Pill tone="bad">{readinessSummary(c)}</Pill>
        : <Pill tone={c.warning_count > 0 ? 'wait' : 'good'}>{readinessSummary(c)}</Pill>) },
    { key: 'req', label: 'Request', width: '13rem', hideBelow: 1100 as const,
      render: (c: CityRow) => (c.pending_request ? <Pill tone="wait">Awaiting a checker</Pill> : <span className="muted">—</span>) },
  ], []);

  if (!canReadPlatform(access)) {
    return (<><PageHeader title="Platform settings" /><PlatformNav /><PlatformNoAccess what="Markets" /></>);
  }

  return (
    <>
      <PageHeader title="Platform settings"
        subtitle="Which countries and cities exist, which are live, and what each still needs. Launching, pausing or adding a place needs a second admin."
        actions={canWritePlatform(access) ? (
          <button type="button" className="sg-btn sg-btn--primary sg-btn--sm" onClick={() => setAdding(true)}>Add a place…</button>
        ) : undefined} />
      <PlatformNav />
      <NoticeBanner notice={notice} />
      {data ? (
        <PendingRequests items={data.pending} onDecided={(n) => { setNotice(n); void load(); }} />
      ) : null}

      {error ? (
        <ErrorState title="The markets could not be loaded" detail={error} onRetry={() => void load()} />
      ) : data === null ? (
        <div className="ops-skel-rows" aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading the markets</span>
          <Skeleton kind="row" count={5} />
        </div>
      ) : data.countries.length === 0 ? (
        <Empty title="No countries in your scope" detail="Nothing here is held at a place you can see." />
      ) : (
        <div className="grid gap-4">
          {data.countries.map((country: CountryRow) => (
            <Panel key={country.code} flush
              title={`${country.name} · ${MARKET_STATUS_WORDS[country.status]}`}>
              <TableToolbar summary={`${country.cities.length} cit${country.cities.length === 1 ? 'y' : 'ies'}${country.currency ? ` · ${country.currency}` : ''}`}
                density={density} onDensity={setDensity} />
              {country.cities.length === 0 ? (
                <Empty title="No cities yet" detail="A country is live when at least one of its cities is live." />
              ) : (
                <DataTable caption={`Cities in ${country.name}`} rows={country.cities} columns={columns}
                  rowKey={(c) => c.code} density={density} onRow={(c) => setOpen(c.code)}
                  selectedKey={open} defaultSort={{ key: 'city', dir: 'asc' }} maxHeight={false} />
              )}
            </Panel>
          ))}
        </div>
      )}

      {open ? (
        <CityDrawer code={open} onClose={() => setOpen(null)}
          onDone={(n) => { setOpen(null); setNotice(n); void load(); }} />
      ) : null}
      {adding && data ? (
        <AddPlaceDrawer countries={data.countries} onClose={() => setAdding(false)}
          onDone={(n) => { setAdding(false); setNotice(n); void load(); }} />
      ) : null}
    </>
  );
}

function CityDrawer({ code, onClose, onDone }: { code: string; onClose: () => void; onDone: (n: Notice) => void }) {
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

  const blocked = launchBlockedBy(city?.readiness);
  const canAsk = city && !city.pending_request;
  return (
    <Drawer open wide onClose={onClose} title={city ? `${city.name} · readiness` : 'City readiness'}
      footer={canAsk && (city.may_launch || city.may_pause) ? (
        <>
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
        </>
      ) : undefined}>
      {error ? <ErrorState title="That city could not be loaded" detail={error} onRetry={() => void load()} />
        : !city ? (
          <div className="ops-skel-rows" aria-busy="true"><span className="sr-only">Loading the checklist</span><Skeleton kind="row" count={6} /></div>
        ) : (
          <div className="nf-editor">
            <p className="help mb-0">
              {MARKET_STATUS_WORDS[city.status]} · {readinessSummary(city)}. Blocking items must be ready before a launch can be
              asked for; it is checked again when the second admin approves.
            </p>
            {city.pending_request ? (
              <div className="ops-confirm" role="status">
                <b>Awaiting a checker</b>
                <span>Request #{city.pending_request.id} from {city.pending_request.maker_label}: {city.pending_request.reason}</span>
              </div>
            ) : null}
            <ul className="ps-checklist" aria-label="Readiness checklist">
              {city.readiness.map((item) => (
                <li key={item.key} className="ps-check">
                  <div className="ps-check__head">
                    <b>{item.label}</b>
                    <Pill tone={readinessTone(item.status)}>{READINESS_WORDS[item.status]}</Pill>
                    {item.blocking ? <span className="ps-check__flag">Blocks launch</span> : null}
                  </div>
                  <p className="help mb-0">{item.detail}</p>
                  {item.status !== 'ok' && item.href ? (
                    <Link href={item.href} className="ps-check__fix">Fix this under {item.href.replace(/^\//, '').split('/')[0] || 'settings'}</Link>
                  ) : null}
                </li>
              ))}
            </ul>
            {canAsk && (city.may_launch || city.may_pause) ? (
              <div className="nf-field">
                <label className="ops-form__label" htmlFor="city-reason">Reason</label>
                <textarea id="city-reason" className="input" rows={3} value={reason}
                  onChange={(e) => setReason(e.target.value)} />
              </div>
            ) : null}
            {problem ? <p className="nf-problems" role="alert">{problem}</p> : null}
          </div>
        )}
    </Drawer>
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
