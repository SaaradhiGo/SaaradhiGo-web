/**
 * Two independent things: WHERE the visitor is, and WHAT THEY READ.
 *
 * MARKET IS NOT A LANGUAGE, AND A LANGUAGE IS NOT A MARKET. This file used
 * to model a single `Locale` ("en-IN", "es-US", ...) and derive the market
 * from it, so choosing Spanish moved the visitor to the United States and
 * choosing a country moved them to that country's language. Both are wrong.
 * English speakers live in India; Spanish speakers live in the United States
 * and elsewhere. Someone reading the site in Spanish from Hyderabad is a
 * person, not a contradiction, and the site should not relocate them for it.
 *
 * So:
 *   - `Market` is where this deployment serves. Only the deployment, or an
 *     explicit stored choice, sets it. Nothing infers it from a language.
 *   - `Language` is what the copy is written in, chosen by the visitor or
 *     taken from their browser, and it never moves the market.
 *   - `Locale` is the two joined, for `<html lang>` and `Intl` formatting.
 *
 * A MARKET IS NOT A PROMISE OF SERVICE. It changes language, currency format
 * and phone format. It does not make a ride available: where rides can be
 * booked is decided by the dispatcher's service zones, which this file
 * cannot reach and must not appear to override.
 */

export const MARKETS = ['IN', 'US'] as const;
export type Market = (typeof MARKETS)[number];

export const LANGUAGES = ['en', 'te', 'hi', 'es'] as const;
export type Language = (typeof LANGUAGES)[number];

/** A BCP 47 tag: the language the copy is in, in the market being served. */
export type Locale = `${Language}-${Market}`;

export type LanguageInfo = {
  /** The language's own name, written in that language. */
  label: string;
  dir: 'ltr';
};

export const LANGUAGE_INFO: Record<Language, LanguageInfo> = {
  en: { label: 'English', dir: 'ltr' },
  te: { label: 'తెలుగు', dir: 'ltr' },
  hi: { label: 'हिन्दी', dir: 'ltr' },
  es: { label: 'Español', dir: 'ltr' },
};

export const MARKET_INFO: Record<Market, { label: string; currency: string }> = {
  IN: { label: 'India', currency: 'INR' },
  US: { label: 'United States', currency: 'USD' },
};

export const DEFAULT_LANGUAGE: Language = 'en';
export const DEFAULT_MARKET: Market = 'IN';

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

export function isMarket(value: unknown): value is Market {
  return typeof value === 'string' && (MARKETS as readonly string[]).includes(value);
}

export function localeFor(language: Language, market: Market): Locale {
  return `${language}-${market}`;
}

/**
 * Where we are serving.
 *
 * NOTHING HERE LOOKS AT A LANGUAGE. The browser can say what someone reads;
 * it cannot say where they are, and `navigator.language` reporting `en-US`
 * is a keyboard layout far more often than it is a location. A real location
 * signal would be a geo-IP lookup at the edge, which this deployment does
 * not have -- so the deployment's own market stands until the visitor says
 * otherwise, and that choice is remembered.
 */
export function resolveMarket(input: {
  savedMarket?: string | null;
  deploymentMarket?: Market;
}): Market {
  const { savedMarket, deploymentMarket = DEFAULT_MARKET } = input;
  if (isMarket(savedMarket)) return savedMarket;
  return deploymentMarket;
}

/**
 * What to render the copy in.
 *
 * An explicit past choice always wins and is never silently reset. Otherwise
 * the browser's preference order decides, and English is the fallback --
 * because it is the language every dictionary here is complete in, not
 * because of where anyone is.
 */
export function resolveLanguage(input: {
  savedLanguage?: string | null;
  browserLanguages?: readonly string[];
}): Language {
  const { savedLanguage, browserLanguages = [] } = input;
  if (isLanguage(savedLanguage)) return savedLanguage;

  for (const raw of browserLanguages) {
    const base = raw.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * Reads what older builds stored.
 *
 * They kept a single `sg-locale` of the form "te-IN". A visitor who chose
 * Telugu last week must not be reset to English because the storage format
 * changed, so the old value is split rather than discarded.
 */
export function languageFromStored(value: string | null | undefined): Language | null {
  if (!value) return null;
  const base = value.toLowerCase().split('-')[0];
  return isLanguage(base) ? base : null;
}

export function marketFromStored(value: string | null | undefined): Market | null {
  if (!value) return null;
  const parts = value.split('-');
  const tail = (parts[1] ?? parts[0]).toUpperCase();
  return isMarket(tail) ? tail : null;
}
