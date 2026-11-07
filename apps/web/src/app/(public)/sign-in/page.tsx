import { Suspense } from 'react';
import type { Metadata } from 'next';
import { KeepNextLink } from '@/components/KeepNextLink';
import { AuthShell } from '@/components/form';
import SignInForm from '@/components/SignInForm';
import { Tr } from '@/i18n/website';

export const metadata: Metadata = {
  title: 'Log in — SaaradhiGo',
  description: 'Log in to your SaaradhiGo rider account.',
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
      title="Log in"
      alt={
        <>
          <Tr>New here?</Tr>{' '}
          <Suspense fallback={null}>
            <KeepNextLink href="/sign-up"><Tr>Create an account</Tr></KeepNextLink>
          </Suspense>
        </>
      }
      footer={
        <>
          <Tr>Driver?</Tr>{' '}
          <Suspense fallback={null}>
            <KeepNextLink href="/driver/sign-in"><Tr>Log in as a driver</Tr></KeepNextLink>
          </Suspense>
        </>
      }
    >
      <Suspense fallback={<div className="h-48" aria-hidden="true" />}>
        <SignInForm role="rider" />
      </Suspense>
    </AuthShell>
  );
}
