import type { Metadata } from 'next';
import Link from 'next/link';
import OtpAuthForm from '@/components/OtpAuthForm';

export const metadata: Metadata = {
  title: 'Create a rider account — SaaradhiGo',
  description:
    'Create a SaaradhiGo rider account with your mobile number. No password needed.',
};

export default function RiderSignUpPage() {
  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold">Create a rider account</h1>
      <p className="mt-2 text-sm text-white/60">
        Your mobile number is your account. We confirm it with a one-time code.
      </p>
      <div className="mt-6">
        <OtpAuthForm role="rider" mode="sign-up" />
      </div>
      <p className="mt-5 text-xs text-white/50">
        By continuing you agree to our{' '}
        <Link href="/terms" className="text-brand hover:underline">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/privacy" className="text-brand hover:underline">
          privacy policy
        </Link>
        .
      </p>
      <p className="mt-4 text-sm text-white/60">
        Already have an account?{' '}
        <Link href="/sign-in" className="text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
