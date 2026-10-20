import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Buttons start an action.
 *
 * ONE PRIMARY PER VIEW. `primary` is a `gold-500` fill with `on-gold` text,
 * and it is reserved for the thing the screen is for: "See fares", "Confirm
 * Sedan", "Request Sedan". A second gold button on the same screen means
 * neither of them is the primary one any more, and this is the component to
 * notice that in review -- there is no prop that makes it acceptable.
 *
 * `secondary` is for an equal alternative; `ghost` for dismissive actions
 * ("Cancel ride", "Sign in" in the nav).
 *
 * Hover lifts primary to `gold-300` with `shadow-glow`, and press drops it to
 * `gold-700`. That glow is the ONLY glow in the design system; nothing else
 * gets one.
 *
 * Sizes are 36 / 48 / 56px. `sm` is for the desktop nav and inline card
 * actions only -- under 768px the stylesheet lifts every button back to 48px
 * so nothing on a phone is below the touch target.
 */
function classesFor(variant: ButtonVariant, size: ButtonSize, block: boolean, extra: string) {
  return [
    'sg-btn',
    `sg-btn--${variant}`,
    size === 'md' ? '' : `sg-btn--${size}`,
    block ? 'sg-btn--block' : '',
    extra,
  ]
    .filter(Boolean)
    .join(' ');
}

type Shared = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
};

export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  className = '',
  children,
  ...rest
}: Shared & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={classesFor(variant, size, block, className)}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * The same button, as navigation.
 *
 * An action that changes the page is a link, so it works with a middle-click,
 * a long-press and a screen reader's link list. Styling it as a button does
 * not make it one.
 */
export function ButtonLink({
  href,
  variant = 'secondary',
  size = 'md',
  block = false,
  className = '',
  children,
  ...rest
}: Shared & { href: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className' | 'children'>) {
  return (
    <Link href={href} className={classesFor(variant, size, block, className)} {...rest}>
      {children}
    </Link>
  );
}
