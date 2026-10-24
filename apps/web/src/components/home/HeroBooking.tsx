'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/sg/Button';
import { ArrowRight } from '@/components/sg/icons';
import { Place, placeToPoint, searchPlaces } from '@/lib/booking';
import { readRiderToken } from '@/lib/publicAuth';

/**
 * Pickup, destination, and the one action the homepage is for.
 *
 * IT DOES NOT BOOK ANYTHING. It collects two locations and hands them to
 * `/book`, which owns the whole booking flow -- serviceability, per-class
 * quotes, dispatch, the trip socket. Nothing here calls an estimate endpoint
 * or computes a fare; duplicating any of that is how two prices end up on
 * one screen.
 *
 * AUTOCOMPLETE IS ONLY OFFERED WHEN IT CAN ACTUALLY WORK.
 * `/ride/maps/geocode` is authenticated -- it answers 401 without a rider
 * token -- so a signed-out visitor has no place search. Rather than show a
 * suggestion box that silently never fills, the control checks for a session
 * first: signed in, you get real Places suggestions; signed out, you type
 * freely and the text is carried to `/book`, which runs the search once you
 * are signed in. The visitor is never told a location was resolved when it
 * was not.
 *
 * WHAT IS HANDED OVER. `/book` already reads `pickup`, `dest` and `q` from
 * the query string, so a resolved place travels as coordinates and typed
 * text travels as text. That is the existing contract; this adds nothing
 * to it.
 */
export function HeroBooking() {
  const router = useRouter();

  const [pickupText, setPickupText] = useState('');
  const [destText, setDestText] = useState('');
  const [pickupPlace, setPickupPlace] = useState<Place | null>(null);
  const [destPlace, setDestPlace] = useState<Place | null>(null);

  const [canSearch, setCanSearch] = useState(false);
  const [active, setActive] = useState<'pickup' | 'dest' | null>(null);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [errors, setErrors] = useState<{ pickup?: string; dest?: string }>({});
  const [busy, setBusy] = useState(false);

  // The session decides whether place search is available at all.
  useEffect(() => {
    setCanSearch(Boolean(readRiderToken()));
  }, []);

  // Debounced lookup, and only for the field being typed in.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!canSearch || !active) return;
    const text = active === 'pickup' ? pickupText : destText;
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      searchPlaces(text)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [canSearch, active, pickupText, destText]);

  function choose(place: Place) {
    if (active === 'pickup') {
      setPickupPlace(place);
      setPickupText(place.description);
    } else {
      setDestPlace(place);
      setDestText(place.description);
    }
    setSuggestions([]);
    setActive(null);
  }

  async function submit() {
    // Both are required. An empty field is a validation error, not a silent
    // navigation to a half-filled booking page.
    const next: { pickup?: string; dest?: string } = {};
    if (!pickupText.trim()) next.pickup = 'Enter a pickup location.';
    if (!destText.trim()) next.dest = 'Enter a destination.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const params = new URLSearchParams();

    // A chosen place resolves to coordinates, which is what `/book` prefers.
    // If resolution fails the text still travels: the booking page can search
    // for it again, and nothing here pretends it was pinned.
    try {
      if (pickupPlace) {
        const p = await placeToPoint(pickupPlace.place_id);
        if (p) params.set('pickup', `${p.lat},${p.lng}`);
      }
      if (destPlace) {
        const d = await placeToPoint(destPlace.place_id);
        if (d) params.set('dest', `${d.lat},${d.lng}`);
      }
    } catch {
      // Fall through to the text handoff below.
    }

    if (!params.has('dest') && destText.trim()) params.set('q', destText.trim());
    setBusy(false);
    router.push(params.toString() ? `/book?${params.toString()}` : '/book');
  }

  const field = (
    which: 'pickup' | 'dest',
    label: string,
    placeholder: string,
    value: string,
    setValue: (v: string) => void,
    clearPlace: () => void,
  ) => (
    <div className="hp-field">
      <label className="hp-field__label" htmlFor={`hp-${which}`}>
        {label}
      </label>
      <div className="hp-field__box" data-invalid={errors[which] ? 'true' : undefined}>
        <span
          className={`hp-field__marker hp-field__marker--${which === 'pickup' ? 'pickup' : 'drop'}`}
          aria-hidden="true"
        />
        <input
          id={`hp-${which}`}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={errors[which] ? true : undefined}
          aria-describedby={errors[which] ? `hp-${which}-error` : undefined}
          onFocus={() => setActive(which)}
          onChange={(e) => {
            setValue(e.target.value);
            clearPlace();
            if (errors[which]) setErrors((p) => ({ ...p, [which]: undefined }));
          }}
          // Closing on blur would eat the click on a suggestion, so the list
          // is dismissed by Escape or by choosing something.
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setSuggestions([]);
              setActive(null);
            }
            if (e.key === 'Enter') {
              e.preventDefault();
              void submit();
            }
          }}
        />
      </div>
      {errors[which] && (
        <p className="hp-error" id={`hp-${which}-error`} role="alert">
          {errors[which]}
        </p>
      )}
      {active === which && suggestions.length > 0 && (
        <div className="hp-suggest" role="group" aria-label={`${label} suggestions`}>
          {suggestions.map((p) => (
            <button key={p.place_id} type="button" onClick={() => choose(p)}>
              {p.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="hp-hero__form">
      {field('pickup', 'Pickup location', 'Enter pickup location', pickupText, setPickupText, () => setPickupPlace(null))}
      {field('dest', 'Destination', 'Where to?', destText, setDestText, () => setDestPlace(null))}

      <div className="mt-sg-2">
        <Button variant="primary" size="lg" block onClick={submit} disabled={busy}>
          See ride options
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}
