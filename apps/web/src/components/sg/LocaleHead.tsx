'use client';

import { useEffect } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { OG_LOCALE, translate } from '@/i18n/website';
import type { Language } from '@/i18n/locales';

/**
 * The page title, description and og:locale in the visitor's language.
 *
 * The language is a stored preference, not a URL, so the server always
 * renders the English title (and og:locale en_IN, with the other three as
 * alternates). This translates them in the browser, and again whenever
 * Next swaps the title on a route change.
 */
const FIELDS = [
  {
    read: () => document.title,
    write: (v: string) => { document.title = v; },
  },
  {
    read: () => document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    write: (v: string) => document.querySelector('meta[name="description"]')?.setAttribute('content', v),
  },
];
// The English each field last carried, and what we last wrote over it, so a
// language switch translates from the English and not from the last language.
const english = ['', ''];
const written = ['', ''];

function sync(language: Language) {
  FIELDS.forEach((f, i) => {
    const now = f.read();
    if (now !== written[i]) english[i] = now;
    written[i] = translate(language, english[i]);
    if (now !== written[i]) f.write(written[i]);
  });
  // Write only on a real change: the observer below sees every write, even
  // of the same value, so an unconditional write loops forever.
  const og = document.querySelector('meta[property="og:locale"]');
  if (og && og.getAttribute('content') !== OG_LOCALE[language]) og.setAttribute('content', OG_LOCALE[language]);
}

export function LocaleHead() {
  const { language } = useLocale();
  useEffect(() => {
    sync(language);
    const watch = new MutationObserver(() => sync(language));
    watch.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true });
    return () => watch.disconnect();
  }, [language]);
  return null;
}
