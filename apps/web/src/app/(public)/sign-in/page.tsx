import { Suspense } from 'react';
import type { Metadata } from 'next';
import { KeepNextLink } from '@/components/KeepNextLink';
import { AuthShell } from '@/components/form';
import SignInForm from '@/components/SignInForm';

export const metadata: Metadata = {
  title: 'Sign in — SaaradhiGo',
  description: 'Sign in to your SaaradhiGo rider account.',
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
      title="Sign in"
      intro="Use the email address and password on your account."
      footer={
        <>
          <p>
            New to SaaradhiGo?{' '}
            <Suspense fallback={null}>
              <KeepNextLink href="/sign-up">Create an account</KeepNextLink>
            </Suspense>
          </p>
          <p>
            Driver?{' '}
            <Suspense fallback={null}>
              <KeepNextLink href="/driver/sign-in">Sign in as a driver</KeepNextLink>
            </Suspense>
          </p>
        </>
      }
    >
      <Suspense fallback={<div className="h-48" aria-hidden="true" />}>
        <SignInForm role="rider" />
      </Suspense>
    </AuthShell>
  );
}
