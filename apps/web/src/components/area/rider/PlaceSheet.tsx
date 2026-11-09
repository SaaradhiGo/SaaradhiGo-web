'use client';

import { useEffect, useRef, useState } from 'react';
import MapSurface from '@/components/MapSurface';
import { useTr } from '@/i18n/website';
import { ApiError } from '@/lib/api';
import { type LatLng, type Place, placeToPoint, searchPlaces } from '@/lib/booking';
import { type PlaceLabel, type SavedPlace, createPlace, updatePlace } from '@/lib/area/rider';

export type PlaceDraft = { label?: PlaceLabel; name?: string; address_text?: string; point?: LatLng | null };

/**
 * Add or edit a saved place (9 Nov): find the address with the place search,
 * tap the small map to move the pin, choose Home, Work or Other (with a
 * name), and Save. `place` edits; `draft` prefills a new one.
 */
export function PlaceSheet({ place, draft, near, onClose, onSaved }: {
  place?: SavedPlace | null;
  draft?: PlaceDraft | null;
  near?: LatLng | null;
  onClose: () => void;
  onSaved: (p: SavedPlace) => void;
}) {
  const tr = useTr();
  const start = place
    ? { label: (place.label ?? 'other') as PlaceLabel, name: place.name ?? '', address: place.address_text,
      point: { lat: Number(place.latitude), lng: Number(place.longitude) } }
    : { label: draft?.label ?? 'home', name: draft?.name ?? '', address: draft?.address_text ?? '',
      point: draft?.point ?? null };
  const [label, setLabel] = useState<PlaceLabel>(start.label);
  const [name, setName] = useState(start.name);
  const [query, setQuery] = useState(start.address);
  const [address, setAddress] = useState(start.address);
  const [point, setPoint] = useState<LatLng | null>(start.point);
  const [found, setFound] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 3 || q === address) { setFound([]); return; }
    timer.current = window.setTimeout(() => {
      searchPlaces(q, near ?? point, 'drop').then(setFound).catch(() => setFound([]));
    }, 250);
  }, [query, address, near, point]);

  async function pick(p: Place) {
    const at = await placeToPoint(p.place_id, 'drop').catch(() => null);
    if (!at) { setError(tr('We could not find that place. Try another.')); return; }
    setPoint(at);
    setAddress(p.description);
    setQuery(p.description);
    setFound([]);
    setError(null);
  }

  async function save() {
    if (!point || !address.trim()) { setError(tr('Search for the address first.')); return; }
    if (label === 'other' && !name.trim()) { setError(tr('Give this place a name.')); return; }
    setBusy(true);
    setError(null);
    const body = { label, name: label === 'other' ? name.trim() : '', address_text: address.trim(),
      latitude: point.lat, longitude: point.lng };
    try {
      onSaved(place ? await updatePlace(place.id, body) : await createPlace(body));
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'PLACE_LIMIT' ? tr(e.message) : tr('We could not save that place.'));
    } finally {
      setBusy(false);
    }
  }

  const labels: { key: PlaceLabel; text: string }[] = [
    { key: 'home', text: tr('Home') }, { key: 'work', text: tr('Work') }, { key: 'other', text: tr('Other') },
  ];

  return (
    <div className="asheet-scrim" onClick={onClose}>
      <div className="asheet" role="dialog" aria-modal="true" aria-label={tr(place ? 'Edit place' : 'Add a place')}
        onClick={(e) => e.stopPropagation()}>
        <h2 className="a20">{tr(place ? 'Edit place' : 'Add a place')}</h2>
        <div className="acol" style={{ gap: 8 }}>
          <label className="afield afield--on">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('Search for an address')}
              aria-label={tr('Search for an address')} autoFocus={!place} />
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
        <div className="asheet__map">
          <MapSurface destination={point} onPick={(p) => setPoint(p)} />
        </div>
        <p className="a14 amut">{tr('Tap the map to move the pin to the exact spot.')}</p>
        <div role="radiogroup" aria-label={tr('Label')} className="arow" style={{ gap: 8, flexWrap: 'wrap' }}>
          {labels.map((l) => (
            <button key={l.key} type="button" role="radio" aria-checked={label === l.key}
              className={`achip${label === l.key ? ' achip--on' : ''}`} onClick={() => setLabel(l.key)}>
              {l.text}
            </button>
          ))}
        </div>
        {label === 'other' && (
          <label className="acol" style={{ gap: 6 }}>
            <span className="a14 amut">{tr('Name')}</span>
            <span className="afield"><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)}
              placeholder={tr('Gym, College, Mum’s…')} /></span>
          </label>
        )}
        {error && <p className="a14 ared" role="alert">{error}</p>}
        <div className="arow" style={{ gap: 8 }}>
          <button type="button" className="abtn abtn--ghost" onClick={onClose}>{tr('Cancel')}</button>
          <button type="button" className="abtn abtn--pri agrow" disabled={busy} onClick={save}>
            {busy ? tr('Saving…') : tr('Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
