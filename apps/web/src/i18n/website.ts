'use client';

import { createElement, Fragment } from 'react';
import { useLocale } from './LocaleProvider';
import { translate } from './strings';
import { useLegal } from '@/components/sg/LegalProvider';
import { usEnglish } from './usEnglish';
export { WEBSITE, translate, translateCopy, englishOf, OG_LOCALE } from './strings';

export function useTr(): (english: string) => string {
  const { language } = useLocale();
  // 14 Nov (owner): US riders and drivers read US English; India keeps UK English.
  const { market } = useLegal();
  const us = language === 'en' && market === 'US';
  return us ? (english) => usEnglish(translate(language, english)) : (english) => translate(language, english);
}

/** For server components: `<Tr>New here?</Tr>`. */
export function Tr({ children }: { children: string }) {
  return createElement(Fragment, null, useTr()(children));
}
