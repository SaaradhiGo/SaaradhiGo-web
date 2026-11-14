'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from '@/i18n/LocaleProvider';
import type { Language } from '@/i18n/locales';
import { useTr } from '@/i18n/website';
import { type Profile, maskPhone, profile as loadProfile } from '@/lib/area/rider';
import { ILogout } from './icons';
import { useOneMenu } from './oneMenu';

/**
 * The profile button at the far right of every signed-in header (10 Nov): the photo or
 * initials and the first name with a down arrow (the avatar alone on phones), opening the
 * name, the masked mobile, the area's links, a divider and a one-click Sign out.
 */
/** `phone`: only on a phone, where the header has no room for it (14 Nov: Help). */
export type MenuLink = { href: string; label: string; phone?: boolean };

let shared: Promise<Profile> | null = null;

/** Forgets the cached account; sign-out calls it so the next account never sees this name. */
export function forgetAccount() { shared = null; }

/** The signed-in account, read once per page load and shared by the header and the page. */
export function useAccount(): [Profile | null, (p: Profile) => void] {
  const [me, setMe] = useState<Profile | null>(null);
  useEffect(() => {
    let live = true;
    shared ??= loadProfile().catch((e) => { shared = null; throw e; });
    shared.then((p) => { if (live) setMe(p); }, () => {});
    return () => { live = false; };
  }, []);
  return [me, (p) => { shared = Promise.resolve(p); setMe(p); }];
}

export function firstName(p: Profile | null): string {
  return (p?.full_name ?? '').trim().split(/\s+/)[0] ?? '';
}

export function initials(p: Profile | null): string {
  const parts = (p?.full_name ?? '').trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0] ?? '').toUpperCase();
}

/** The approved photo; the initials when there is none or it does not load (11 Nov). */
export function Avatar({ me, size = 36 }: { me: Profile | null; size?: number }) {
  const photo = me?.avatar;
  const [broken, setBroken] = useState<string | null>(null);
  const show = !!photo && /^https?:/.test(photo) && broken !== photo;
  return (
    <span className="apm-face" style={{ width: size, height: size }} aria-hidden="true" data-face={show ? 'photo' : 'initials'}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {show ? <img src={photo!} alt="" onError={() => setBroken(photo!)} /> : initials(me)}
    </span>
  );
}

export function ProfileMenu({ links, onSignOut, extra }: { links: MenuLink[]; onSignOut: () => void; extra?: React.ReactNode }) {
  const tr = useTr();
  const [me] = useAccount();
  const [open, setOpen] = useOneMenu('profile');
  const box = useRef<HTMLDivElement | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const { language, setLanguage } = useLocale();

  // Only the market's languages (10 Nov): a language this market does not offer falls back to English.
  useEffect(() => {
    const offered = me?.market_languages;
    if (offered?.length && !offered.includes(language)) setLanguage('en' as Language);
  }, [me, language, setLanguage]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open, setOpen]);

  const name = firstName(me);
  return (
    <div className="apm" ref={box}>
      <button ref={btn} type="button" className="apm-btn" data-testid="profile-button" aria-haspopup="menu" aria-expanded={open}
        aria-label={name ? tr('Account menu for {name}').replace('{name}', name) : tr('Account menu')}
        onClick={() => setOpen(!open)}>
        <Avatar me={me} />
        {name && <span className="apm-name">{name}</span>}
        <svg className="apm-caret" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="acard ar-menu apm-menu" role="menu">
          <div className="apm-who">
            <div className="ab">{me?.full_name || tr('Your account')}</div>
            {maskPhone(me?.phone_number) && <div className="a14 amut">{maskPhone(me?.phone_number)}</div>}
          </div>
          {links.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem" className={l.phone ? 'apm-phone' : undefined} onClick={() => setOpen(false)}>{tr(l.label)}</Link>
          ))}
          {extra}
          <hr className="apm-rule" />
          <button type="button" role="menuitem" data-testid="menu-sign-out" onClick={() => { setOpen(false); onSignOut(); }}>
            <ILogout size={18} />{tr('Sign out')}
          </button>
        </div>
      )}
    </div>
  );
}
