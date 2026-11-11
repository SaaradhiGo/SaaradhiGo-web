'use client';

/**
 * Share trip and Safety on the live trip (WebLiveTrip spec; PRODUCT_AUDIT §2).
 *
 * The web live trip had neither. Two secondary buttons, as in the design:
 * Share trip sends the rider's own text through the device share sheet (or
 * copies it); Safety opens the panel below the buttons with the SOS, the
 * market's emergency number and SaaradhiGo's support line when one is set.
 *
 * SOS FOLLOWS OWNER DECISION D4. Hold for 2 seconds to send -- pointer, or
 * Space/Enter for keyboard and switch users -- and it is sent the moment the
 * hold completes, with a vibration where the device has one. There is no
 * cancel delay; the way back is "Tap if this was a mistake", which closes the
 * rider's own alert through the same audited path ops use.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Share, Shield, Phone } from '@/components/sg/icons';
import {
  raiseSos,
  reportSosMistake,
  safetyNumbers,
  shareTripText,
  type SafetyNumbers,
} from '@/lib/tripSafety';

const HOLD_MS = 2000;

type Props = {
  tripId: number | string | null;
  country?: string | null;
  driverName?: string | null;
  plate?: string | null;
  pickupLabel?: string | null;
  destinationLabel?: string | null;
  position?: { lat: number; lng: number } | null;
  /** Where to look up the market when [country] is not known yet. */
  pickup?: { lat: number; lng: number } | null;
  /** Share the trip's live link instead of a text summary (rider area, 9 Nov). */
  onShare?: () => Promise<void> | void;
};

type Sos =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; id: number | null }
  | { kind: 'mistake-pending'; id: number }
  | { kind: 'mistaken'; id: number }
  | { kind: 'mistake-failed'; id: number }
  | { kind: 'failed' };

export function TripSafety(props: Props) {
  const { tripId, country } = props;
  const [open, setOpen] = useState(false);
  const [numbers, setNumbers] = useState<SafetyNumbers | null>(null);
  const [sos, setSos] = useState<Sos>({ kind: 'idle' });
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const holdStart = useRef<number | null>(null);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (!open || numbers) return;
    let live = true;
    safetyNumbers(country, props.pickup).then((n) => live && setNumbers(n));
    return () => {
      live = false;
    };
  }, [open, numbers, country, props.pickup]);

  const send = useCallback(async () => {
    if (tripId === null) return;
    setSos({ kind: 'sending' });
    try {
      navigator.vibrate?.(200);
    } catch {
      /* no vibration on this device */
    }
    try {
      const id = await raiseSos(tripId, props.position ?? null);
      setSos({ kind: 'sent', id });
    } catch {
      setSos({ kind: 'failed' });
    }
  }, [tripId, props.position]);

  const stopHold = useCallback(() => {
    holdStart.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (holdStart.current === null) return;
    const p = Math.min(1, (performance.now() - holdStart.current) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      stopHold();
      void send();
      return;
    }
    frame.current = requestAnimationFrame(tick);
  }, [send, stopHold]);

  const startHold = useCallback(() => {
    if (holdStart.current !== null || sos.kind === 'sending') return;
    holdStart.current = performance.now();
    frame.current = requestAnimationFrame(tick);
  }, [tick, sos.kind]);

  useEffect(() => stopHold, [stopHold]);

  async function mistake(id: number) {
    setSos({ kind: 'mistake-pending', id });
    try {
      await reportSosMistake(id);
      setSos({ kind: 'mistaken', id });
    } catch {
      setSos({ kind: 'mistake-failed', id });
    }
  }

  async function share() {
    if (props.onShare) {
      await props.onShare();
      return;
    }
    const text = shareTripText(props);
    setShareNote(null);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'My SaaradhiGo ride', text });
        return;
      }
    } catch (err) {
      // The rider closed the share sheet: nothing to say.
      if ((err as { name?: string })?.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShareNote('Trip details copied. Paste them to share.');
    } catch {
      setShareNote('Sharing is not available in this browser.');
    }
  }

  const emergency = numbers?.emergency;
  const reference =
    'id' in sos && sos.id !== null && sos.id !== undefined ? ` Reference #${sos.id}.` : '';

  return (
    <div className="grid gap-sg-3">
      <div className="grid grid-cols-2 gap-sg-3">
        <button type="button" className="sg-btn sg-btn--secondary" onClick={share}>
          <Share />
          Share trip
        </button>
        <button
          type="button"
          className="sg-btn sg-btn--secondary sg-btn--safety"
          aria-expanded={open}
          aria-controls="trip-safety-panel"
          onClick={() => setOpen((v) => !v)}
        >
          <Shield />
          Safety
        </button>
      </div>
      {shareNote && (
        <p className="caption text-ink-muted m-0" role="status">
          {shareNote}
        </p>
      )}

      {open && (
        <div id="trip-safety-panel" className="sg-safety" role="region" aria-label="Safety">
          {(sos.kind === 'idle' || sos.kind === 'failed' || sos.kind === 'sending') && (
            <button
              type="button"
              className="sg-sos"
              disabled={sos.kind === 'sending'}
              aria-describedby="sos-hint"
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture?.(e.pointerId);
                startHold();
              }}
              onPointerUp={stopHold}
              onPointerCancel={stopHold}
              onPointerLeave={stopHold}
              onKeyDown={(e) => {
                if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
                  e.preventDefault();
                  startHold();
                }
              }}
              onKeyUp={(e) => {
                if (e.key === ' ' || e.key === 'Enter') stopHold();
              }}
              onContextMenu={(e) => e.preventDefault()}
            >
              <span className="sg-sos__fill" style={{ transform: `scaleX(${progress})` }} />
              <span className="sg-sos__label">
                {sos.kind === 'sending'
                  ? 'Sending alert…'
                  : progress > 0
                    ? 'Keep holding'
                    : 'Hold to send SOS'}
              </span>
            </button>
          )}
          <p id="sos-hint" className="caption text-ink-muted m-0">
            Press and hold for 2 seconds. Our safety team gets your trip and location at once.
          </p>

          <div role="status" aria-live="assertive">
            {sos.kind === 'failed' && (
              <p className="body m-0 sg-safety__error">
                The alert did not go through.
                {emergency ? ` Call ${emergency} now.` : ' Call your local emergency number now.'}
              </p>
            )}
            {(sos.kind === 'sent' ||
              sos.kind === 'mistake-pending' ||
              sos.kind === 'mistake-failed') && (
              <div className="grid gap-sg-2">
                <p className="body m-0">
                  Alert sent. Our safety team has been alerted.{reference}
                </p>
                {'id' in sos && sos.id !== null && (
                  <button
                    type="button"
                    className="sg-btn sg-btn--ghost"
                    disabled={sos.kind === 'mistake-pending'}
                    onClick={() => mistake(sos.id as number)}
                  >
                    {sos.kind === 'mistake-failed'
                      ? 'That did not go through. Tap to try again'
                      : 'Tap if this was a mistake'}
                  </button>
                )}
              </div>
            )}
            {sos.kind === 'mistaken' && (
              <p className="body m-0">
                Marked as a mistake. Our safety team has been told.{reference}
              </p>
            )}
          </div>

          <div className="grid gap-sg-2">
            {emergency && (
              <a className="sg-btn sg-btn--secondary" href={`tel:${emergency}`}>
                <Phone />
                Call {numbers?.emergencyLabel ? `${numbers.emergencyLabel} ` : ''}
                {emergency}
              </a>
            )}
            {numbers?.support && (
              <a className="sg-btn sg-btn--ghost" href={`tel:${numbers.support}`}>
                <Phone />
                Call SaaradhiGo support
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
