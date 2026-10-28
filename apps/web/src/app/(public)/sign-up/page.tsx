import { Suspense } from 'react';
import type { Metadata } from 'next';
import { KeepNextLink } from '@/components/KeepNextLink';
import { AuthShell } from '@/components/form';
import RegisterForm from '@/components/RegisterForm';

export const metadata: Metadata = {
  title: 'Sign up — SaaradhiGo',
  description: 'Create your SaaradhiGo rider account with an email address and a password.',
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
      title="Create a rider account"
      intro="One account for booking rides, your receipts and support."
      footer={
        <>
          <p>
            Already have an account?{' '}
            <Suspense fallback={null}>
              <KeepNextLink href="/sign-in">Sign in</KeepNextLink>
            </Suspense>
          </p>
          <p>
            Want to drive with us?{' '}
            <Suspense fallback={null}>
              <KeepNextLink href="/driver/sign-up">Apply to drive</KeepNextLink>
            </Suspense>
          </p>
        </>
      }
    >
      <Suspense fallback={<div className="h-48" aria-hidden="true" />}>
        <RegisterForm role="rider" />
      </Suspense>
    </AuthShell>
  );
}
