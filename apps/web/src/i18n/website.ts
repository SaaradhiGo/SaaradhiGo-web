'use client';

import { createElement, Fragment } from 'react';
import { useLocale } from './LocaleProvider';
import { translate } from './strings';
export { WEBSITE, translate, translateCopy, englishOf, OG_LOCALE } from './strings';

export function useTr(): (english: string) => string {
  const { language } = useLocale();
  return (english) => translate(language, english);
}

/** For server components: `<Tr>New here?</Tr>`. */
export function Tr({ children }: { children: string }) {
  return createElement(Fragment, null, useTr()(children));
}
