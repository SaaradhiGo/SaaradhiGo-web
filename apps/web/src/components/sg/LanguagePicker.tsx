'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import {
  LOCALE_INFO,
  MARKETS,
  MARKET_INFO,
  localesForMarket,
  type Locale,
  type Market,
} from '@/i18n/locales';

/**
 * Country and language, in one control.
 *
 * COUNTRY FIRST, THEN THE LANGUAGES THAT COUNTRY IS OFFERED IN. Telugu is
 * not listed under the United States and Spanish is not listed under India,
 * because neither is offered there -- showing all five under both would be a
 * menu of four dead options and one live one.
 *
 * IT CHANGES THE SITE, NOT THE SERVICE. The note in the panel says so: a
 * market switch changes language and formatting, and ride availability stays
 * with the dispatcher's service zones. Someone selecting "United States"
 * must not come away believing they can book a car there.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, market, t, setLocale, setMarket, ready } = useLocale();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);

  // Close on an outside click or Escape, which is what a menu is expected to
  // do and what a keyboard user needs to get back out.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const languages = localesForMarket(market);

  return (
    <div className="hp-lang" ref={root}>
      <button
        type="button"
        className="hp-lang__button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        // The label names the control; the value is announced as its content.
        aria-label={`${t.nav.language}: ${LOCALE_INFO[locale].label}`}
      >
        <GlobeIcon />
        {/* Suppressed until the stored preference is read, so the button does
            not flash the default language at someone who chose another. */}
        <span className={compact ? 'sr-only' : undefined}>
          {ready ? LOCALE_INFO[locale].label : ' '}
        </span>
      </button>

      {open && (
        <div className="hp-lang__panel" role="group" aria-label={`${t.nav.country} / ${t.nav.language}`}>
          <div className="hp-lang__section">{t.nav.country}</div>
          <div className="hp-lang__row">
            {MARKETS.map((m: Market) => (
              <button
                key={m}
                type="button"
                className="hp-lang__chip"
                aria-pressed={market === m}
                onClick={() => setMarket(m)}
              >
                {MARKET_INFO[m].label}
              </button>
            ))}
          </div>

          <div className="hp-lang__section">{t.nav.language}</div>
          <div className="hp-lang__list">
            {languages.map((l: Locale) => (
              <button
                key={l}
                type="button"
                className="hp-lang__item"
                aria-pressed={locale === l}
                lang={LOCALE_INFO[l].tag}
                onClick={() => {
                  setLocale(l);
                  setOpen(false);
                }}
              >
                {LOCALE_INFO[l].label}
                {locale === l && <CheckIcon />}
              </button>
            ))}
          </div>

          <p className="hp-lang__note">{t.market.note}</p>
        </div>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}
