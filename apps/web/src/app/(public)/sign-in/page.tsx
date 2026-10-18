import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/form';
import SignInForm from '@/components/SignInForm';

export const metadata: Metadata = {
  title: 'Sign in — SaaradhiGo',
  description: 'Sign in to your SaaradhiGo rider account.',
};

export default function Page() {
  return (
    <AuthShell
      title="Sign in"
      intro="Use the email address and password on your account."
      footer={
        <>
          <p>
            New to SaaradhiGo?{' '}
            <Link href="/sign-up" className="text-brand hover:underline">
              Create an account
            </Link>
          </p>
          <p>
            Driver?{' '}
            <Link href="/driver/sign-in" className="text-brand hover:underline">
              Sign in as a driver
            </Link>
          </p>
        </>
      }
    >
      <SignInForm role="rider" />
    </AuthShell>
  );
}
