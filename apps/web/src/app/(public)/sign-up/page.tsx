import { Suspense } from 'react';
import { localized } from '@/i18n/server';
import { KeepNextLink } from '@/components/KeepNextLink';
import { AuthShell } from '@/components/form';
import RiderSignUpForm from '@/components/RiderSignUpForm';
import { Tr } from '@/i18n/website';
import Link from 'next/link';
import { signUpOpen } from '@/lib/signup';

export const generateMetadata = localized({
  title: 'Sign up — SaaradhiGo',
  description: 'Create your SaaradhiGo rider account with your name, email and a password.',
});

// WRAPPED IN SUSPENSE BECAUSE THE FORM READS `next`.
//
// The form now sends a rider back to the booking they came from, which means
// reading a search parameter, and Next cannot statically prerender a client
// component that does without a boundary to fall back to. The fallback is the
// height of the form rather than a spinner, so the card does not jump when it
// resolves.
export default function Page() {
  // 17 Nov: before SMS and email exist (PROD), sign-up says it opens soon rather than failing.
  if (!signUpOpen()) {
    // 20 Nov (owner: the closed state was one grey line in an empty card): say what opens, where,
    // and give the visitor somewhere useful to go meanwhile.
    return (
      <AuthShell title="Create your account">
        <div className="su-soon" data-testid="signup-soon">
          <p className="su-soon__badge"><span aria-hidden="true" className="su-soon__dot" /><Tr>Launching in Hyderabad</Tr></p>
          <p className="su-soon__h"><Tr>Rider sign-up opens soon, when we launch in Hyderabad.</Tr></p>
          <ul className="su-soon__list">
            <li><Tr>See every fare before you book</Tr></li>
            <li><Tr>The fare you book is the fare you pay</Tr></li>
            <li><Tr>Verified drivers, a ride code and SOS on every trip</Tr></li>
          </ul>
          <div className="su-soon__actions">
            <Link href="/fares" className="sg-btn sg-btn--primary sg-btn--lg"><Tr>See fares</Tr></Link>
            <Link href="/ride" className="sg-btn sg-btn--secondary sg-btn--lg"><Tr>How riding works</Tr></Link>
          </div>
          <p className="su-soon__foot"><Tr>Want to drive?</Tr> <Link href="/drive" className="sg-link"><Tr>Drive with us</Tr></Link></p>
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Create your account"
      alt={
        <>
          <Tr>Have one?</Tr>{' '}
          <Suspense fallback={null}>
            <KeepNextLink href="/sign-in"><Tr>Log in</Tr></KeepNextLink>
          </Suspense>
        </>
      }
    >
      <Suspense fallback={<div className="h-48" aria-hidden="true" />}>
        <RiderSignUpForm />
      </Suspense>
    </AuthShell>
  );
}
