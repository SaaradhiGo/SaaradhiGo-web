'use client';

import { useId } from 'react';

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
  ...props
}: {
  label: string;
  error?: string | null;
  help?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const errorId = `${id}-error`;
  const helpId = `${id}-help`;
  const describedBy = [error ? errorId : null, help ? helpId : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <input
        id={id}
        className="input"
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy || undefined}
        {...props}
      />
      {help && (
        <p id={helpId} className="help">
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
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
  const cls =
    kind === 'error'
      ? 'alert-error'
      : kind === 'success'
        ? 'alert-success'
        : 'alert-info';
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
      className="btn-primary w-full"
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
  children,
  footer,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  // `sg-page` carries the design system's gutters: the public layout imposes
  // no container of its own, because the homepage hero and the booking
  // workspace are full-bleed maps.
  return (
    <div className="sg-page max-w-md">
      <h1 className="display-lg">{title}</h1>
      {intro && <p className="sg-lead mt-sg-2">{intro}</p>}
      <div className="card mt-sg-5 space-y-sg-4">{children}</div>
      {footer && <div className="mt-sg-5 space-y-sg-2 caption text-ink-muted">{footer}</div>}
    </div>
  );
}
