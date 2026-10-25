'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_LOCALE,
  LOCALE_INFO,
  type Locale,
  type Market,
  isLocale,
  isMarket,
  resolveLocale,
} from './locales';
import { MESSAGES, type Messages } from './messages';

const LOCALE_KEY = 'sg-locale';
const MARKET_KEY = 'sg-market';

type Ctx = {
  locale: Locale;
  market: Market;
  t: Messages;
  setLocale: (l: Locale) => void;
  /** False until the stored preference has been read, to avoid a flash. */
  ready: boolean;
};

const LocaleContext = createContext<Ctx | null>(null);

/**
 * Holds the visitor's market and language, and keeps them.
 *
 * THE SERVER RENDERS THE DEFAULT, THE CLIENT CORRECTS IT. The preference
 * lives in `localStorage`, which no server render can see, so the first
 * paint is the deployment default and an effect switches it. `ready` lets a
 * control that would otherwise flash the wrong flag wait one tick; the page
 * copy does not bother, because showing English for one frame is better than
 * showing nothing.
 *
 * A MANUAL CHOICE IS NEVER SILENTLY RESET. Once someone picks a language it
 * is stored and wins over every other signal, including the browser's, on
 * every later visit. Picking a market moves the language only if the current
 * one is not offered in that market -- choosing "United States" while
 * reading Spanish keeps Spanish, because es-US exists.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let savedLocale: string | null = null;
    let savedMarket: string | null = null;
    try {
      savedLocale = localStorage.getItem(LOCALE_KEY);
      savedMarket = localStorage.getItem(MARKET_KEY);
    } catch {
      // Private browsing refuses storage. The default below still applies.
    }
    setLocaleState(
      resolveLocale({
        savedLocale,
        savedMarket,
        deploymentMarket: 'IN',
        browserLanguages: typeof navigator === 'undefined' ? [] : navigator.languages ?? [],
      }),
    );
    setReady(true);
  }, []);

  // `<html lang>` has to follow the choice, for screen readers and for
  // anything that hyphenates or speaks the page.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = LOCALE_INFO[locale].tag;
    document.documentElement.dir = LOCALE_INFO[locale].dir;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_KEY, next);
      localStorage.setItem(MARKET_KEY, LOCALE_INFO[next].market);
    } catch {
      /* preference is not remembered; the session still works */
    }
  }, []);

  // There is no `setMarket`. The header's menu offers LANGUAGES, and the
  // market follows from the one chosen -- see `localeForLanguage`. A
  // separate country control was the configuration panel this product does
  // not want, so the only way the market moves is through a language.

  const value = useMemo<Ctx>(
    () => ({
      locale,
      market: LOCALE_INFO[locale].market,
      t: MESSAGES[locale],
      setLocale,
      ready,
    }),
    [locale, setLocale, ready],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Ctx {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used inside <LocaleProvider>');
  }
  return ctx;
}

/** Just the strings, for the common case. */
export function useT(): Messages {
  return useLocale().t;
}

export { isLocale, isMarket };
