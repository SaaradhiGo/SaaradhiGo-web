'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { LANGUAGES, LANGUAGE_INFO } from '@/i18n/locales';

/**
 * Language. That is the whole control.
 *
 * IT USED TO ASK FOR A COUNTRY FIRST. A row of country chips sat above the
 * language list with a paragraph explaining that changing country changes
 * formatting but not where cars are available -- a configuration panel in a
 * header, in a product whose other buttons say "See ride options".
 *
 * AND THEN IT MOVED THE COUNTRY ANYWAY. The version after that listed
 * languages and derived the market from the one picked, so choosing Spanish
 * relocated an Indian visitor to the United States. Language and market are
 * separate values now (see `i18n/locales.ts`); this control sets the
 * language and does not touch the market at all.
 *
 * The market is the deployment's, remembered if the visitor ever overrides
 * it. It is not in this menu because a rider choosing how to read the site
 * is not telling us where they are.
 */
export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { language, t, setLanguage, ready } = useLocale();
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

  return (
    <div className="hp-lang" ref={root}>
      <button
        type="button"
        className="hp-lang__button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        // The label names the control; the value is announced as its content.
        aria-label={`${t.nav.language}: ${LANGUAGE_INFO[language].label}`}
      >
        <GlobeIcon />
        {/* Suppressed until the stored preference is read, so the button does
            not flash the default language at someone who chose another. */}
        <span className={compact ? 'sr-only' : undefined}>
          {ready ? LANGUAGE_INFO[language].label : ' '}
        </span>
      </button>

      {open && (
        <div className="hp-lang__panel" role="group" aria-label={t.nav.language}>
          <div className="hp-lang__list">
            {LANGUAGES.map((code) => (
              <button
                key={code}
                type="button"
                className="hp-lang__item"
                aria-pressed={language === code}
                lang={code}
                onClick={() => {
                  setLanguage(code);
                  setOpen(false);
                }}
              >
                {LANGUAGE_INFO[code].label}
                {language === code && <CheckIcon />}
              </button>
            ))}
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
