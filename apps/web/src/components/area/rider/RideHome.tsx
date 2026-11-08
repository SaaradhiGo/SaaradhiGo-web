'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MapSurface from '@/components/MapSurface';
import { useTr } from '@/i18n/website';
import { type LatLng, type Place, placeToPoint, searchPlaces } from '@/lib/booking';
import { addPlace, savedPlaces, trips, type SavedPlace, type Trip } from '@/lib/area/rider';
import { IClock, IHome, IPlus, ITarget } from '../icons';

type Spot = { label: string; point: LatLng };

/** Where a trip of the rider's last few went, newest first, without repeats. */
function recentDrops(list: Trip[]): Spot[] {
  const seen = new Set<string>();
  const out: Spot[] = [];
  for (const t of list) {
    const label = t.destination_address?.trim();
    const lat = Number(t.destination_lat);
    const lng = Number(t.destination_long);
    if (!label || !Number.isFinite(lat) || !Number.isFinite(lng) || seen.has(label)) continue;
    seen.add(label);
    out.push({ label, point: { lat, lng } });
    if (out.length === 3) break;
  }
  return out;
}

function placeSpot(p: SavedPlace): Spot | null {
  const lat = Number(p.latitude);
  const lng = Number(p.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { label: p.address_text, point: { lat, lng } } : null;
}

/** The two halves of an address for a row: the place, then the rest. */
function split(label: string): [string, string | null] {
  const i = label.indexOf(',');
  return i > 0 ? [label.slice(0, i), label.slice(i + 1).trim()] : [label, null];
}

/**
 * /ride for a signed-in rider (rider-web-home.html): where to, the saved
 * places, the last places they went, and See fares. The map shows where they
 * are; no other cars are drawn, because none are known to this screen.
 */
export function RideHome() {
  const tr = useTr();
  const router = useRouter();
  const [here, setHere] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(true);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<Place[]>([]);
  const [drop, setDrop] = useState<Spot | null>(null);
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [recent, setRecent] = useState<Spot[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) { setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { setHere({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false); },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  useEffect(() => {
    savedPlaces().then(setPlaces).catch(() => setPlaces([]));
    trips().then((t) => setRecent(recentDrops(t))).catch(() => setRecent([]));
  }, []);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 3 || (drop && drop.label === query)) { setFound([]); return; }
    timer.current = window.setTimeout(() => {
      searchPlaces(q, here, 'drop').then(setFound).catch(() => setFound([]));
    }, 250);
  }, [query, here, drop]);

  async function pick(p: Place) {
    const point = await placeToPoint(p.place_id, 'drop').catch(() => null);
    if (!point) { setNote(tr('We could not find that place. Try another.')); return; }
    setDrop({ label: p.description, point });
    setQuery(p.description);
    setFound([]);
    setNote(null);
  }

  function choose(s: Spot) {
    setDrop(s);
    setQuery(s.label);
    setFound([]);
  }

  async function save() {
    if (!drop) { setNote(tr('Pick a place first, then add it.')); return; }
    try {
      const p = await addPlace({ address_text: drop.label, latitude: drop.point.lat, longitude: drop.point.lng });
      setPlaces((all) => [...all, p]);
      setNote(null);
    } catch {
      setNote(tr('We could not save that place.'));
    }
  }

  const go = useMemo(() => {
    if (!here || !drop) return null;
    const q = new URLSearchParams({
      from: `${here.lat},${here.lng}`,
      to: `${drop.point.lat},${drop.point.lng}`,
      tl: drop.label,
    });
    return `/ride/choose?${q}`;
  }, [here, drop]);

  const chips = places.map(placeSpot).filter((s): s is Spot => s !== null);

  return (
    <div className="ar-split">
      <aside className="ar-panel">
        <div>
          <h1 className="a28">{tr('Where to?')}</h1>
          <p className="amut" style={{ marginTop: 4 }}>{tr('The fare is shown before you book, and it stays locked.')}</p>
        </div>
        <div className="acol" style={{ gap: 8 }}>
          <div className="afield">
            <span className="adot adot--on" aria-hidden="true" />
            <span style={{ color: 'var(--c-text)' }}>
              {here ? tr('Current location') : locating ? tr('Finding your location…') : tr('Allow location to set your pickup')}
            </span>
            <span className="aright aacc" aria-hidden="true"><ITarget size={18} /></span>
          </div>
          <label className="afield afield--on">
            <span className="adot" style={{ background: 'var(--c-text)', borderRadius: 2 }} aria-hidden="true" />
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (drop && e.target.value !== drop.label) setDrop(null); }}
              placeholder={tr('Where to?')}
              aria-label={tr('Where to?')}
            />
          </label>
          {found.length > 0 && (
            <div className="acard acol asep" role="listbox" aria-label={tr('Places')}>
              {found.slice(0, 5).map((p) => (
                <button key={p.place_id} type="button" role="option" aria-selected="false" className="arow"
                  style={{ padding: '12px 14px', border: 0, background: 'transparent', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
                  onClick={() => pick(p)}>
                  {p.description}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="arow" style={{ gap: 8, flexWrap: 'wrap' }}>
          {chips.map((s) => (
            <button key={s.label} type="button" className="achip" onClick={() => choose(s)}>
              <IHome size={16} />{split(s.label)[0]}
            </button>
          ))}
          <button type="button" className="achip" style={{ color: 'var(--c-text-2)' }} onClick={save}>
            <IPlus size={16} />{tr('Add a place')}
          </button>
        </div>
        {note && <p className="a14 ared" role="status">{note}</p>}
        {recent.length > 0 && (
          <div>
            <div className="albl">{tr('Recent')}</div>
            <div style={{ marginTop: 4 }}>
              {recent.map((s) => {
                const [name, rest] = split(s.label);
                return (
                  <button key={s.label} type="button" className="arow" onClick={() => choose(s)}
                    style={{ width: '100%', padding: '12px 0', borderBottom: '1px solid var(--c-border)', background: 'transparent', border: 0, borderBottomStyle: 'solid', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
                    <span className="aico"><IClock /></span>
                    <span className="agrow">
                      <span className="ab" style={{ display: 'block' }}>{name}</span>
                      {rest && <span className="a14 amut" style={{ display: 'block' }}>{rest}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <button type="button" className="abtn abtn--pri abtn--block" style={{ marginTop: 'auto' }} disabled={!go}
          onClick={() => go && router.push(go)}>
          {tr('See fares')}
        </button>
      </aside>
      <div className="ar-map">
        <MapSurface pickup={here} destination={drop?.point ?? null} />
      </div>
    </div>
  );
}
