import { NavBar } from '@/components/sg/NavBar';
import { Footer } from '@/components/sg/Footer';
import { LocaleHead } from '@/components/sg/LocaleHead';
import { TranslationNotice } from '@/components/sg/TranslationNotice';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { requestLanguage, requestLegalMarket } from '@/i18n/server';
import { LegalProvider } from './LegalProvider';
import { fetchLegal } from '@/lib/legal';
import { Tr } from '@/i18n/website';

/**
 * The public page frame: skip link, header, the translation notice, the
 * page, the footer. The `(public)` layout and the 404 page both use it, so a
 * missing page keeps the header and its logo (owner, 2026-11-07). It renders
 * in the language of the visitor's `sg-language` cookie.
 */
export async function PublicShell({ children }: { children: React.ReactNode }) {
  const [legal, where] = await Promise.all([fetchLegal(), requestLegalMarket()]);
  return (
    <LocaleProvider initialLanguage={await requestLanguage()}>
      <LegalProvider legal={legal} initialMarket={where.market} decided={where.decided}>
      <LocaleHead />
      <div className="site min-h-screen flex flex-col">
        {/* First stop for a keyboard user, so they are not forced through the
            whole nav on every page. */}
        <a href="#main" className="skip-link">
          <Tr>Skip to main content</Tr>
        </a>

        <NavBar />
        <TranslationNotice />

        {/* Grows to fill the window, so the footer sits at the bottom of a short page (13 Nov). */}
        <main id="main" className="w-full flex-1">
          {children}
        </main>

        <Footer />
      </div>
      </LegalProvider>
    </LocaleProvider>
  );
}
