import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/form';
import RegisterForm from '@/components/RegisterForm';

export const metadata: Metadata = {
  title: 'Sign up — SaaradhiGo',
  description: 'Create your SaaradhiGo rider account with an email address and a password.',
};

export default function Page() {
  return (
    <AuthShell
      title="Create a rider account"
      intro="One account for booking rides, your receipts and support."
      footer={
        <>
          <p>
            Already have an account?{' '}
            <Link href="/sign-in" className="text-brand hover:underline">
              Sign in
            </Link>
          </p>
          <p>
            Want to drive with us?{' '}
            <Link href="/driver/sign-up" className="text-brand hover:underline">
              Apply to drive
            </Link>
          </p>
        </>
      }
    >
      <RegisterForm role="rider" />
    </AuthShell>
  );
}
