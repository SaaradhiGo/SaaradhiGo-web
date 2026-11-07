import { NavBar } from '@/components/sg/NavBar';
import { Footer } from '@/components/sg/Footer';
import { LocaleHead } from '@/components/sg/LocaleHead';
import { TranslationNotice } from '@/components/sg/TranslationNotice';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { Tr } from '@/i18n/website';

/**
 * The public page frame: skip link, header, the translation notice, the
 * page, the footer. The `(public)` layout and the 404 page both use it, so a
 * missing page keeps the header and its logo (owner, 2026-11-07).
 */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <LocaleHead />
      <div className="site min-h-screen flex flex-col">
        {/* First stop for a keyboard user, so they are not forced through the
            whole nav on every page. */}
        <a href="#main" className="skip-link">
          <Tr>Skip to main content</Tr>
        </a>

        <NavBar />
        <TranslationNotice />

        <main id="main" className="w-full">
          {children}
        </main>

        <Footer />
      </div>
    </LocaleProvider>
  );
}
