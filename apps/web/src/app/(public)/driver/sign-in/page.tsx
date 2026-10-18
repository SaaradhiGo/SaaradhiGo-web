import type { Metadata } from 'next';
import Link from 'next/link';
import OtpAuthForm from '@/components/OtpAuthForm';

export const metadata: Metadata = {
  title: 'Driver sign in — SaaradhiGo',
  description: 'Sign in to your SaaradhiGo driver account with your mobile number.',
};

export default function DriverSignInPage() {
  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold">Driver sign in</h1>
      <p className="mt-2 text-sm text-white/60">
        Use the mobile number registered to your driver account. Trips are
        accepted in the driver app; this signs you in for support and earnings
        questions.
      </p>
      <div className="mt-6">
        <OtpAuthForm role="driver" mode="sign-in" />
      </div>
      <p className="mt-5 text-sm text-white/60">
        Not signed up yet?{' '}
        <Link href="/driver/sign-up" className="text-brand hover:underline">
          Apply to drive
        </Link>
      </p>
      <p className="mt-2 text-sm text-white/60">
        Looking for a ride?{' '}
        <Link href="/sign-in" className="text-brand hover:underline">
          Rider sign in
        </Link>
      </p>
    </div>
  );
}
