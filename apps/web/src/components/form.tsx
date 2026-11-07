'use client';

import { useId } from 'react';
import { TickIcon } from '@/components/sg/SiteIcons';
import { useSite } from '@/i18n/site';

/**
 * Form primitives shared by every auth page.
 *
 * The point is not to save typing. It is that the accessible wiring --
 * label/input association, aria-invalid, aria-describedby, and an error that
 * is announced rather than only coloured -- is done once and cannot be
 * forgotten on the fifth form.
 */

export function Field({
  label,
  error,
  help,
  className,
  ...props
}: {
  label: string;
  error?: string | null;
  help?: string;
  /** For the field's wrapper, e.g. a grid column; the input keeps `.input`. */
  className?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const describedBy = [error ? errorId : null, help ? helpId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={`s-field ${className ?? ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />
      {help && (
        <p id={helpId} className="s-help">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="s-err">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * A status block that screen readers announce when it appears.
 *
 * `role="alert"` for errors (interrupts), `role="status"` for the rest
 * (waits for a pause). Without these, a sighted user sees the result and a
 * screen-reader user is told nothing at all.
 */
export function Alert({
  kind,
  children,
}: {
  kind: 'error' | 'success' | 'info';
  children: React.ReactNode;
}) {
  const cls = `s-alert s-alert--${kind}`;
  return (
    <p className={cls} role={kind === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

/** Primary action with its own busy state, so no page re-implements one. */
export function SubmitButton({
  busy,
  children,
  busyLabel = 'Working…',
  disabled,
  ...props
}: {
  busy?: boolean;
  busyLabel?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  // `disabled` is pulled OUT of the spread deliberately. It used to be
  // computed as `busy || props.disabled` and then `{...props}` was spread
  // afterwards, so a caller passing `disabled={false}` re-enabled the button
  // while a submission was still in flight -- a double-submit waiting for the
  // first caller to pass the prop at all. Now the two reasons to be disabled
  // are combined once and nothing can overwrite the result.
  return (
    <button
      type="submit"
      className="s-btn s-btn--primary s-submit"
      disabled={Boolean(busy) || Boolean(disabled)}
      aria-busy={busy || undefined}
      {...props}
    >
      {busy ? busyLabel : children}
    </button>
  );
}

/** The frame every auth page uses, so they are not subtly different widths. */
export function AuthShell({
  title,
  intro,
  alt,
  children,
  footer,
}: {
  title: string;
  intro?: string;
  /** "Have one? Log in": the way to the other form, beside the title. */
  alt?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // Sign up and Log in (approved design, 2026-11-07; SignUp.html): the logo
  // and what an account gives you on black, the form card beside it. The
  // whole form and its button fit 1366x768. On a phone the card is the page.
  const a = useSite().auth;
  return (
    <section className="s-wrap s-page s-auth s-cb">
      <div className="s-auth__aside">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lockup-gold.svg" alt="SaaradhiGo logo" width={172} height={186} />
        <div>
          <div className="t-heading">{a.asideTitle}</div>
          <ul>
            {a.asideList.map((x) => (
              <li key={x}><TickIcon />{x}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="s-auth__card">
        <div className="s-auth__head">
          <h1 className="t-heading">{title}</h1>
          {alt && <span>{alt}</span>}
        </div>
        {intro && <p className="t-muted" style={{ margin: 0 }}>{intro}</p>}
        {children}
        {footer && <div className="s-auth__fine">{footer}</div>}
      </div>
    </section>
  );
}
