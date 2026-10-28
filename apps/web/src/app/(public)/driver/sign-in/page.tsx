import { Suspense } from 'react';
import type { Metadata } from 'next';
import { KeepNextLink } from '@/components/KeepNextLink';
import { AuthShell } from '@/components/form';
import SignInForm from '@/components/SignInForm';

export const metadata: Metadata = {
  title: 'Driver sign in — SaaradhiGo',
  description: 'Sign in to your SaaradhiGo driver account.',
};

// WRAPPED IN SUSPENSE BECAUSE THE FORM READS `next`.
//
// The form now sends a rider back to the booking they came from, which means
// reading a search parameter, and Next cannot statically prerender a client
// component that does without a boundary to fall back to. The fallback is the
// height of the form rather than a spinner, so the card does not jump when it
// resolves.
export default function Page() {
  return (
    <AuthShell
      title="Driver sign in"
      intro="Use the email address and password on your driver account."
      footer={
        <>
          <p>
            Not signed up yet?{' '}
            <Suspense fallback={null}>
              <KeepNextLink href="/driver/sign-up">Apply to drive</KeepNextLink>
            </Suspense>
          </p>
          <p>
            Looking for a ride?{' '}
            <Suspense fallback={null}>
              <KeepNextLink href="/sign-in">Rider sign in</KeepNextLink>
            </Suspense>
          </p>
        </>
      }
    >
      <Suspense fallback={<div className="h-48" aria-hidden="true" />}>
        <SignInForm role="driver" />
      </Suspense>
    </AuthShell>
  );
}
