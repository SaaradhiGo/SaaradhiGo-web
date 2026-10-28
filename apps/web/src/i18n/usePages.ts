'use client';

import { useLocale } from './LocaleProvider';
import { PAGES, type PagesCopy } from './pages';

/**
 * The body copy for an interior public page, in the visitor's language.
 *
 * Separate from `useT()` so a page component pulls in only the prose it
 * renders. Both read the same locale, so the header, the page and the footer
 * can never disagree about which language the visitor chose.
 */
export function usePages(): PagesCopy {
  return PAGES[useLocale().language];
}
