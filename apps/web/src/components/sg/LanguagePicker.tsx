'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { LANGUAGES, LANGUAGE_INFO, MARKETS, MARKET_INFO, type Market } from '@/i18n/locales';
import { useTr } from '@/i18n/website';
import { useLegal } from './LegalProvider';

/**
 * Language and country: one globe in the header (owner, 13 Nov).
 *
 * A globe and nothing else in the bar (approved design, 2026-11-07); the panel lists the
 * languages, then the countries. The two stay independent: choosing a language never sets the
 * market (see `i18n/locales.ts`). The country decides the company named in the footer, the
 * currency and the policies, and it replaces the footer's own country dropdown and globe.
 */
export function LanguagePicker() {
  const { language, setLanguage, setMarket } = useLocale();
  const { market, choose } = useLegal();
  const pickCountry = (m: Market) => { choose(m); setMarket(m); };
  const tr = useTr();
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
        aria-label={tr('Language and country')}
        data-testid="locale-globe"
      >
        <GlobeIcon />
      </button>

      {open && (
        <div className="s-lang__panel" role="group" aria-label={tr('Language and country')}>
          <div className="s-lang__head" id="s-lang-language">{tr('Language')}</div>
          <div role="group" aria-labelledby="s-lang-language">
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
          <div className="s-lang__head" id="s-lang-country">{tr('Country')}</div>
          <div role="group" aria-labelledby="s-lang-country">
            {MARKETS.map((m) => (
              <button
                key={m}
                type="button"
                className="s-lang__item"
                aria-pressed={market === m}
                data-testid={`locale-country-${m}`}
                onClick={() => {
                  pickCountry(m);
                  setOpen(false);
                }}
              >
                {MARKET_INFO[m].label}
                {market === m && <CheckIcon />}
              </button>
            ))}
          </div>
          <p className="s-lang__note">{tr('Country sets the company, currency and policies.')}</p>
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
