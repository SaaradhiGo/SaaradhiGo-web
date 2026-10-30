'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useAdminAccess } from '@/lib/adminScope';
import { canOpen, type Page } from '@/lib/consoleLinks';
import { ButtonLink } from '@/components/sg/Button';

/**
 * A link to another console page, drawn only if this operator can open it.
 *
 * THE LINK RULE (AUDIT 27.40): never render a link that leads where the role
 * cannot go. Hide, do not disable. `PageLink` keeps the words (an id, a
 * name) as plain text when it cannot be a link, because the row is still
 * information; `PageButtonLink` is for a button, which is simply not drawn.
 * The page behind a hidden link is still guarded by the server.
 */
export function PageLink({
  page, href, className, children,
}: { page: Page; href: string; className?: string; children: ReactNode }) {
  const access = useAdminAccess();
  return canOpen(access, page)
    ? <Link href={href} className={className}>{children}</Link>
    : <>{children}</>;
}

export function PageButtonLink({
  page, href, variant = 'secondary', size = 'sm', children,
}: {
  page: Page; href: string; variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
}) {
  const access = useAdminAccess();
  if (!canOpen(access, page)) return null;
  return <ButtonLink href={href} variant={variant} size={size}>{children}</ButtonLink>;
}
