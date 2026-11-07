'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import type { Language } from '@/i18n/locales';
import { SITE_FLAGS } from '@/lib/siteFlags';
import { useTr } from '@/i18n/website';
import { Close } from './icons';

/**
 * "Translation under review." under the header on Telugu, Hindi and Spanish
 * pages, until the owner confirms the native-speaker review (2026-11-07).
 * The wording of each is the owner's. Dismissing it is remembered.
 */
const NOTICE: Partial<Record<Language, string>> = {
  te: 'అనువాదం సమీక్షలో ఉంది.',
  hi: 'अनुवाद की समीक्षा चल रही है।',
  es: 'Traducción en revisión.',
};
const KEY = 'sg-review-notice';

export function TranslationNotice() {
  const { language } = useLocale();
  const tr = useTr();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try { setDismissed(localStorage.getItem(KEY) === 'dismissed'); } catch { setDismissed(false); }
  }, []);

  const text = NOTICE[language];
  if (!SITE_FLAGS.translationReviewNotice || !text || dismissed) return null;
  return (
    <div className="s-notice s-cb" role="note">
      <div className="s-wrap s-notice__in">
        <span>{text}</span>
        <button
          type="button"
          className="s-notice__close"
          aria-label={tr('Dismiss')}
          onClick={() => {
            setDismissed(true);
            try { localStorage.setItem(KEY, 'dismissed'); } catch { /* private mode */ }
          }}
        >
          <Close />
        </button>
      </div>
    </div>
  );
}
