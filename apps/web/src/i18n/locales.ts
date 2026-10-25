/**
 * The markets SaaradhiGo's public site speaks to, and the languages each one
 * is offered in.
 *
 * A MARKET IS NOT A PROMISE OF SERVICE. Choosing "United States" here changes
 * the language, the currency format and the phone format. It does not make a
 * ride available: where rides can be booked is decided by the dispatcher's
 * service zones, which this file cannot reach and must not appear to
 * override. The copy says so wherever a market is selectable.
 */

export const MARKETS = ['IN', 'US'] as const;
export type Market = (typeof MARKETS)[number];

export const LOCALES = ['en-IN', 'te-IN', 'hi-IN', 'en-US', 'es-US'] as const;
export type Locale = (typeof LOCALES)[number];

export type LocaleInfo = {
  /** The language's own name, written in that language. */
  label: string;
  market: Market;
  /** BCP 47 tag for `<html lang>`, `hreflang` and `Intl`. */
  tag: Locale;
  dir: 'ltr';
};

export const LOCALE_INFO: Record<Locale, LocaleInfo> = {
  'en-IN': { label: 'English', market: 'IN', tag: 'en-IN', dir: 'ltr' },
  'te-IN': { label: 'తెలుగు', market: 'IN', tag: 'te-IN', dir: 'ltr' },
  'hi-IN': { label: 'हिन्दी', market: 'IN', tag: 'hi-IN', dir: 'ltr' },
  'en-US': { label: 'English', market: 'US', tag: 'en-US', dir: 'ltr' },
  'es-US': { label: 'Español', market: 'US', tag: 'es-US', dir: 'ltr' },
};

export const MARKET_INFO: Record<Market, { label: string; currency: string; defaultLocale: Locale }> = {
  IN: { label: 'India', currency: 'INR', defaultLocale: 'en-IN' },
  US: { label: 'United States', currency: 'USD', defaultLocale: 'en-US' },
};

export const DEFAULT_LOCALE: Locale = 'en-IN';

export function localesForMarket(market: Market): Locale[] {
  return LOCALES.filter((l) => LOCALE_INFO[l].market === market);
}

/**
 * The languages a visitor actually picks from, which is NOT the list of
 * locales.
 *
 * `en-IN` and `en-US` are both "English". Offering both in a menu asks
 * someone to choose a country in order to choose a language, which is the
 * country/language configuration panel this control had and the owner
 * rejected. So the menu lists each LANGUAGE once, and the country is derived:
 * the current market's locale for that language where one exists, otherwise
 * the language's own market. Picking Espanol moves the site to the US market
 * because that is the only market offering it -- the visitor chose a
 * language, not a country, and never had to think about the difference.
 */
export type LanguageChoice = { base: string; label: string };

export const LANGUAGE_CHOICES: LanguageChoice[] = (() => {
  const seen = new Set<string>();
  const out: LanguageChoice[] = [];
  for (const l of LOCALES) {
    const base = l.split('-')[0];
    if (seen.has(base)) continue;
    seen.add(base);
    out.push({ base, label: LOCALE_INFO[l].label });
  }
  return out;
})();

/** The locale to use for a language, preferring the market already in use. */
export function localeForLanguage(base: string, market: Market): Locale {
  const inMarket = localesForMarket(market).find((l) => l.split('-')[0] === base);
  if (inMarket) return inMarket;
  const anywhere = LOCALES.find((l) => l.split('-')[0] === base);
  return anywhere ?? DEFAULT_LOCALE;
}

/** The language a locale is in, for marking the current menu entry. */
export function languageOf(locale: Locale): string {
  return locale.split('-')[0];
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function isMarket(value: unknown): value is Market {
  return typeof value === 'string' && (MARKETS as readonly string[]).includes(value);
}

/**
 * Which locale to start in.
 *
 * The precedence is deliberate and, in particular, DOES NOT GUESS A COUNTRY
 * FROM A LANGUAGE. A browser set to `es` tells you someone reads Spanish; it
 * does not tell you they are in the United States, and a Spanish-speaking
 * visitor in India should not be moved to the US market. So a bare language
 * match only ever selects a language *within* a market that has already been
 * decided some other way, and the fallback is English with the market left
 * at the deployment's own.
 *
 *   1. a locale the visitor chose before, as-is
 *   2. a market they chose before, in that market's default language
 *   3. the deployment's market, matched against the browser's languages
 *   4. English in the deployment's market
 */
export function resolveLocale(input: {
  savedLocale?: string | null;
  savedMarket?: string | null;
  deploymentMarket?: Market;
  browserLanguages?: readonly string[];
}): Locale {
  const { savedLocale, savedMarket, deploymentMarket = 'IN', browserLanguages = [] } = input;

  // 1. An explicit past choice always wins and is never silently reset.
  if (isLocale(savedLocale)) return savedLocale;

  // 2. A chosen market, in its own default language.
  if (isMarket(savedMarket)) return MARKET_INFO[savedMarket].defaultLocale;

  // 3. The browser's languages, used ONLY to pick a language within the
  //    deployment's market -- never to pick the market itself.
  //
  //    Both lookups are scoped to `available` for the same reason. Matching
  //    the full tag against every locale looks harmless and is not: a laptop
  //    shipped with `en-US`, which is most laptops, would match `en-US`
  //    exactly and silently move an Indian visitor into the US market, where
  //    Telugu and Hindi are not even offered. That is inferring a country
  //    from a language, which is the one thing this function must not do.
  const available = localesForMarket(deploymentMarket);
  for (const raw of browserLanguages) {
    const tag = raw.toLowerCase();
    const exact = available.find((l) => l.toLowerCase() === tag);
    if (exact) return exact;
    const base = tag.split('-')[0];
    const inMarket = available.find((l) => l.split('-')[0] === base);
    if (inMarket) return inMarket;
  }

  // 4. English in the deployment's market.
  return MARKET_INFO[deploymentMarket].defaultLocale;
}
