import type { Metadata } from 'next';
import Link from 'next/link';
import OtpAuthForm from '@/components/OtpAuthForm';

export const metadata: Metadata = {
  title: 'Drive with SaaradhiGo — apply',
  description:
    'Apply to drive with SaaradhiGo. Confirm your mobile number, then submit '
    + 'your documents in the driver app.',
};

export default function DriverSignUpPage() {
  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-2xl font-bold">Apply to drive</h1>
      <p className="mt-2 text-sm text-white/60">
        Step one is confirming your mobile number. Documents and vehicle
        details are submitted in the driver app, and our team reviews them
        before your first trip.
      </p>
      <div className="mt-6">
        <OtpAuthForm role="driver" mode="sign-up" />
      </div>

      <div className="card mt-6">
        <h2 className="font-semibold text-brand text-sm">
          What you will need
        </h2>
        <ul className="mt-2 space-y-1 text-sm text-white/70 list-disc list-inside">
          <li>A valid driving licence</li>
          <li>Vehicle registration (RC) and insurance</li>
          <li>A bank account for payouts</li>
          <li>An Android phone</li>
        </ul>
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
        Already driving with us?{' '}
        <Link href="/driver/sign-in" className="text-brand hover:underline">
          Driver sign in
        </Link>
      </p>
    </div>
  );
}
