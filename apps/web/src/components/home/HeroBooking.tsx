'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/sg/Button';
import { ArrowRight } from '@/components/sg/icons';
import { Place, placeToPoint, searchPlaces } from '@/lib/booking';
import { useT } from '@/i18n/LocaleProvider';

/**
 * Pickup, destination, and the one action the homepage is for.
 *
 * IT DOES NOT BOOK ANYTHING. It collects two locations and hands them to
 * `/book`, which owns the whole booking flow -- serviceability, per-class
 * quotes, dispatch, the trip socket. Nothing here calls an estimate endpoint
 * or computes a fare; duplicating any of that is how two prices end up on
 * one screen.
 *
 * A GUEST GETS REAL AUTOCOMPLETE. `/ride/maps/geocode` and
 * `/ride/maps/place-details` used to be `IsAuthenticated`, which is why an
 * earlier version of this control fell back to a plain text box when signed
 * out. They are now open to anonymous callers behind an IP throttle that
 * signed-in riders bypass, so a visitor can search, pick a real place and
 * carry its coordinates into the booking flow before being asked to sign in.
 * Ride operations next to them -- directions, estimates, trip creation --
 * are still authenticated.
 *
 * PICKUP NOW IS THE ONLY OPTION, AND IT IS NOT A DROPDOWN. There is no
 * scheduled-ride lifecycle in the backend: the Trip model has no scheduled
 * time and nothing dispatches a future booking. A "Schedule later" choice
 * would be a control that cannot do what it says, so the state is shown as
 * what it is and the menu is omitted.
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
  /** Set by geolocation: a real point with no place id behind it. */
  const [pickupPoint, setPickupPoint] = useState<{ lat: number; lng: number } | null>(null);

  const [active, setActive] = useState<'pickup' | 'dest' | null>(null);
  const [suggestions, setSuggestions] = useState<Place[]>([]);
  const [errors, setErrors] = useState<{ pickup?: string; dest?: string }>({});
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const t = useT();

  // Debounced lookup, and only for the field being typed in.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!active) return;
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
  }, [active, pickupText, destText]);

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
    if (!pickupText.trim()) next.pickup = t.validation.pickupRequired;
    if (!destText.trim()) next.dest = t.validation.destRequired;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    const params = new URLSearchParams();

    // A chosen place resolves to coordinates, which is what `/book` prefers.
    // If resolution fails the text still travels: the booking page can search
    // for it again, and nothing here pretends it was pinned.
    try {
      if (pickupPoint) {
        params.set('pickup', `${pickupPoint.lat},${pickupPoint.lng}`);
      } else if (pickupPlace) {
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

  /** Browser geolocation, only on an explicit click, with a usable error. */
  function useMyLocation() {
    if (!navigator.geolocation) {
      setErrors((p) => ({ ...p, pickup: t.validation.geoUnsupported }));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        // Coordinates are the honest label here: we have a point, not a
        // place name, and claiming a street address would be inventing one.
        setPickupText(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setPickupPlace(null);
        setPickupPoint({ lat: latitude, lng: longitude });
        setErrors((p) => ({ ...p, pickup: undefined }));
        setLocating(false);
      },
      () => {
        setErrors((p) => ({ ...p, pickup: t.validation.geoDenied }));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
      {/* Pickup now is the only timing the platform supports, so it is shown
          as a state rather than as a menu with one item. */}
      <div className="hp-when" aria-label={t.hero.pickupNow}>
        <ClockIcon />
        {t.hero.pickupNow}
      </div>

      {field('pickup', t.hero.pickupLabel, t.hero.pickupPlaceholder, pickupText, setPickupText, () => {
        setPickupPlace(null);
        setPickupPoint(null);
      })}

      <button type="button" className="hp-locate" onClick={useMyLocation} disabled={locating}>
        <LocateIcon />
        {locating ? t.hero.locating : t.hero.useLocation}
      </button>

      {field('dest', t.hero.destLabel, t.hero.destPlaceholder, destText, setDestText, () => setDestPlace(null))}

      <div className="mt-sg-2">
        <Button variant="primary" size="lg" block onClick={submit} disabled={busy}>
          {t.hero.cta}
          <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  );
}
