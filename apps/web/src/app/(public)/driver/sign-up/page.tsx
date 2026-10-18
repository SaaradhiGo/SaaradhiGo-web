import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/form';
import RegisterForm from '@/components/RegisterForm';

export const metadata: Metadata = {
  title: 'Drive with SaaradhiGo — apply',
  description: 'Create your SaaradhiGo driver account and start the onboarding checks.',
};

export default function Page() {
  return (
    <AuthShell
      title="Apply to drive"
      intro="Create your account first. Documents and vehicle details come next, in the driver app."
      footer={
        <>
          <p>
            Already driving with us?{' '}
            <Link href="/driver/sign-in" className="text-brand hover:underline">
              Driver sign in
            </Link>
          </p>
          <p>
            Looking for a ride instead?{' '}
            <Link href="/sign-up" className="text-brand hover:underline">
              Create a rider account
            </Link>
          </p>
        </>
      }
    >
      <RegisterForm role="driver" />
    </AuthShell>
  );
}
