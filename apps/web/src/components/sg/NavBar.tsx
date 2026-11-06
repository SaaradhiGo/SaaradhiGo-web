'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthNav from '@/components/AuthNav';
import { Logo } from './Logo';
import { Close, Menu } from './icons';
import { LanguagePicker } from './LanguagePicker';
import { ThemeToggle } from './ThemeToggle';
import { useT } from '@/i18n/LocaleProvider';

/**
 * The public header: logo left, links centred, session controls right.
 *
 * THE BAR FOLLOWS THE THEME (owner, 2026-11-06): ivory with the deep-gold
 * logo in Daylight, black and gold in dark.
 *
 * ONE LOGO AT THE TOP. The homepage hero carries the full logo, so there the
 * bar shows the badge and name only once the hero has scrolled away. Every
 * other page shows them always.
 *
 * EVERY LINK RESOLVES TO A PAGE OF ITS OWN. These were homepage anchors
 * while /ride, /safety, /about and /help did not exist; all five are real
 * routes now, so the header no longer sends a visitor to a fragment and
 * nothing points at `href="#"`.
 *
 * The theme switch sits just left of Log in / Sign up, and beside the menu
 * button on a phone.
 *
 * Under 768px the links collapse into a drawer holding the same items plus
 * the session controls, which are hidden from the bar at that width.
 */
/** Labels come from the dictionary; the hrefs never move. */
const LINKS = [
  { key: 'ride', href: '/ride' },
  { key: 'drive', href: '/drive' },
  { key: 'safety', href: '/safety' },
  { key: 'about', href: '/about' },
  { key: 'help', href: '/help' },
] as const;

export function NavBar({ quiet }: { quiet?: boolean }) {
  const pathname = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);

  // `/book` owns the page's gold button in every one of its states.
  const quietHere = quiet ?? pathname.startsWith('/book');

  // A route change must close the drawer, or it stays over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // On the homepage the logo waits until the hero's own logo has gone by.
  const onHome = pathname === '/';
  const [heroGone, setHeroGone] = useState(!onHome);
  useEffect(() => {
    if (!onHome) { setHeroGone(true); return; }
    const hero = document.querySelector('.hp-hero__logo');
    if (!hero || typeof IntersectionObserver === 'undefined') { setHeroGone(true); return; }
    setHeroGone(false);
    const io = new IntersectionObserver(([e]) => setHeroGone(!e.isIntersecting), { rootMargin: '-72px 0px 0px 0px' });
    io.observe(hero);
    return () => io.disconnect();
  }, [onHome]);

  // An anchor on the homepage is not a page of its own, so it is never
  // `aria-current`. Without this every nav item lights up on `/`.
  const isCurrent = (href: string) => {
    if (href.includes('#')) return false;
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  };

  return (
    <header className="hp-header">
      <nav className="hp hp-nav" aria-label="Main">
        {/* Named for screen readers: the wordmark beside the emblem is hidden
            on a phone, which left the link with no name (axe link-name). */}
        <Link
          href="/"
          className="hp-nav__logo"
          aria-label="SaaradhiGo home"
          data-hidden={heroGone ? undefined : 'true'}
          tabIndex={heroGone ? undefined : -1}
        >
          <Logo variant="badge" />
          <span className="hp-nav__name">Saaradhi Go</span>
        </Link>

        <div className="hp-nav__links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="hp-nav__link"
              aria-current={isCurrent(l.href) ? 'page' : undefined}
            >
              {t.nav[l.key]}
            </Link>
          ))}
        </div>

        <div className="hp-nav__session">
          <LanguagePicker />
          <ThemeToggle />
          <AuthNav quiet={quietHere} />
        </div>

        {/* On a phone the bar keeps the logo, the language and the menu. */}
        <div className="hp-nav__mobile">
          <LanguagePicker compact />
          <ThemeToggle />
          <button
            type="button"
            className="hp-nav__toggle"
            aria-expanded={open}
            aria-controls="hp-drawer"
            aria-label={open ? t.nav.menuClose : t.nav.menuOpen}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <Close /> : <Menu />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="hp-drawer" className="hp-drawer">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={isCurrent(l.href) ? 'page' : undefined}
            >
              {t.nav[l.key]}
            </Link>
          ))}
          <div className="hp-drawer__session">
            <AuthNav quiet={quietHere} />
          </div>
        </div>
      )}
    </header>
  );
}
