import { Suspense } from 'react';
import { localized } from '@/i18n/server';
import Link from 'next/link';
import { AuthShell } from '@/components/form';
import RegisterForm from '@/components/RegisterForm';
import DriverApplicationForm from '@/components/DriverApplicationForm';
import { signUpOpen } from '@/lib/signup';

export const generateMetadata = localized({
  title: 'Drive with SaaradhiGo — apply',
  description: 'Create your SaaradhiGo driver account and start the onboarding checks.',
});

// WRAPPED IN SUSPENSE BECAUSE THE FORM READS `next`.
//
// The form now sends a rider back to the booking they came from, which means
// reading a search parameter, and Next cannot statically prerender a client
// component that does without a boundary to fall back to. The fallback is the
// height of the form rather than a spinner, so the card does not jump when it
// resolves.
export default function Page() {
  // 17 Nov: before SMS exists (PROD), drivers apply with their details instead of an account.
  if (!signUpOpen()) {
    return (
      <AuthShell side="driver" title="Apply to drive" intro="Tell us about you and your vehicle. We call every applicant before driver sign-up opens.">
        <DriverApplicationForm />
      </AuthShell>
    );
  }
  return (
    <AuthShell
      title="Apply to drive"
      intro="Create your account first. Documents and vehicle details come next, here or in the driver app."
      footer={
        <>
          <p>
            Already driving with us?{' '}
            <Link href="/driver/sign-in" className="sg-link">
              Driver sign in
            </Link>
          </p>
          <p>
            Looking for a ride instead?{' '}
            <Link href="/sign-up" className="sg-link">
              Create a rider account
            </Link>
          </p>
        </>
      }
    >
      <Suspense fallback={<div className="h-48" aria-hidden="true" />}>
        <RegisterForm role="driver" />
      </Suspense>
    </AuthShell>
  );
}
