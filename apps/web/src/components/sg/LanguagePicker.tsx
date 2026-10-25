'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import {
  LANGUAGE_CHOICES,
  LOCALE_INFO,
  languageOf,
  localeForLanguage,
} from '@/i18n/locales';

/**
 * Language. That is the whole control.
 *
 * IT USED TO ASK FOR A COUNTRY FIRST. A row of country chips sat above the
 * language list, with a paragraph explaining that changing country changes
 * formatting but not where cars are available -- a configuration panel in a
 * header, in a product whose other buttons say "See ride options". It was
 * rejected twice. This is the menu a consumer app has: four languages, each
 * written in itself, with a tick on the current one.
 *
 * THE COUNTRY IS DERIVED, NOT ASKED. `en-IN` and `en-US` are both "English",
 * so they appear once; picking a language keeps the market already in use
 * where that language is offered there, and otherwise moves to the market
 * that does offer it. Nobody has to know what a market is.
 *
 * LOCATION-AWARE BY DEFAULT. The visitor never has to open this at all: the
 * deployment's market decides the country, and the browser's languages pick
 * which of that market's languages to open in. This menu exists to override
 * that, and the override is remembered.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, market, t, setLocale, ready } = useLocale();
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

  const current = languageOf(locale);

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
          {ready ? LOCALE_INFO[locale].label : ' '}
        </span>
      </button>

      {open && (
        <div className="hp-lang__panel" role="group" aria-label={t.nav.language}>
          <div className="hp-lang__list">
            {LANGUAGE_CHOICES.map((choice) => {
              const target = localeForLanguage(choice.base, market);
              const selected = current === choice.base;
              return (
                <button
                  key={choice.base}
                  type="button"
                  className="hp-lang__item"
                  aria-pressed={selected}
                  lang={choice.base}
                  onClick={() => {
                    setLocale(target);
                    setOpen(false);
                  }}
                >
                  {choice.label}
                  {selected && <CheckIcon />}
                </button>
              );
            })}
          </div>
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
