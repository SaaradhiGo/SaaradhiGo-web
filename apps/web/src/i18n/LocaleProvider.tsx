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
 * THE SERVER RENDERS THE DEFAULT, THE CLIENT CORRECTS IT. Preferences live
 * in `localStorage`, which no server render can see, so the first paint is
 * the deployment default and an effect switches it. `ready` lets a control
 * that would otherwise flash the wrong value wait one tick; the page copy
 * does not bother, because showing English for one frame is better than
 * showing nothing.
 *
 * A MANUAL CHOICE IS NEVER SILENTLY RESET. Once someone picks a language it
 * is stored and wins over every other signal, including the browser's, on
 * every later visit.
 */
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
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

    // A visitor who chose Telugu before the storage format changed keeps
    // Telugu. Migrating beats resetting them to English for our convenience.
    const language = resolveLanguage({
      savedLanguage: savedLanguage ?? languageFromStored(legacy),
      browserLanguages: typeof navigator === 'undefined' ? [] : navigator.languages ?? [],
    });
    const market = resolveMarket({
      savedMarket: savedMarket ?? marketFromStored(legacy),
      deploymentMarket: DEPLOYMENT_MARKET,
    });

    setLanguageState(language);
    setMarketState(market);
    setReady(true);
  }, []);

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
