'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/form';
import { Badge } from '@/components/sg/Badge';
import { ButtonLink } from '@/components/sg/Button';
import {
  DriverProfile,
  DriverTrip,
  EarningsSummary,
  Vehicle,
  driverEarnings,
  driverProfile,
  driverTrips,
  driverVehicles,
  rows,
} from '@/lib/driver';
import { messageFor } from '@/lib/publicAuth';
import { useSession } from '@/lib/useSession';

/**
 * The driver's own home.
 *
 * THERE WAS NO DRIVER SCREEN ON THIS SITE AT ALL.
 *
 * `/drive` is a marketing page that invites people to apply. Signing in as a
 * driver sent you there, with a rider's header above it -- "My trips" and no
 * name, no number, no vehicle, no approval state. A correct sign-in was
 * indistinguishable from a broken one, which is exactly what was reported.
 *
 * Everything below comes from an endpoint the Android driver app already
 * uses. Where the server does not answer a question, the card says the
 * figure is unavailable rather than showing a zero -- a driver reading
 * "0 trips" when the request failed has been told something false about
 * their own week.
 *
 * WHAT THIS IS NOT. It is not the driver app. Going online, accepting trips
 * and uploading documents happen on the handset, because that is where the
 * location permission, the background service and the camera are. This is
 * the account view: who you are to us, whether you may be dispatched, what
 * you have earned, and what we hold on your vehicle.
 */
function money(value: string | number | null | undefined, currency = '₹') {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${currency}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string | null;
  note?: string;
}) {
  return (
    <div className="card">
      <span className="caption text-ink-subtle block">{label}</span>
      <strong className="sg-num block text-2xl mt-sg-1">
        {value ?? <span className="text-ink-subtle text-base">Unavailable</span>}
      </strong>
      {note && <span className="caption text-ink-muted block mt-sg-1">{note}</span>}
    </div>
  );
}

export default function DriverHomePage() {
  const session = useSession({ refresh: true });

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [trips, setTrips] = useState<DriverTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const role = session.status === 'in' ? session.role : null;

  useEffect(() => {
    if (role !== 'driver') return;

    // Four independent requests. One failing must not blank the other three:
    // a driver whose earnings endpoint is down should still be able to see
    // whether they are approved.
    driverProfile()
      .then(setProfile)
      .catch((err) =>
        setError(messageFor(err, 'We could not load your driver profile.')),
      );
    driverEarnings().then(setEarnings).catch(() => setEarnings({}));
    driverVehicles().then((v) => setVehicles(rows(v))).catch(() => setVehicles([]));
    driverTrips().then((t) => setTrips(rows(t).slice(0, 5))).catch(() => setTrips([]));
  }, [role]);

  if (session.status === 'loading') {
    return <p className="text-ink-subtle">Loading…</p>;
  }

  if (session.status === 'out') {
    return (
      <div className="sg-page max-w-md">
        <h1 className="text-3xl font-bold">Driver home</h1>
        <div className="card mt-6 space-y-4">
          <Alert kind="info">Sign in with your driver account to see it.</Alert>
          <ButtonLink
            href="/driver/sign-in?next=%2Fdriver%2Fhome"
            variant="primary"
            block
          >
            Driver sign in
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (role !== 'driver') {
    // A rider followed a driver link. Say which account they are on rather
    // than showing an empty driver screen or a bare 403.
    return (
      <div className="sg-page max-w-md">
        <h1 className="text-3xl font-bold">Driver home</h1>
        <div className="card mt-6 space-y-4">
          <Alert kind="info">
            You are signed in as a {role === 'admin' ? 'operator' : 'rider'}.
            This page belongs to a driver account.
          </Alert>
          <ButtonLink href="/" variant="secondary" block>
            Go to the rider home
          </ButtonLink>
        </div>
      </div>
    );
  }

  const name = session.user?.full_name?.trim() || 'Driver';
  const vehicle = profile?.active_vehicle_details ?? vehicles?.[0] ?? null;
  const rating = Number(profile?.ratings ?? 0);

  return (
    <div className="sg-page max-w-3xl space-y-sg-6">
      <header>
        <h1 className="text-3xl font-bold">{name}</h1>
        <p className="text-ink-muted mt-sg-1">
          {session.user?.phone_number}
          {session.user?.email ? ` · ${session.user.email}` : ''}
        </p>
      </header>

      {error && <Alert kind="error">{error}</Alert>}

      {/* --- may this driver be dispatched -------------------------------- */}
      <section className="card space-y-sg-3">
        <div className="flex items-center justify-between gap-sg-4 flex-wrap">
          <h2 className="text-xl font-semibold m-0">Account status</h2>
          {profile ? (
            <Badge tone={profile.dispatch_eligible ? 'success' : 'neutral'}>
              {profile.dispatch_eligible ? 'Can receive trips' : 'Not receiving trips'}
            </Badge>
          ) : (
            <Badge tone="neutral">Checking…</Badge>
          )}
        </div>

        {profile && (
          <dl className="grid gap-sg-2 sm:grid-cols-2">
            <div>
              <dt className="caption text-ink-subtle">Document review</dt>
              <dd className="font-semibold">
                {profile.approved ? 'Approved' : 'Awaiting review'}
              </dd>
            </div>
            <div>
              <dt className="caption text-ink-subtle">Current state</dt>
              <dd className="font-semibold capitalize">{profile.status || 'off'}</dd>
            </div>
            <div>
              <dt className="caption text-ink-subtle">Licence expires</dt>
              <dd className="font-semibold">{profile.license_expiry || 'Not on file'}</dd>
            </div>
            <div>
              <dt className="caption text-ink-subtle">Rating</dt>
              <dd className="font-semibold sg-num">
                {rating > 0 ? rating.toFixed(2) : 'No ratings yet'}
              </dd>
            </div>
          </dl>
        )}

        {/* `approved` and `dispatch_eligible` are two different questions and
            the server computes them separately. Saying so beats leaving a
            driver to work out why an approved account is not being offered
            work. */}
        {profile && profile.approved && !profile.dispatch_eligible && (
          <Alert kind="info">
            Your documents are approved, but dispatch is not sending you trips
            yet. That usually means a vehicle is not set as active, or a
            document on file has expired.
          </Alert>
        )}
        {profile && !profile.approved && (
          <Alert kind="info">
            Upload your licence, registration and insurance in the driver app.
            An operator reviews them before you can be dispatched.
          </Alert>
        )}
        {profile?.qa_simulated_eligibility && (
          <Alert kind="info">
            This is a QA test account with simulated eligibility. It is not an
            approval.
          </Alert>
        )}
      </section>

      {/* --- earnings ----------------------------------------------------- */}
      <section className="space-y-sg-3">
        <h2 className="text-xl font-semibold">Earnings</h2>
        <div className="grid gap-sg-3 sm:grid-cols-3">
          <Stat
            label="Today"
            value={money(earnings?.today_net)}
            note={
              earnings?.today_trips !== undefined
                ? `${earnings.today_trips} trip${earnings.today_trips === 1 ? '' : 's'}`
                : undefined
            }
          />
          <Stat
            label="All time"
            value={money(earnings?.total_net)}
            note={
              earnings?.total_trips !== undefined
                ? `${earnings.total_trips} trips`
                : undefined
            }
          />
          <Stat
            label="Wallet"
            value={money(earnings?.wallet_balance)}
            note="Available to withdraw"
          />
        </div>
        <p className="caption text-ink-subtle">
          Net of commission. Cash you collected from riders is settled against
          this balance.
        </p>
      </section>

      {/* --- vehicle ------------------------------------------------------ */}
      <section className="card space-y-sg-2">
        <h2 className="text-xl font-semibold m-0">Vehicle</h2>
        {vehicle ? (
          <>
            <p className="font-semibold sg-num m-0">
              {vehicle.vehicle_number || 'No registration number on file'}
            </p>
            <p className="text-ink-muted m-0">
              {[vehicle.brand, vehicle.model, vehicle.color]
                .filter(Boolean)
                .join(' · ') || 'No make or model on file'}
            </p>
            {vehicle.insurance_expiry && (
              <p className="caption text-ink-subtle m-0">
                Insurance expires {vehicle.insurance_expiry}
              </p>
            )}
          </>
        ) : (
          <p className="text-ink-muted m-0">
            {vehicles === null
              ? 'Loading…'
              : 'No vehicle added yet. Add one in the driver app before going online.'}
          </p>
        )}
      </section>

      {/* --- recent trips -------------------------------------------------- */}
      <section className="space-y-sg-3">
        <h2 className="text-xl font-semibold">Recent trips</h2>
        {trips === null && <p className="text-ink-subtle">Loading…</p>}
        {trips !== null && trips.length === 0 && (
          <p className="text-ink-muted">
            No completed trips yet. They appear here once you have driven.
          </p>
        )}
        {trips !== null && trips.length > 0 && (
          <ul className="card divide-y divide-line p-0">
            {trips.map((t, i) => (
              <li key={t.id ?? i} className="p-sg-4 grid gap-1">
                <span className="font-semibold truncate">
                  {t.pickup_address || 'Pickup'} → {t.destination_address || 'Drop'}
                </span>
                <span className="caption text-ink-muted">
                  {t.status || 'unknown'}
                  {money(t.total_fare ?? t.fare)
                    ? ` · ${money(t.total_fare ?? t.fare)}`
                    : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="caption text-ink-subtle">
        Going online, accepting trips and uploading documents happen in the
        driver app.{' '}
        <Link href="/account" className="sg-link">
          Your profile and details
        </Link>
      </p>
    </div>
  );
}
