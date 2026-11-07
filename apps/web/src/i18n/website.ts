'use client';

import { createElement, Fragment } from 'react';
import { useLocale } from './LocaleProvider';
import type { Language } from './locales';
import te from './website/te.json';
import hi from './website/hi.json';
import es from './website/es.json';

/**
 * The website's translations (design/i18n, 2026-11-07), keyed by the exact
 * English shown on QA. The JSON files are loaded as delivered, so the
 * reviewed versions can replace them file for file.
 *
 * A string with no entry stays in English: nothing here is translated by us.
 *
 * VEHICLE NAMES. The rider app calls the classes Auto, Mini, Sedan and SUV
 * in every language (SaaradhiGo-mobile lib/core/vehicle_classes.dart), so
 * the two strings where the files spell them in Telugu, Devanagari or with
 * an accent use the app's names instead (owner, 2026-11-07).
 */
type Dict = Record<string, string>;

const OVERRIDES: Record<Exclude<Language, 'en'>, Dict> = {
  te: {
    'Book Auto': 'Auto బుక్ చేయండి',
    'Auto, Mini, Sedan, SUV, each with its own price.': 'Auto, Mini, Sedan, SUV, ఒక్కోదానికి ఒక్కో ధర.',
  },
  hi: {
    'Book Auto': 'Auto बुक करें',
    'Auto, Mini, Sedan, SUV, each with its own price.': 'Auto, Mini, Sedan, SUV, हर एक का अपना दाम।',
  },
  es: {
    'Auto, Mini, Sedan, SUV, each with its own price.': 'Auto, Mini, Sedan, SUV, cada uno con su precio.',
  },
};

export const WEBSITE: Record<Language, Dict> = {
  en: {},
  te: { ...te, ...OVERRIDES.te },
  hi: { ...hi, ...OVERRIDES.hi },
  es: { ...es, ...OVERRIDES.es },
};

/**
 * Titles the brief renamed after the files were written. The files' own
 * translation of the old title already reads "Log in" in each language.
 */
const RENAMED: Dict = { 'Log in — SaaradhiGo': 'Sign in — SaaradhiGo' };

export function translate(language: Language, english: string): string {
  const dict = WEBSITE[language];
  return dict[english] ?? dict[RENAMED[english] ?? ''] ?? english;
}

/** The same shape with every string translated; links and ids pass through. */
export function translateCopy<T>(value: T, language: Language): T {
  if (typeof value === 'string') return translate(language, value) as T;
  if (Array.isArray(value)) return value.map((v) => translateCopy(v, language)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, k === 'href' ? v : translateCopy(v, language)]),
    ) as T;
  }
  return value;
}

export function useTr(): (english: string) => string {
  const { language } = useLocale();
  return (english) => translate(language, english);
}

/** For server components: `<Tr>New here?</Tr>`. */
export function Tr({ children }: { children: string }) {
  return createElement(Fragment, null, useTr()(children));
}

/** og:locale for each language (owner, 2026-11-07). */
export const OG_LOCALE: Record<Language, string> = {
  en: 'en_IN',
  te: 'te_IN',
  hi: 'hi_IN',
  es: 'es_ES',
};
