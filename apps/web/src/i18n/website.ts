'use client';

import { createElement, Fragment, useCallback } from 'react';
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
  // The same function while the language and market stay the same: a component that lists `tr` in
  // an effect's dependencies must not re-run it on every render (14 Nov: the card hold remounted
  // Stripe's form in a loop, 247 frames, and the card fields never settled).
  return useCallback((english: string) => (us ? usEnglish(translate(language, english)) : translate(language, english)), [language, us]);
}

/** For server components: `<Tr>New here?</Tr>`. */
export function Tr({ children }: { children: string }) {
  return createElement(Fragment, null, useTr()(children));
}
