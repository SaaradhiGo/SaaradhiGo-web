'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/form';
import { rideHistory } from '@/lib/booking';
import { formatExact } from '@/lib/money';
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
  currency?: string;
};

/** "5 Nov, 9:38 pm". */
function tripWhen(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

const STATUS: Record<string, string> = {
  completed: 'Completed',
  cancelled: 'Cancelled',
  in_progress: 'On the way',
  accepted: 'Driver on the way',
  requested: 'Finding a driver',
};

function statusLabel(status?: string): string {
  if (!status) return '';
  return STATUS[status] ?? status.replace(/_/g, ' ');
}

/** The payment state in words; nothing for a plain completed payment. */
function paymentLabel(status?: string): string | null {
  if (!status || status === 'completed') return null;
  if (status === 'pending') return 'Payment pending';
  if (status === 'waived') return 'No charge';
  if (status === 'refunded') return 'Refunded';
  return `Payment ${status.replace(/_/g, ' ')}`;
}

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

  if (signedIn === null) return <p className="text-ink-subtle">Loading…</p>;

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
    <div className="sg-page max-w-2xl">
      <h1 className="text-3xl font-bold">Your trips</h1>

      {error && (
        <div className="mt-4">
          <Alert kind="error">{error}</Alert>
        </div>
      )}

      {trips === null && !error && (
        <div className="card mt-6 space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-bg-200 animate-pulse" />
          ))}
        </div>
      )}

      {trips !== null && trips.length === 0 && (
        <div className="card mt-6">
          <p className="text-ink-muted">
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
          {trips.map((t, i) => {
            const amount = formatExact(t.final_fare ?? t.estimated_fare, t.currency ?? 'INR');
            const paid = paymentLabel(t.payment_status);
            return (
              <li key={t.id ?? i} className="card" data-testid="trip-row">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-2 font-medium min-w-0">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-pickup" />
                      <span className="truncate">{t.pickup_address || 'Pickup'}</span>
                    </p>
                    <p className="flex items-center gap-2 font-medium min-w-0">
                      <span aria-hidden className="h-2 w-2 shrink-0 rounded-[2px] bg-gold-500" />
                      <span className="truncate">{t.destination_address || 'Destination'}</span>
                    </p>
                    <p className="text-sm text-ink-subtle">{tripWhen(t.requested_at)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold sg-num">{amount ?? '–'}</p>
                    <p className="text-sm text-ink-subtle">{statusLabel(t.status)}</p>
                    {paid && <p className="text-sm text-ink-subtle">{paid}</p>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
