'use client';

import { useEffect, useState } from 'react';
import MapSurface from '@/components/MapSurface';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { ICar, IShield } from './icons';
import { LOAD_TIMEOUT_MS } from '@/lib/area/useLoad';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000/api/v1';
/** How often the page asks for the driver's position; the server refreshes it every ping. */
const POLL_MS = 15_000;

type Public = {
  live: boolean;
  message?: string;
  status?: string;
  rider_first_name?: string;
  pickup_area?: string;
  destination_area?: string;
  driver_first_name?: string | null;
  vehicle?: { brand: string; model: string; color: string; plate: string } | null;
  position?: { lat: number; lng: number } | null;
  arrive_at?: string | null;
  eta_min?: number | null;
};

async function fetchShared(token: string): Promise<Public> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), LOAD_TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE}/sharing/public/${encodeURIComponent(token)}/`, { signal: ctl.signal, cache: 'no-store' });
    const json = await r.json();
    if (!r.ok) throw new Error(String(r.status));
    return (json?.data ?? json) as Public;
  } finally {
    clearTimeout(timer);
  }
}

const STATUS: Record<string, string> = {
  accepted: 'Driver on the way to pickup',
  reached: 'Driver at pickup',
  in_progress: 'On the trip',
  completed: 'Trip complete',
  cancelled: 'Trip cancelled',
};

/**
 * /t/<token>: the trip a rider shared (9 Nov). First names, areas, the car
 * and plate, the live position and the arrival time; never a phone number,
 * the fare or a full name (the server leaves them out). After expiry it says
 * "This trip has ended."
 */
export function SharedTrip({ token }: { token: string }) {
  const tr = useTr();
  const { locale } = useLocale();
  const [data, setData] = useState<Public | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    let timer: number | null = null;
    const load = (first: boolean) => {
      fetchShared(token).then((d) => {
        if (!live) return;
        setData(d); setState('ok');
        if (d.live) timer = window.setTimeout(() => load(false), POLL_MS);
      }, () => {
        if (!live) return;
        if (first) setState('error');
        else timer = window.setTimeout(() => load(false), POLL_MS);
      });
    };
    setState('loading');
    load(true);
    return () => { live = false; if (timer) window.clearTimeout(timer); };
  }, [token, attempt]);

  const arrive = data?.arrive_at
    ? new Date(data.arrive_at).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : null;
  const car = data?.vehicle ? [data.vehicle.color, data.vehicle.brand, data.vehicle.model].filter(Boolean).join(' ') : '';

  return (
    <main className="ar" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--c-page)' }}>
      <div className="ar-split" style={{ flex: 1 }}>
        <aside className="ar-panel">
          <div className="arow" style={{ gap: 8 }}>
            <span className="aico" style={{ background: 'var(--c-gold-bg)', color: 'var(--c-accent)' }}><IShield size={18} /></span>
            <span className="ab">SaaradhiGo</span>
          </div>
          {state === 'loading' && (
            <div className="askel-wrap" role="status" aria-label={tr('Loading')} style={{ display: 'grid', gap: 12 }}>
              <span className="askel" style={{ height: 28 }} /><span className="askel" style={{ height: 16 }} /><span className="askel" style={{ height: 16, width: '60%' }} />
            </div>
          )}
          {state === 'error' && (
            <div className="aerr" role="alert">
              <span>{tr("We couldn't load this trip.")}</span>
              <button type="button" className="abtn abtn--ghost a14" style={{ height: 36, padding: '0 14px' }} onClick={() => setAttempt((n) => n + 1)}>
                {tr('Try again')}
              </button>
            </div>
          )}
          {state === 'ok' && data && !data.live && (
            <div className="aempty acol" style={{ gap: 8 }}>
              <h1 className="a28">{tr('This trip has ended.')}</h1>
              <p className="amut">{tr('Shared trips stay visible until 30 minutes after they end.')}</p>
            </div>
          )}
          {state === 'ok' && data?.live && (
            <>
              <div>
                <span className="apill apill--ok">{tr(STATUS[data.status ?? ''] ?? 'On the trip')}</span>
                <h1 className="a28" style={{ marginTop: 12 }}>
                  {tr('{name} is sharing this trip with you').replace('{name}', data.rider_first_name ?? '')}
                </h1>
                {arrive && <p className="a20" style={{ marginTop: 8 }}>{tr('Arrive about {time}').replace('{time}', arrive)}</p>}
              </div>
              <div className="acard acol" style={{ padding: 16, gap: 10 }}>
                {data.pickup_area && <div><div className="a14 amut">{tr('From')}</div><div className="ab">{data.pickup_area}</div></div>}
                {data.destination_area && <div><div className="a14 amut">{tr('To')}</div><div className="ab">{data.destination_area}</div></div>}
              </div>
              {(data.driver_first_name || data.vehicle) && (
                <div className="acard arow" style={{ padding: 16, gap: 12 }}>
                  <span className="aico"><ICar size={20} /></span>
                  <div className="agrow">
                    {data.driver_first_name && <div className="ab">{data.driver_first_name}</div>}
                    {car && <div className="a14 amut">{car}</div>}
                  </div>
                  {data.vehicle?.plate && (
                    <div className="ab a14" style={{ padding: '6px 10px', borderRadius: 8, border: '2px solid var(--c-text)', whiteSpace: 'nowrap' }}>{data.vehicle.plate}</div>
                  )}
                </div>
              )}
              <p className="a14 amut">{tr('If you think they are in danger, call the local emergency number.')}</p>
            </>
          )}
        </aside>
        {/* Only a live trip has a map: an ended one has nothing to show, and the
            map's own fallback ("booking works normally") is not about this page. */}
        {data?.live && (
          <div className="ar-map">
            <MapSurface driver={data.position ?? null} cityCentre={data.position ?? null}>
              {data.eta_min ? <span className="amaplabel">{tr('{n} min').replace('{n}', String(data.eta_min))}</span> : null}
            </MapSurface>
          </div>
        )}
      </div>
    </main>
  );
}
