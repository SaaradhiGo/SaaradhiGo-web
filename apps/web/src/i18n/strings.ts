/**
 * The website's string lookup, with no React in it, so server code (page
 * metadata, the root layout) and client components share one table.
 */
import type { Language } from './locales';
import te from './website/te.json';
import hi from './website/hi.json';
import es from './website/es.json';
// Draft strings for the signed-in areas (2026-11-08), each file marked
// "needs native review". The delivered website files win on any overlap.
import areaTe from './area/te.json';
import areaHi from './area/hi.json';
import areaEs from './area/es.json';

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
    // The file's longer wording overflows Help's search box at 390px.
    'Search: cancel, payment, lost item…': 'Buscar: cancelar, pago…',
  },
};

/** A draft file without its review marker. */
function drafts(file: Dict): Dict {
  const { _review: _, ...strings } = file;
  return strings;
}

/** The English of every draft string (the same keys in each draft file). */
export const AREA_KEYS = Object.keys(drafts(areaTe));

export const WEBSITE: Record<Language, Dict> = {
  en: {},
  te: { ...drafts(areaTe), ...te, ...OVERRIDES.te },
  hi: { ...drafts(areaHi), ...hi, ...OVERRIDES.hi },
  es: { ...drafts(areaEs), ...es, ...OVERRIDES.es },
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

/** og:locale for each language (owner, 2026-11-07). */
export const OG_LOCALE: Record<Language, string> = {
  en: 'en_IN',
  te: 'te_IN',
  hi: 'hi_IN',
  es: 'es_ES',
};

// Every translation back to its English, so a title already rendered in one
// language can be re-translated into another without a round trip.
let ENGLISH: Dict | null = null;

export function englishOf(text: string): string {
  if (!ENGLISH) {
    const back: Dict = Object.fromEntries(Object.entries(RENAMED).map(([now, was]) => [was, now]));
    ENGLISH = {};
    for (const dict of Object.values(WEBSITE)) {
      for (const [english, translated] of Object.entries(dict)) ENGLISH[translated] ??= back[english] ?? english;
    }
  }
  return ENGLISH[text] ?? text;
}
