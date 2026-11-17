import { Suspense } from 'react';
import { localized } from '@/i18n/server';
import { KeepNextLink } from '@/components/KeepNextLink';
import { AuthShell } from '@/components/form';
import RiderSignUpForm from '@/components/RiderSignUpForm';
import { Tr } from '@/i18n/website';
import Link from 'next/link';
import { Alert } from '@/components/form';
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
    return (
      <AuthShell title="Create your account">
        <Alert kind="info"><Tr>Rider sign-up opens soon, when we launch in Hyderabad.</Tr></Alert>
        <p className="s-help"><Link href="/fares" className="sg-link"><Tr>See fares</Tr></Link></p>
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
