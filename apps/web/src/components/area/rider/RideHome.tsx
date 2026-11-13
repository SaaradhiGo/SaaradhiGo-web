'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import MapSurface from '@/components/MapSurface';
import { useTr } from '@/i18n/website';
import { type LatLng, type Place, placeToPoint, searchPlaces } from '@/lib/booking';
import { fetchServiceAreas, primaryArea } from '@/lib/serviceAreas';
import { useLegal } from '@/components/sg/LegalProvider';
import { savedPlaces, saveDraft, streetAddress, trips, type PlaceLabel, type SavedPlace, type Trip } from '@/lib/area/rider';
import { type PlaceDraft, PlaceSheet } from './PlaceSheet';
import { IBriefcase, IClock, IHome, IPlus, ITarget } from '../icons';

type Spot = { label: string; point: LatLng; kind?: 'home' | 'work' | 'other' | null; name?: string };
type FieldKey = 'pickup' | 'drop';

/** Where a trip of the rider's last few went (or started), newest first, without repeats. */
function recentSpots(list: Trip[]): Spot[] {
  const seen = new Set<string>();
  const out: Spot[] = [];
  for (const t of list) {
    for (const [label, lat, lng] of [
      [t.destination_address, t.destination_lat, t.destination_long],
      [t.pickup_address, t.pickup_lat, t.pickup_long],
    ] as const) {
      const text = label?.trim();
      const p = { lat: Number(lat), lng: Number(lng) };
      if (!text || /^current location$/i.test(text) || !Number.isFinite(p.lat) || !Number.isFinite(p.lng) || seen.has(text)) continue;
      seen.add(text);
      out.push({ label: text, point: p });
      if (out.length === 3) return out;
    }
  }
  return out;
}

function placeSpot(p: SavedPlace): Spot | null {
  const lat = Number(p.latitude);
  const lng = Number(p.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { label: p.address_text, point: { lat, lng }, kind: p.label, name: p.name } : null;
}

/** The two halves of an address for a row: the place, then the rest. */
function split(label: string): [string, string | null] {
  const i = label.indexOf(',');
  return i > 0 ? [label.slice(0, i), label.slice(i + 1).trim()] : [label, null];
}

/** One searchable place field: the pickup and Where to? work the same way (11 Nov). */
function PlaceField({ field, label, value, query, onQuery, onPick, onFocus, error, near, inputRef, dot }: {
  field: FieldKey; label: string; value: Spot | null; query: string;
  onQuery: (q: string) => void; onPick: (s: Spot) => void; onFocus: () => void;
  error: string | null; near: LatLng | null; inputRef: React.RefObject<HTMLInputElement | null>; dot: React.ReactNode;
}) {
  const tr = useTr();
  const id = useId();
  const [found, setFound] = useState<Place[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 3 || (value && value.label === query)) { setFound([]); return; }
    timer.current = window.setTimeout(() => {
      searchPlaces(q, near, field).then(setFound).catch(() => setFound([]));
    }, 300); // 300 ms after the last keystroke (maps cost, 9 Nov)
  }, [query, near, value, field]);

  async function pick(p: Place) {
    const point = await placeToPoint(p.place_id, field).catch(() => null);
    if (!point) { setNote(tr('We could not find that place. Try another.')); return; }
    setNote(null);
    setFound([]);
    onPick({ label: p.description, point });
  }

  const listId = `${id}-list`;
  const errId = `${id}-err`;
  return (
    <div className="acol" style={{ gap: 4 }}>
      <label className={`afield afield--on${error ? ' afield--bad' : ''}`}>
        {dot}
        <input ref={inputRef} value={query} onChange={(e) => onQuery(e.target.value)} onFocus={onFocus}
          placeholder={label} aria-label={label} role="combobox" aria-autocomplete="list"
          aria-expanded={found.length > 0} aria-controls={listId} aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined} data-testid={`${field}-input`} />
      </label>
      {error && <p id={errId} className="a14 ared" data-testid={`${field}-error`}>{error}</p>}
      {note && <p className="a14 ared" role="status">{note}</p>}
      <div id={listId} role="listbox" aria-label={tr('Places')} className={found.length ? 'acard acol asep' : undefined} hidden={!found.length}>
        {found.slice(0, 5).map((p) => (
          <button key={p.place_id} type="button" role="option" aria-selected="false" className="arow"
            style={{ padding: '12px 14px', border: 0, background: 'transparent', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}
            onClick={() => pick(p)}>
            {p.description}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * /ride for a signed-in rider (rider-web-home.html). 11 Nov: the pickup is a search field like
 * Where to?, with Use my location, Home, Work and Recent, and the pin can be moved on the map;
 * with location denied the search still works. Coordinates never go into the URL.
 */
export function RideHome() {
  const tr = useTr();
  const router = useRouter();
  const [pickup, setPickup] = useState<Spot | null>(null);
  const [pickupQuery, setPickupQuery] = useState('');
  const [drop, setDrop] = useState<Spot | null>(null);
  const [dropQuery, setDropQuery] = useState('');
  const [active, setActive] = useState<FieldKey>('drop');
  const [locating, setLocating] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<FieldKey, string | null>>({ pickup: null, drop: null });
  const [places, setPlaces] = useState<SavedPlace[]>([]);
  const [recent, setRecent] = useState<Spot[]>([]);
  const [sheet, setSheet] = useState<PlaceDraft | null>(null);
  const pickupRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLInputElement>(null);

  function setField(f: FieldKey, s: Spot) {
    if (f === 'pickup') { setPickup(s); setPickupQuery(s.label); } else { setDrop(s); setDropQuery(s.label); }
    setErrors((e) => ({ ...e, [f]: null }));
  }

  /** A point becomes a street address before it is shown or booked ("Current location" never is). */
  async function pickupAt(point: LatLng, provisional: string) {
    setField('pickup', { label: provisional, point });
    const address = await streetAddress(point).catch(() => null);
    if (!address) return;
    setPickup((p) => (p && p.point === point ? { ...p, label: address } : p));
    setPickupQuery((q) => (q === provisional ? address : q));
  }

  function locateMe(quiet = false) {
    if (!navigator.geolocation) { if (!quiet) setLocNote(tr('Location is not available in this browser. Type your pickup instead.')); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocating(false); setLocNote(null); void pickupAt({ lat: p.coords.latitude, lng: p.coords.longitude }, tr('Finding your address…')); },
      () => { setLocating(false); setLocNote(tr('Location is off. Type your pickup or tap the map to place it.')); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  useEffect(() => {
    locateMe(true);
    savedPlaces().then(setPlaces).catch(() => setPlaces([]));
    trips().then((t) => setRecent(recentSpots(t))).catch(() => setRecent([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** "Add a place" (or "Set home" / "Set work"): the sheet, prefilled with the chosen destination. */
  function addPlace(label: PlaceLabel = 'home') {
    setSheet({ label, address_text: drop?.label ?? '', point: drop?.point ?? null });
  }

  function saved(p: SavedPlace) {
    setPlaces((all) => [...all.filter((x) => x.id !== p.id), p]);
    setSheet(null);
    const s = placeSpot(p);
    if (s) setField(active, s);
  }

  function seeFares() {
    const missing = {
      pickup: pickup ? null : tr('Set your pickup: search, use your location or tap the map.'),
      drop: drop ? null : tr('Choose where you are going.'),
    };
    setErrors(missing);
    if (!pickup) { pickupRef.current?.focus(); return; }
    if (!drop) { dropRef.current?.focus(); return; }
    const id = saveDraft({ from: { ...pickup.point, label: pickup.label }, to: { ...drop.point, label: drop.label } });
    router.push(`/ride/choose?d=${id}`);
  }

  // Home first, then Work, then the rest, as the rider app orders them.
  const order = { home: 0, work: 1, other: 2 } as const;
  const chips = places.map(placeSpot).filter((s): s is Spot => s !== null)
    .sort((a, b) => order[a.kind ?? 'other'] - order[b.kind ?? 'other']);
  // 13 Nov (owner): with no location the map shows the rider's city, never the world: their last
  // trip, else a saved place, else the market's launch city (Hyderabad in India).
  const { market } = useLegal();
  const [launchCity, setLaunchCity] = useState<LatLng | null>(null);
  useEffect(() => {
    let live = true;
    fetchServiceAreas().then((areas) => {
      const mine = areas.filter((a) => (a.zone as { country?: string }).country === market);
      if (live) setLaunchCity((primaryArea(mine.length ? mine : areas) ?? null)?.centre ?? null);
    }).catch(() => {});
    return () => { live = false; };
  }, [market]);
  const cityCentre = useMemo(() => recent[0]?.point ?? chips[0]?.point ?? launchCity, [recent, chips, launchCity]);
  const target = active === 'pickup' ? tr('pickup') : tr('destination');

  return (
    <div className="ar-split">
      <aside className="ar-panel">
        <div>
          <h1 className="a28">{tr('Where to?')}</h1>
          <p className="amut" style={{ marginTop: 4 }}>{tr('The fare is shown before you book, and it stays locked.')}</p>
        </div>
        <div className="acol" style={{ gap: 8 }}>
          <PlaceField field="pickup" label={tr('Pickup')} value={pickup} query={pickupQuery} near={drop?.point ?? cityCentre}
            onQuery={(q) => { setPickupQuery(q); if (pickup && q !== pickup.label) setPickup(null); }}
            onPick={(s) => setField('pickup', s)} onFocus={() => setActive('pickup')} error={errors.pickup}
            inputRef={pickupRef} dot={<span className="adot adot--on" aria-hidden="true" />} />
          <button type="button" className="achip" style={{ alignSelf: 'flex-start' }} onClick={() => locateMe()} disabled={locating}
            data-testid="use-my-location">
            <ITarget size={16} />{locating ? tr('Finding your location…') : tr('Use my location')}
          </button>
          {locNote && <p className="a14 amut" role="status" data-testid="location-note">{locNote}</p>}
          <PlaceField field="drop" label={tr('Where to?')} value={drop} query={dropQuery} near={pickup?.point ?? cityCentre}
            onQuery={(q) => { setDropQuery(q); if (drop && q !== drop.label) setDrop(null); }}
            onPick={(s) => setField('drop', s)} onFocus={() => setActive('drop')} error={errors.drop}
            inputRef={dropRef} dot={<span className="adot" style={{ background: 'var(--c-text)', borderRadius: 2 }} aria-hidden="true" />} />
        </div>
        <div>
          <div className="albl" id="choices-for">{tr('Choose a {field}').replace('{field}', target)}</div>
          <div className="arow" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }} role="group" aria-labelledby="choices-for">
            {(['home', 'work'] as const).map((kind) => {
              const s = chips.find((c) => c.kind === kind);
              const Icon = kind === 'work' ? IBriefcase : IHome;
              return s ? (
                <button key={kind} type="button" className="achip" onClick={() => setField(active, s)}>
                  <Icon size={16} />{tr(kind === 'home' ? 'Home' : 'Work')}
                </button>
              ) : (
                <button key={kind} type="button" className="achip" style={{ color: 'var(--c-text-2)' }} onClick={() => addPlace(kind)}>
                  <Icon size={16} />{tr(kind === 'home' ? 'Set home' : 'Set work')}
                </button>
              );
            })}
            {chips.filter((c) => c.kind !== 'home' && c.kind !== 'work').map((s) => (
              <button key={`${s.label}-${s.point.lat}`} type="button" className="achip" onClick={() => setField(active, s)}>
                {s.name || split(s.label)[0]}
              </button>
            ))}
            <button type="button" className="achip" style={{ color: 'var(--c-text-2)' }} onClick={() => addPlace('other')}>
              <IPlus size={16} />{tr('Add a place')}
            </button>
          </div>
        </div>
        {recent.length > 0 && (
          <div>
            <div className="albl">{tr('Recent')}</div>
            <div style={{ marginTop: 4 }}>
              {recent.map((s) => {
                const [name, rest] = split(s.label);
                return (
                  <button key={s.label} type="button" className="arow" onClick={() => setField(active, s)}
                    style={{ width: '100%', padding: '12px 0', background: 'transparent', border: 'none', borderBottom: '1px solid var(--c-border)', font: 'inherit', color: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
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
        <p className="a14 amut">{tr('Tap the map to move the pickup pin.')}</p>
        <button type="button" className="abtn abtn--pri abtn--block" style={{ marginTop: 'auto' }} onClick={seeFares}>
          {tr('See fares')}
        </button>
      </aside>
      <div className="ar-map">
        <MapSurface pickup={pickup?.point ?? null} destination={drop?.point ?? null} cityCentre={cityCentre}
          onPick={(p) => void pickupAt(p, tr('Finding the address…'))} />
      </div>
      {sheet && <PlaceSheet draft={sheet} near={pickup?.point ?? null} onClose={() => setSheet(null)} onSaved={saved} />}
    </div>
  );
}
