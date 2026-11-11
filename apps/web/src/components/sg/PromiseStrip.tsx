'use client';

import { useLocale } from '@/i18n/LocaleProvider';
import { HOME_COPY } from '@/i18n/home';

/**
 * The three brand promises, under the hero. Each is true of the product:
 * the fare is locked at quote time, drivers are KYC-verified and rated, and
 * every ride has a PIN, live tracking and a safety button. No "surge".
 */
export function PromiseStrip() {
  const { language } = useLocale();
  const h = HOME_COPY[language];
  return (
    <section className="hp hp-promise" aria-labelledby="promises">
      <h2 id="promises" className="sr-only">
        {h.promiseLabel}
      </h2>
      <div className="sg-promise">
        {h.promises.map((p) => (
          <div key={p.eyebrow}>
            <h3>{p.eyebrow}</h3>
            <p>{p.promise}</p>
            <span>{p.detail}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
