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
  DEFAULT_LANGUAGE,
  DEFAULT_MARKET,
  LANGUAGE_INFO,
  type Language,
  type Locale,
  type Market,
  languageFromStored,
  localeFor,
  marketFromStored,
  resolveLanguage,
  resolveMarket,
} from './locales';
import { MESSAGES, type Messages } from './messages';

const LANGUAGE_KEY = 'sg-language';
/** Same name as the storage key; the server reads it (src/i18n/server.ts). */
const LANGUAGE_COOKIE = 'sg-language';
const MARKET_KEY = 'sg-market';
/** What builds before the language/market split wrote, e.g. "te-IN". */
const LEGACY_LOCALE_KEY = 'sg-locale';

/**
 * The market this build serves.
 *
 * It is a build-time value rather than something guessed in the browser: a
 * deployment knows which market it is for, and a browser does not. A US
 * deployment sets this to `US`.
 */
const DEPLOYMENT_MARKET: Market =
  (process.env.NEXT_PUBLIC_MARKET as Market) || DEFAULT_MARKET;

type Ctx = {
  /** What the copy is written in. */
  language: Language;
  /** Where we are serving: currency, phone and date formatting. */
  market: Market;
  /** The two joined, for `<html lang>` and `Intl`. */
  locale: Locale;
  t: Messages;
  /** Changes the language ONLY. The market is untouched and stays stored. */
  setLanguage: (l: Language) => void;
  /** Changes the market ONLY. The language is untouched. */
  setMarket: (m: Market) => void;
  /** False until the stored preferences have been read, to avoid a flash. */
  ready: boolean;
};

const LocaleContext = createContext<Ctx | null>(null);

/**
 * Holds the visitor's language and market, separately, and keeps both.
 *
 * TWO KEYS, NOT ONE. They used to be a single stored locale, which meant
 * every language carried a country on its back: picking Spanish moved an
 * Indian visitor to the US market and its currency formatting. They are now
 * independent, each with its own storage key and its own setter, so a
 * Spanish speaker in India reads Spanish copy with Indian formatting.
 *
 * THE SERVER RENDERS THE LANGUAGE. A choice is kept in localStorage and in
 * a year-long `sg-language` cookie; the server reads the cookie and passes
 * it in as `initialLanguage`, so the first HTML is already in the visitor's
 * language and nothing switches after load. Without the cookie the page is
 * English (owner, 2026-11-07): the browser's languages no longer pick one,
 * because the server cannot see them and the page would flash. A choice
 * stored before the cookie existed is honoured once and copied into it.
 *
 * A MANUAL CHOICE IS NEVER SILENTLY RESET. Once someone picks a language it
 * is stored and wins over every other signal, including the browser's, on
 * every later visit.
 */
function writeLanguageCookie(language: Language) {
  document.cookie = `${LANGUAGE_COOKIE}=${language}; path=/; max-age=31536000; samesite=lax`;
}

export function LocaleProvider({
  children,
  initialLanguage = DEFAULT_LANGUAGE,
}: {
  children: React.ReactNode;
  /** What the server rendered in, from the `sg-language` cookie. */
  initialLanguage?: Language;
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);
  const [market, setMarketState] = useState<Market>(DEPLOYMENT_MARKET);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let savedLanguage: string | null = null;
    let savedMarket: string | null = null;
    let legacy: string | null = null;
    try {
      savedLanguage = localStorage.getItem(LANGUAGE_KEY);
      savedMarket = localStorage.getItem(MARKET_KEY);
      legacy = localStorage.getItem(LEGACY_LOCALE_KEY);
    } catch {
      // Private browsing refuses storage. The defaults below still apply.
    }

    // With the cookie, the server already rendered the right language. A
    // visitor who chose Telugu before the cookie (or before the storage
    // format changed) keeps Telugu, and gets the cookie for next time.
    const hasCookie = document.cookie.split('; ').some((c) => c.startsWith(`${LANGUAGE_COOKIE}=`));
    const language = hasCookie
      ? initialLanguage
      : resolveLanguage({ savedLanguage: savedLanguage ?? languageFromStored(legacy) });
    if (!hasCookie && language !== DEFAULT_LANGUAGE) writeLanguageCookie(language);
    const market = resolveMarket({
      savedMarket: savedMarket ?? marketFromStored(legacy),
      deploymentMarket: DEPLOYMENT_MARKET,
    });

    setLanguageState(language);
    setMarketState(market);
    setReady(true);
  }, [initialLanguage]);

  // `<html lang>` has to follow the choice, for screen readers and for
  // anything that hyphenates or speaks the page.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = localeFor(language, market);
    document.documentElement.dir = LANGUAGE_INFO[language].dir;
  }, [language, market]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      localStorage.setItem(LANGUAGE_KEY, next);
    } catch {
      /* preference is not remembered; the session still works */
    }
    writeLanguageCookie(next);
  }, []);

  const setMarket = useCallback((next: Market) => {
    setMarketState(next);
    try {
      localStorage.setItem(MARKET_KEY, next);
    } catch {
      /* preference is not remembered; the session still works */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      language,
      market,
      locale: localeFor(language, market),
      t: MESSAGES[language],
      setLanguage,
      setMarket,
      ready,
    }),
    [language, market, setLanguage, setMarket, ready],
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
