'use client';

import Link from 'next/link';
import type { OperatorUser } from '@/lib/api';
import { AdminAccess, can } from '@/lib/adminScope';
import type { Theme } from '@/lib/consolePrefs';
import { ScopeSwitcher } from '@/components/console/ScopeSwitcher';
import { GlobalSearch } from '@/components/console/GlobalSearch';
import { EnvBadge } from '@/components/console/EnvBadge';
import { ProfileMenu } from '@/components/console/ProfileMenu';
import { Bell } from '@/components/console/icons';

/**
 * The strip above every page: where am I looking, find me something, which
 * environment is this, is anything on fire, and who am I.
 *
 * In that order, left to right, because that is the order the questions
 * come in. The region is first and leftmost: nothing on the page means
 * anything until it is answered.
 */
export function TopBar({
  access,
  operator,
  sosOpen,
  theme,
  onTheme,
  onSignOut,
}: {
  access: AdminAccess | null;
  operator: OperatorUser | null;
  sosOpen: number | undefined;
  theme: Theme;
  onTheme: (t: Theme) => void;
  onSignOut: () => void;
}) {
  const safety = can(access, 'safety.respond');
  const open = typeof sosOpen === 'number' ? sosOpen : null;
  return (
    <header className="ops__top">
      <div className="ops__top-left">
        <ScopeSwitcher access={access} />
      </div>
      <GlobalSearch access={access} />
      <div className="ops__top-right">
        <EnvBadge />
        {safety && (
          <Link
            href="/sos"
            className={`ops__bell ${open ? 'ops__bell--live' : ''}`}
            aria-label={open === null
              ? 'SOS alerts'
              : `SOS alerts, ${open} open`}
            title={open === null ? 'SOS alerts' : `${open} SOS alert${open === 1 ? '' : 's'} open`}
          >
            <Bell />
            {open ? <span className="ops__bell-count" aria-hidden="true">{open}</span> : null}
          </Link>
        )}
        <ProfileMenu
          operator={operator}
          access={access}
          theme={theme}
          onTheme={onTheme}
          onSignOut={onSignOut}
        />
      </div>
    </header>
  );
}
