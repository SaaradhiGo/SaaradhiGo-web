'use client';

import Link from 'next/link';
import { Logo } from '@/components/sg/Logo';
import { EnvBadge } from '@/components/console/EnvBadge';
import { useTheme } from '@/lib/consolePrefs';
import { SUPPORT_EMAIL } from '@/lib/support';
import '@/styles/console.css';

/**
 * "Get help signing in."
 *
 * Deliberately short and deliberately unhelpful to anyone who is not
 * staff: there is no "enter your email and we will check" here, because a
 * form that checks is a form that tells an outsider which addresses have
 * accounts. Staff access is granted and repaired by an administrator, so
 * the page says who to ask and what to have ready, and nothing else.
 */
export default function LoginHelpPage() {
  const [theme] = useTheme();
  return (
    <div className="login" data-theme={theme}>
      <aside className="login__brand sg-on-noir">
        <Link href="/login" className="login__lockup" aria-label="Saaradhi Go, back to sign in">
          <Logo variant="emblem" />
          <span>Saaradhi Go</span>
        </Link>
        <div className="login__hero">
          <h1>Getting back <em>in</em></h1>
          <p>Staff access is granted by your administrator. Nothing on this
            page can look an account up, and that is on purpose.</p>
        </div>
        <ul className="login__caps" aria-label="What the console is for">
          <li>Driver onboarding</li>
          <li>Live rides</li>
          <li>Payments</li>
          <li>Safety</li>
        </ul>
      </aside>

      <main className="login__panel">
        <div className="login__card">
          <div className="login__head">
            <div className="login__head-row">
              <h2>Help signing in</h2>
              <EnvBadge />
            </div>
            <p>Contact the administrator who set up your access. They can
              reset your password, re-enrol your authenticator or unlock the
              account.</p>
          </div>

          <div className="login__help">
            <h3>Have ready</h3>
            <ul>
              <li>Your work email address, exactly as it was set up.</li>
              <li>Which city or region you work in.</li>
              <li>What the screen said, word for word, if it refused you.</li>
            </ul>

            <h3>Common causes</h3>
            <ul>
              <li><b>Wrong email or password.</b> The form gives the same answer
                for both, so check both. Passwords are case-sensitive.</li>
              <li><b>Authenticator code refused.</b> Codes change every 30
                seconds; use the current one. If your phone&rsquo;s clock is
                wrong, so are its codes.</li>
              <li><b>Account paused.</b> After several wrong attempts the
                account rests for a few minutes. Wait, then try once.</li>
              <li><b>No access yet.</b> Signing in but seeing nothing means
                no role has been assigned to you. Ask for one.</li>
            </ul>

            <h3>No administrator to hand?</h3>
            <p style={{ margin: 0 }}>
              Email <a className="login__link" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from
              your work address. Nobody will ask you for your password.
            </p>
          </div>

          <div className="login__links">
            <Link href="/login" className="login__link">Back to sign in</Link>
          </div>
        </div>

        <footer className="login__footer">
          <span>© {new Date().getFullYear()} SaaradhiGo · Staff access only</span>
          <Link href="/">saaradhigo.com</Link>
        </footer>
      </main>
    </div>
  );
}
