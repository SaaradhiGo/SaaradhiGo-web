'use client';

import { useLocale } from './LocaleProvider';
import { PAGES, type PagesCopy } from './pages';
import { useLegal } from '@/components/sg/LegalProvider';
import { usEnglishDeep } from './usEnglish';

/**
 * The body copy for an interior public page, in the visitor's language.
 *
 * Separate from `useT()` so a page component pulls in only the prose it
 * renders. Both read the same locale, so the header, the page and the footer
 * can never disagree about which language the visitor chose.
 */
export function usePages(): PagesCopy {
  const { language } = useLocale();
  const { market } = useLegal();
  const us = language === 'en' && market === 'US';
  // 14 Nov (owner): US English for the USA, UK English for India.
  return us ? usEnglishDeep(PAGES[language]) : PAGES[language];
}
