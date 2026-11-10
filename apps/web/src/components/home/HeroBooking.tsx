'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DropMark, PickupMark } from '@/components/art/MiniMaps';
import { LocateIcon } from '@/components/sg/SiteIcons';
import { LatLng, Place, placeToPoint, searchPlaces, serviceabilityAt } from '@/lib/booking';
import { fetchServiceAreas, primaryArea } from '@/lib/serviceAreas';
import { useLocale } from '@/i18n/LocaleProvider';
import { useSite } from '@/i18n/site';
import { SITE_FLAGS } from '@/lib/siteFlags';

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
 * THE SEARCH IS BIASED TOWARDS A CITY WE SERVE. Unbiased, the provider
 * searches the world: typing "Banjara" returned a regency in Indonesia and
 * not Banjara Hills. The bias is the rider's own location once they have
 * shared it, and otherwise the first live service area from
 * `/pricing/zones/` -- the server's list, not a hardcoded city. If the zones
 * call fails there is simply no bias, which is the old behaviour rather than
 * a broken one.
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
  /** A reason the suggestion list is empty, when there is one worth saying. */
  const [searchNote, setSearchNote] = useState<string | null>(null);
  // Where to bias the place search. Starts as the first live service area
  // and is replaced by the rider's own position the moment they share it.
  const [searchNear, setSearchNear] = useState<LatLng | null>(null);
  // The active city: suggestions are RESTRICTED to its zone (owner, 2026-11-06).
  const [area, setArea] = useState<{ code: string; name: string } | null>(null);
  /** Coordinates of the chosen places, resolved once on choosing. */
  const [resolved, setResolved] = useState<{ pickup?: LatLng; dest?: LatLng }>({});
  const { t } = useLocale();
  const h = useSite().home;
  // The phone design words the pickup as an invitation to use the location.
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchServiceAreas()
      .then((areas) => {
        const area = primaryArea(areas);
        if (!cancelled && area) setArea({ code: area.zone.code, name: area.zone.city || area.zone.name });
        if (!cancelled && area?.centre) {
          // Only as a default: an explicit location wins, and is set below.
          setSearchNear((current) => current ?? area.centre);
        }
      })
      .catch(() => {
        /* No bias is worse than a wrong one, so this stays silent. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      searchPlaces(text, searchNear, active === 'pickup' ? 'pickup' : 'drop', area?.code)
        .then((places) => {
          setSuggestions(places);
          setSearchNote(null);
        })
        .catch((err) => {
          setSuggestions([]);
          // A rate limit is a REASON, not an empty result. The guest cap is
          // shared across anonymous callers, so a visitor can hit it through
          // no fault of their own; showing nothing leaves them retyping into
          // a box that will never answer. 429 says wait, or sign in -- a
          // signed-in rider bypasses the cap entirely.
          const status = (err as { status?: number } | null)?.status;
          setSearchNote(status === 429 ? t.validation.searchThrottled : null);
        });
    }, 300); // 300 ms after the last keystroke (maps cost, 9 Nov)
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // `t` is in the deps because the throttle note is a translated string:
    // without it, switching language mid-search would leave the previous
    // language's message on screen. `searchNear` is here so that sharing a
    // location re-runs the search around the rider rather than leaving the
    // city-centre results on screen.
  }, [active, pickupText, destText, searchNear, area?.code, t.validation.searchThrottled]);

  function choose(place: Place) {
    const which = active === 'pickup' ? 'pickup' : 'dest';
    if (which === 'pickup') {
      setPickupPlace(place);
      setPickupText(place.description);
    } else {
      setDestPlace(place);
      setDestText(place.description);
    }
    setSuggestions([]);
    setActive(null);
    // A place outside every service area says so at once, not at booking.
    void placeToPoint(place.place_id, which === 'pickup' ? 'pickup' : 'drop')
      .then(async (point) => {
        if (!point) return;
        setResolved((r) => ({ ...r, [which]: point }));
        const where = await serviceabilityAt(point).catch(() => null);
        if (where && !where.serviceable && area) {
          setErrors((p) => ({ ...p, [which]: t.validation.notInArea.replace('{area}', area.name) }));
        }
      })
      .catch(() => { /* resolved again at submit */ });
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
        const p = resolved.pickup ?? await placeToPoint(pickupPlace.place_id);
        if (p) params.set('pickup', `${p.lat},${p.lng}`);
      }
      if (destPlace) {
        const d = resolved.dest ?? await placeToPoint(destPlace.place_id, 'drop');
        if (d) params.set('dest', `${d.lat},${d.lng}`);
      }
    } catch {
      // Fall through to the text handoff below.
    }

    if (!params.has('dest') && destText.trim()) params.set('q', destText.trim());

    // THE WORDS TRAVEL, NOT JUST THE COORDINATES. `/book` used to receive
    // only lat/lng, so it showed a rider "17.38500, 78.48670" where they had
    // typed "Banjara Hills". Sending the label they actually chose lets the
    // next screen repeat their trip back to them in their own words, which
    // matters most to a signed-out visitor who has to sign in before going
    // any further.
    if (pickupText.trim()) params.set('pickup_label', pickupText.trim());
    if (destText.trim()) params.set('dest_label', destText.trim());

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
        // From here on, search around the rider, inside their own zone.
        setSearchNear({ lat: latitude, lng: longitude });
        serviceabilityAt({ lat: latitude, lng: longitude })
          .then((where) => {
            if (where.zone) setArea({ code: where.zone.code, name: where.zone.name });
          })
          .catch(() => { /* keep the launch city */ });
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
    <div className="s-book__field">
      <div className="s-book__box" data-invalid={errors[which] ? 'true' : undefined}>
        {which === 'pickup' ? <PickupMark className="s-book__marker" /> : <DropMark className="s-book__marker" />}
        <input
          id={`hp-${which}`}
          aria-label={label}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={errors[which] ? true : undefined}
          aria-describedby={errors[which] ? `hp-${which}-error` : undefined}
          onFocus={() => setActive(which)}
          onChange={(e) => {
            setValue(e.target.value);
            clearPlace();
            setResolved((r) => ({ ...r, [which]: undefined }));
            if (errors[which]) setErrors((p) => ({ ...p, [which]: undefined }));
          }}
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
        {which === 'pickup' && (
          <button
            type="button"
            className="s-book__locate"
            onClick={useMyLocation}
            disabled={locating}
            aria-label={locating ? t.hero.locating : h.useLocation}
            title={h.useLocation}
          >
            <LocateIcon />
          </button>
        )}
      </div>
      {errors[which] && (
        <p className="s-book__error" id={`hp-${which}-error`} role="alert">
          {errors[which]}
        </p>
      )}
      {active === which && suggestions.length > 0 && (
        <div className="s-book__suggest" role="group" aria-label={`${label} suggestions`}>
          {suggestions.map((p) => (
            <button key={p.place_id} type="button" onClick={() => choose(p)}>
              {p.description}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  // Scheduling is drawn in the design but the backend has no scheduled trips
  // yet (no scheduled time on a Trip, nothing dispatches later), so the tab
  // is shown and disabled rather than taking a booking it cannot keep.
  return (
    <form
      className="s-book"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {/* Ride now / Schedule waits for scheduled rides in the backend
          (owner, 2026-11-07). With one option there is no switch. */}
      {SITE_FLAGS.scheduledRides && (
        <div className="s-book__modes s-only-desk" role="group" aria-label={h.tripType}>
          <button type="button" className="s-book__mode" aria-pressed="true">
            {h.rideNow}
          </button>
          <button type="button" className="s-book__mode" disabled>
            {h.schedule}
          </button>
        </div>
      )}
      <div className="s-book__fields">
        <span className="s-book__dots s-only-desk" aria-hidden="true" />
        {field('pickup', h.pickup, phone ? h.pickupPlaceholderPhone : h.pickupPlaceholder, pickupText, setPickupText, () => {
          setPickupPlace(null);
          setPickupPoint(null);
        })}
        {field('dest', h.dest, h.destPlaceholder, destText, setDestText, () => setDestPlace(null))}
      </div>

      {searchNote && (
        <p className="s-book__error" role="status">
          {searchNote}
        </p>
      )}

      <button type="submit" className="s-btn s-btn--primary s-book__go" disabled={busy}>
        {h.seeFares}
      </button>
    </form>
  );
}
