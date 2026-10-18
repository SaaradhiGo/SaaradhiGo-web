'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/form';
import { rideHistory } from '@/lib/booking';
import { messageFor, readRiderToken } from '@/lib/publicAuth';

type Trip = {
  id?: number | string;
  status?: string;
  pickup_address?: string;
  destination_address?: string;
  final_fare?: string | number | null;
  estimated_fare?: string | number | null;
  payment_status?: string;
  requested_at?: string;
};

/**
 * The rider's own trips.
 *
 * Deliberately NOT `/trips` -- that path belongs to the operator console in
 * this same app, and sending a rider there would be a rider following a link
 * into a staff screen.
 */
export default function MyTripsPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = readRiderToken();
    setSignedIn(Boolean(token));
    if (!token) return;

    rideHistory()
      .then((rows) => setTrips(rows as Trip[]))
      .catch((err) =>
        setError(messageFor(err, 'We could not load your trips.')),
      );
  }, []);

  if (signedIn === null) return <p className="text-white/60">Loading…</p>;

  if (!signedIn) {
    return (
      <div className="max-w-md mx-auto">
        <h1 className="text-3xl font-bold">Your trips</h1>
        <div className="card mt-6 space-y-4">
          <Alert kind="info">Sign in to see your trips and receipts.</Alert>
          <Link href="/sign-in" className="btn-primary w-full">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold">Your trips</h1>

      {error && (
        <div className="mt-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {trips === null && !error && (
        <div className="card mt-6 space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {trips !== null && trips.length === 0 && (
        <div className="card mt-6">
          <p className="text-white/70">
            You have not taken a ride yet. When you do, it appears here with its
            receipt.
          </p>
          <Link href="/book" className="btn-primary inline-flex mt-4">
            Book a ride
          </Link>
        </div>
      )}

      {trips !== null && trips.length > 0 && (
        <ul className="mt-6 space-y-3">
          {trips.map((t, i) => (
            <li key={t.id ?? i} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {t.pickup_address || 'Pickup'} →{' '}
                    {t.destination_address || 'Destination'}
                  </p>
                  <p className="text-xs text-white/55 mt-1">
                    {t.requested_at
                      ? new Date(t.requested_at).toLocaleString()
                      : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-semibold">
                    {t.final_fare ?? t.estimated_fare ?? '—'}
                  </p>
                  <p className="text-xs text-white/55 capitalize">
                    {t.status ?? ''}
                  </p>
                </div>
              </div>
              {t.payment_status && (
                <p className="mt-2 text-xs text-white/55">
                  Payment: {t.payment_status}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
