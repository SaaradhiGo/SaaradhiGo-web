import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { DEFAULT_LANGUAGE, type Language, isLanguage } from './locales';
import { OG_LOCALE, translate } from './strings';

/** The cookie LocaleProvider writes when the visitor picks a language. */
export const LANGUAGE_COOKIE = 'sg-language';

/**
 * The market a request's legal lines speak for, as far as the server can tell (13 Nov): the
 * visitor's footer choice, the signed-in account's market, then the edge's country header.
 * `decided` is false when none was present: the browser's time zone then decides.
 */
export async function requestLegalMarket(): Promise<{ market: 'IN' | 'US'; decided: boolean }> {
  const { headers } = await import('next/headers');
  const { EDGE_COUNTRY_HEADERS, resolveLegalMarket } = await import('@/lib/legal');
  const jar = await cookies();
  const h = await headers();
  const chosen = jar.get('sg-market')?.value ?? null;
  const account = jar.get('sg-account-market')?.value ?? null;
  const edge = EDGE_COUNTRY_HEADERS.map((n) => h.get(n)).find((v) => v === 'IN' || v === 'US') ?? null;
  const decided = [chosen, account, edge].some((v) => v === 'IN' || v === 'US');
  return { market: resolveLegalMarket({ chosen, account, edgeCountry: edge }), decided };
}

/**
 * The language this request renders in: the visitor's `sg-language` cookie,
 * or English without one (owner, 2026-11-07). The server renders the page,
 * `<html lang>`, the title and the meta tags in it, so nothing switches after
 * load.
 */
export async function requestLanguage(): Promise<Language> {
  const value = (await cookies()).get(LANGUAGE_COOKIE)?.value;
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

/** A page's English metadata, rendered in the request's language. */
export function localized(metadata: Metadata): () => Promise<Metadata> {
  return async () => {
    const language = await requestLanguage();
    const tr = (v: unknown) => (typeof v === 'string' ? translate(language, v) : v);
    return {
      ...metadata,
      title: tr(metadata.title) as Metadata['title'],
      description: tr(metadata.description) as Metadata['description'],
    };
  };
}

/** og:locale for the request, with the other three as alternates. */
export function ogLocales(language: Language) {
  const others = Object.entries(OG_LOCALE).filter(([l]) => l !== language).map(([, v]) => v);
  return { locale: OG_LOCALE[language], alternateLocale: others };
}
