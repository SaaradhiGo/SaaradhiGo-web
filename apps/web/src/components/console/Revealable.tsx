'use client';

import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { canRevealPii, useAdminAccess } from '@/lib/adminScope';
import {
  RevealTarget, revealErrorMessage, revealFields, revealSosContact,
} from '@/lib/reveal';
import { Eye, EyeOff } from '@/components/console/icons';

/**
 * A masked value with the way to its real one.
 *
 * The server masks every personal field in every operator response, for
 * every role. What this renders by default is therefore exactly what the
 * page already showed -- `+91••••••3210` -- and, for an operator who holds
 * `pii.view`, a small "Reveal" beside it. Pressing it opens a popover that
 * says the one thing that matters before the operator goes on: THIS REVEAL
 * IS LOGGED WITH YOUR NAME. A reason is optional and lands on the audit
 * row. Confirming asks the server for this ONE record's field(s); the
 * answer replaces the masked value on screen, tagged "revealed · logged",
 * with a way to mask it again.
 *
 * THE VALUE LIVES HERE AND NOWHERE ELSE. Component state only: not the
 * URL, not localStorage or sessionStorage, not a module cache. Navigating
 * away, re-masking or reloading forgets it, and the next look is another
 * logged reveal. That is the design, not a limitation.
 *
 * NOT A SECURITY CONTROL. Hiding the button for an operator without
 * `pii.view` saves them a click; the server refuses the reveal regardless,
 * and the refusals -- not held here, out of scope, incident closed, too
 * many this minute, audit unavailable -- are each shown in words.
 *
 * SOS goes through its own door (`target.type === 'sos_event'`), which
 * only answers while the incident is open or acknowledged. The caller
 * passes `disabledReason` for a closed one and the button is disabled with
 * that reason beside it, rather than offering a reveal the server will
 * refuse.
 *
 * THE POPOVER IS PORTALLED to `document.body` and positioned against the
 * trigger in viewport coordinates. Every panel in the console clips its
 * overflow and the drawer scrolls its body, so a popover left in place was
 * cut off -- and focusing its field scrolled the panel it sat in, taking
 * the panel's own heading out of view. Focus still moves in on open and
 * back to the trigger on close, which is what keeps the reading order
 * honest despite the DOM order.
 */
export type RevealableProps = {
  /** The value as the page shows it today: the masked string, or a node. */
  value: ReactNode;
  /** What is being revealed, for the labels: "rider phone", "UPI handle". */
  label: string;
  target: RevealTarget;
  /** The revealed key to show. For SOS: a key of `contact`. */
  field: string;
  /** Every field to ask for in this one call; defaults to `[field]`. */
  fields?: string[];
  /** How to show the revealed value; the default is the value as text. */
  render?: (value: unknown, all: Record<string, unknown>) => ReactNode;
  /** When set, the reveal is not offered and this says why. */
  disabledReason?: string;
  /** Icon only, for a subtitle or a dense row. */
  compact?: boolean;
};

type Phase = 'masked' | 'asking' | 'busy' | 'revealed';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function asText(v: unknown): ReactNode {
  if (v == null || v === '') return <span className="muted">Not on file</span>;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function Revealable({
  value,
  label,
  target,
  field,
  fields,
  render,
  disabledReason,
  compact = false,
}: RevealableProps) {
  const access = useAdminAccess();
  const allowed = canRevealPii(access);

  const [phase, setPhase] = useState<Phase>('masked');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, unknown> | null>(null);
  const [announce, setAnnounce] = useState('');

  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const remask = useRef<HTMLButtonElement>(null);
  const reasonField = useRef<HTMLInputElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const uid = useId();
  const titleId = `${uid}-title`;
  const noteId = `${uid}-note`;
  const reasonId = `${uid}-reason`;
  const whyId = `${uid}-why`;

  const open = phase === 'asking' || phase === 'busy';

  const close = useCallback((focusTrigger: boolean) => {
    setPhase('masked');
    setError(null);
    setReason('');
    if (focusTrigger) setTimeout(() => trigger.current?.focus(), 0);
  }, []);

  // The popover takes focus on open and gives it back on close.
  useEffect(() => {
    if (phase === 'asking') reasonField.current?.focus({ preventScroll: true });
  }, [phase]);

  // Below the trigger, aligned to its left edge, kept inside the viewport;
  // above it when there is no room below. Re-placed on scroll and resize
  // so it follows the value it is about.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const place = () => {
      const r = trigger.current?.getBoundingClientRect();
      if (!r) return;
      const gutter = 16;
      const width = Math.min(320, window.innerWidth - gutter * 2);
      const height = pop.current?.offsetHeight ?? 0;
      const left = Math.max(gutter, Math.min(r.left, window.innerWidth - width - gutter));
      const below = r.bottom + 6;
      const fitsBelow = below + height <= window.innerHeight - 8;
      const top = fitsBelow || r.top - height - 6 < 8 ? below : r.top - height - 6;
      setPos({ top, left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  // Escape closes; a click outside closes; Tab stays inside while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(true);
        return;
      }
      if (e.key !== 'Tab' || !pop.current) return;
      const items = pop.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrap.current?.contains(t) || pop.current?.contains(t)) return;
      close(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close]);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (phase === 'busy') return;
    setPhase('busy');
    setError(null);
    try {
      let values: Record<string, unknown>;
      if (target.type === 'sos_event') {
        const r = await revealSosContact(target.id, reason);
        values = r.contact;
      } else {
        const r = await revealFields(target, fields ?? [field], reason);
        values = r.fields;
      }
      setRevealed(values);
      setReason('');
      setPhase('revealed');
      setAnnounce(`${capital(label)} revealed. This reveal is logged with your name.`);
      // The trigger is gone; its successor sits in the same place.
      setTimeout(() => remask.current?.focus(), 0);
    } catch (err) {
      const message = revealErrorMessage(err);
      setError(message);
      setAnnounce(message);
      setPhase('asking');
      setTimeout(() => reasonField.current?.focus(), 0);
    }
  }

  function hide() {
    setRevealed(null);
    setPhase('masked');
    setAnnounce(`${capital(label)} masked again.`);
    setTimeout(() => trigger.current?.focus(), 0);
  }

  // Enter in the reason field submits the form; nothing else to do here,
  // but Space on the trigger must not scroll the page behind the popover.
  function onTriggerKey(e: ReactKeyboardEvent<HTMLButtonElement>) {
    if (e.key === ' ') e.preventDefault();
    if (e.key === ' ' || e.key === 'Enter') setPhase('asking');
  }

  if (!allowed) return <>{value}</>;

  const live = (
    <span className="sr-only" aria-live="polite" aria-atomic="true">{announce}</span>
  );

  if (phase === 'revealed' && revealed) {
    const shown = render ? render(revealed[field], revealed) : asText(revealed[field]);
    return (
      <span className="ops-reveal" ref={wrap} data-testid="revealable">
        <span className="ops-reveal__value">{shown}</span>
        <span className="ops-pill ops-pill--wait ops-reveal__tag">revealed · logged</span>
        <button
          ref={remask}
          type="button"
          className="ops-reveal__btn"
          onClick={hide}
          aria-label={`Hide ${label} again`}
          title="Mask again"
        >
          <EyeOff />
          {compact ? null : <span>Hide</span>}
        </button>
        {live}
      </span>
    );
  }

  return (
    <span className="ops-reveal" ref={wrap} data-testid="revealable">
      <span className="ops-reveal__value">{value}</span>
      <button
        ref={trigger}
        type="button"
        className="ops-reveal__btn"
        onClick={() => setPhase('asking')}
        onKeyDown={onTriggerKey}
        disabled={Boolean(disabledReason)}
        aria-label={`Reveal ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={disabledReason ? whyId : undefined}
        title={disabledReason}
      >
        <Eye />
        {compact ? null : <span>Reveal</span>}
      </button>
      {disabledReason ? <span className="ops-reveal__why" id={whyId}>{disabledReason}</span> : null}

      {open && createPortal(
        <div
          ref={pop}
          className="ops-reveal__pop"
          role="dialog"
          aria-labelledby={titleId}
          aria-describedby={noteId}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden' }}
        >
          <form onSubmit={(e) => void confirm(e)} className="ops-reveal__form" noValidate>
            <b id={titleId}>Reveal {label}</b>
            <p id={noteId}>This reveal is logged with your name.</p>
            <label htmlFor={reasonId}>Reason (optional)</label>
            <input
              ref={reasonField}
              id={reasonId}
              className="input"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={200}
              autoComplete="off"
              placeholder="e.g. payout dispute, ticket 881"
              disabled={phase === 'busy'}
            />
            {error ? <p className="ops-reveal__error">{error}</p> : null}
            <div className="ops-reveal__row">
              <button
                type="button"
                className="sg-btn sg-btn--ghost sg-btn--sm"
                onClick={() => close(true)}
                disabled={phase === 'busy'}
              >
                Cancel
              </button>
              <button type="submit" className="sg-btn sg-btn--primary sg-btn--sm" disabled={phase === 'busy'}>
                {phase === 'busy' ? 'Revealing…' : 'Reveal'}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
      {live}
    </span>
  );
}

function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
