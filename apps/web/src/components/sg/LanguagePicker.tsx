'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { LANGUAGES, LANGUAGE_INFO } from '@/i18n/locales';

/**
 * Language. That is the whole control.
 *
 * A globe and nothing else in the bar (approved design, 2026-11-07): the
 * languages are listed only once it is opened, never in the header or the
 * footer. It sets the language and never the market (see `i18n/locales.ts`):
 * a rider choosing how to read the site is not telling us where they are.
 */
export function LanguagePicker() {
  const { language, t, setLanguage } = useLocale();
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
    <div className="s-lang" ref={root}>
      <button
        type="button"
        className="s-icon-btn s-icon-btn--globe"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.nav.language}
      >
        <GlobeIcon />
      </button>

      {open && (
        <div className="s-lang__panel" role="group" aria-label={t.nav.language}>
          {LANGUAGES.map((code) => (
            <button
              key={code}
              type="button"
              className="s-lang__item"
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
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" />
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
