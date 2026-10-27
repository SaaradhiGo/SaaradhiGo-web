'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { OperatorUser } from '@/lib/api';
import type { AdminAccess } from '@/lib/adminScope';
import type { Theme } from '@/lib/consolePrefs';
import { ChevronDown, LogOut, Moon, Sun } from '@/components/console/icons';

/**
 * Who is signed in, and the two things they can do about it: switch the
 * theme and sign out.
 *
 * The role line is here as well as nowhere else: an operator refused by a
 * page should be able to see which hat they are wearing without leaving
 * it. A break-glass session is labelled as such, in the colour the rest of
 * the console reserves for things with a clock on them, because every
 * minute on that account is being watched.
 */
export function ProfileMenu({
  operator,
  access,
  theme,
  onTheme,
  onSignOut,
}: {
  operator: OperatorUser | null;
  access: AdminAccess | null;
  theme: Theme;
  onTheme: (t: Theme) => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const name = (access?.full_name || operator?.full_name || '').trim() || 'Operator';
  const handle = access?.email || operator?.email || operator?.phone_number || '';
  const initials = name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'OP';
  const roles = access?.roles?.map((r) => r.role_name) ?? [];
  const roleLine = [...new Set(roles)].join(', ');
  const breakGlass = Boolean(access?.is_break_glass);

  return (
    <div className="ops__profile" ref={root}>
      <button
        ref={button}
        type="button"
        className="ops__profile-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`ops__avatar ${breakGlass ? 'ops__avatar--glass' : ''}`} aria-hidden="true">
          {initials}
        </span>
        <span className="ops__profile-name">{name}</span>
        <ChevronDown className="ops__profile-caret" />
      </button>

      {open && (
        <div className="ops-menu" role="menu" id={menuId} aria-label="Account">
          <div className="ops-menu__who">
            <b>{name}</b>
            {handle ? <span>{handle}</span> : null}
            {breakGlass ? (
              <span className="ops-menu__glass">Emergency account · every action is recorded</span>
            ) : roleLine ? (
              <span className="ops-menu__role">{roleLine}</span>
            ) : null}
          </div>
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={theme === 'light'}
            className="ops-menu__item"
            onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun /> : <Moon />}
            {theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="ops-menu__item"
            onClick={() => { setOpen(false); onSignOut(); }}
          >
            <LogOut />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
