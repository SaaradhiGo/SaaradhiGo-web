import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/form';
import SignInForm from '@/components/SignInForm';

export const metadata: Metadata = {
  title: 'Driver sign in — SaaradhiGo',
  description: 'Sign in to your SaaradhiGo driver account.',
};

export default function Page() {
  return (
    <AuthShell
      title="Driver sign in"
      intro="Use the email address and password on your driver account."
      footer={
        <>
          <p>
            Not signed up yet?{' '}
            <Link href="/driver/sign-up" className="sg-link">
              Apply to drive
            </Link>
          </p>
          <p>
            Looking for a ride?{' '}
            <Link href="/sign-in" className="sg-link">
              Rider sign in
            </Link>
          </p>
        </>
      }
    >
      <SignInForm role="driver" />
    </AuthShell>
  );
}
