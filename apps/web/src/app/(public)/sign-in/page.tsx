import type { Metadata } from 'next';
import Link from 'next/link';
import OtpAuthForm from '@/components/OtpAuthForm';

export const metadata: Metadata = {
  title: 'Sign in — SaaradhiGo',
  description: 'Sign in to your SaaradhiGo rider account with your mobile number.',
};

export default function RiderSignInPage() {
  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-sm text-white/60">
        Use the mobile number on your rider account.
      </p>
      <div className="mt-6">
        <OtpAuthForm role="rider" mode="sign-in" />
      </div>
      <p className="mt-5 text-sm text-white/60">
        New to SaaradhiGo?{' '}
        <Link href="/sign-up" className="text-brand hover:underline">
          Create an account
        </Link>
      </p>
      <p className="mt-2 text-sm text-white/60">
        Driver?{' '}
        <Link href="/driver/sign-in" className="text-brand hover:underline">
          Sign in as a driver
        </Link>
      </p>
    </div>
  );
}
