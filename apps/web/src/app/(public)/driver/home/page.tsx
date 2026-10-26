'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/form';
import { Badge } from '@/components/sg/Badge';
import { ButtonLink } from '@/components/sg/Button';
import { ArrowRight, Check } from '@/components/sg/icons';
import {
  DriverProfile,
  DriverTrip,
  EarningsSummary,
  Onboarding,
  Vehicle,
  driverEarnings,
  driverOnboarding,
  driverProfile,
  driverTrips,
  driverVehicles,
  rows,
} from '@/lib/driver';
import { messageFor } from '@/lib/publicAuth';
import { useSession } from '@/lib/useSession';

/**
 * The driver's home.
 *
 * WHAT CHANGED, AND WHY THE FIRST VERSION DESERVED THE CRITICISM
 *
 * It opened with "Account status: awaiting review" and three zeroes. Both
 * were true and neither was useful: the review had nothing to look at
 * because the website had no way to upload a document, and a driver with no
 * trips does not need three cards telling them so in large type. A dashboard
 * that leads with empty metrics is a dashboard for a driver who does not
 * exist yet.
 *
 * It now leads with THE NEXT THING TO DO. Until a driver is approved, that
 * is their documents, with the count outstanding and one button. Once they
 * are approved, the same space becomes what they earned today -- because
 * that is the number a working driver opens this page for.
 *
 * EVERY FIGURE IS THE SERVER'S. A request that fails says so in that card
 * rather than rendering a zero: a driver reading "₹0" when the earnings
 * call failed has been told something false about their own week.
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
  large = false,
}: {
  label: string;
  value: string | null;
  note?: string;
  large?: boolean;
}) {
  return (
    <div className="card">
      <span className="caption text-ink-subtle block">{label}</span>
      <strong className={`sg-num block mt-sg-1 ${large ? 'text-4xl' : 'text-2xl'}`}>
        {value ?? <span className="text-ink-subtle text-base">Unavailable</span>}
      </strong>
      {note && <span className="caption text-ink-muted block mt-sg-1">{note}</span>}
    </div>
  );
}

export default function DriverHomePage() {
  const session = useSession({ refresh: true });
  const role = session.status === 'in' ? session.role : null;

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [earnings, setEarnings] = useState<EarningsSummary | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [trips, setTrips] = useState<DriverTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (role !== 'driver') return;

    // Independent requests. One failing must not blank the others: a driver
    // whose earnings endpoint is down should still see whether they are
    // approved and what they still owe us.
    driverProfile()
      .then(setProfile)
      .catch((err) =>
        setError(messageFor(err, 'We could not load your driver profile.')),
      );
    driverOnboarding().then(setOnboarding).catch(() => setOnboarding(null));
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
          <ButtonLink href="/driver/sign-in?next=%2Fdriver%2Fhome" variant="primary" block>
            Driver sign in
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (role !== 'driver') {
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

  const firstName = session.user?.full_name?.trim()?.split(/\s+/)[0];
  const vehicle = profile?.active_vehicle_details ?? vehicles?.[0] ?? null;
  const rating = Number(profile?.ratings ?? 0);
  const approved = Boolean(profile?.approved);
  const eligible = Boolean(profile?.dispatch_eligible);
  const rejected = profile?.doc_status === 'rejected';

  const steps = [
    ...(onboarding?.driver_documents ?? []),
    ...(onboarding?.vehicle_documents ?? []),
  ];
  const outstanding = steps.filter((s) => !s.present).length
    + (onboarding && !onboarding.license_expiry_ok ? 1 : 0)
    + (onboarding && !onboarding.vehicle ? 1 : 0);

  return (
    <div className="sg-page max-w-3xl space-y-sg-6">
      <header className="flex items-end justify-between gap-sg-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold m-0">
            {firstName ? `Hello, ${firstName}` : 'Driver home'}
          </h1>
          <p className="text-ink-muted mt-sg-1 m-0">
            {session.user?.phone_number}
            {session.user?.email ? ` · ${session.user.email}` : ''}
          </p>
        </div>
        <Badge tone={eligible ? 'success' : rejected ? 'danger' : 'neutral'}>
          {eligible
            ? 'Can receive trips'
            : rejected
              ? 'Changes needed'
              : approved
                ? 'Approved, not dispatching'
                : 'Not yet approved'}
        </Badge>
      </header>

      {error && <Alert kind="error">{error}</Alert>}

      {/* ---------------- the one thing to do next ---------------- */}
      {!approved || rejected || outstanding > 0 ? (
        <section className="card sg-next">
          <div className="sg-next__text">
            <h2 className="text-xl font-semibold m-0">
              {rejected
                ? 'An operator asked for changes'
                : outstanding > 0
                  ? 'Finish your documents'
                  : 'Your documents are with an operator'}
            </h2>
            <p className="text-ink-muted m-0">
              {rejected
                ? profile?.doc_rejection_reason
                  || 'Open your documents to see what to change.'
                : outstanding > 0
                  ? `${outstanding} ${outstanding === 1 ? 'item is' : 'items are'} still needed before you can be approved.`
                  : 'Nothing further is needed from you. We will tell you when the review is done.'}
            </p>
          </div>
          {(outstanding > 0 || rejected) && (
            <ButtonLink href="/driver/documents" variant="primary">
              {rejected ? 'See what to change' : 'Upload documents'}
              <ArrowRight />
            </ButtonLink>
          )}
        </section>
      ) : (
        <section className="grid gap-sg-3 sm:grid-cols-3">
          <Stat
            label="Earned today"
            large
            value={money(earnings?.today_net)}
            note={
              earnings?.today_trips !== undefined
                ? `${earnings.today_trips} trip${earnings.today_trips === 1 ? '' : 's'}`
                : undefined
            }
          />
          <Stat label="All time" value={money(earnings?.total_net)}
                note={earnings?.total_trips !== undefined ? `${earnings.total_trips} trips` : undefined} />
          <Stat label="Wallet" value={money(earnings?.wallet_balance)}
                note="Available to withdraw" />
        </section>
      )}

      {/* ---------------- what we hold on you ---------------- */}
      <section className="card space-y-sg-3">
        <div className="flex items-center justify-between gap-sg-3 flex-wrap">
          <h2 className="text-xl font-semibold m-0">Your account</h2>
          <Link href="/driver/documents" className="sg-link">
            Documents
          </Link>
        </div>

        <ul className="sg-doc-list">
          {steps.slice(0, 6).map((s) => (
            <li key={s.key} className="sg-doc">
              <span className={`sg-doc__tick ${s.present ? 'is-done' : ''}`} aria-hidden="true">
                {s.present ? <Check /> : null}
              </span>
              <span className="sg-doc__text">
                <strong>{s.label}</strong>
                <span>{s.present ? 'On file' : 'Not uploaded yet'}</span>
              </span>
              <span className="sg-doc__action" />
            </li>
          ))}
          {onboarding && (
            <li className="sg-doc">
              <span className={`sg-doc__tick ${onboarding.license_expiry_ok ? 'is-done' : ''}`} aria-hidden="true">
                {onboarding.license_expiry_ok ? <Check /> : null}
              </span>
              <span className="sg-doc__text">
                <strong>Licence expiry</strong>
                <span>
                  {onboarding.license_expiry
                    ? onboarding.license_expiry_ok
                      ? `Valid to ${onboarding.license_expiry}`
                      : `Expired on ${onboarding.license_expiry}`
                    : 'Not set'}
                </span>
              </span>
              <span className="sg-doc__action" />
            </li>
          )}
        </ul>

        {/* `approved` and `dispatch_eligible` are two different questions and
            the server computes them separately. Saying so beats leaving a
            driver to work out why an approved account gets no work. */}
        {approved && !eligible && (
          <Alert kind="info">
            Your documents are approved, but dispatch is not sending you trips
            yet. That usually means no vehicle is set as the one you drive, or
            a document on file has expired.
          </Alert>
        )}
        {profile?.qa_simulated_eligibility && (
          <Alert kind="info">
            This is a QA test account with simulated eligibility. It is not an
            approval.
          </Alert>
        )}
      </section>

      {/* ---------------- vehicle ---------------- */}
      <section className="card space-y-sg-2">
        <div className="flex items-center justify-between gap-sg-3 flex-wrap">
          <h2 className="text-xl font-semibold m-0">Vehicle</h2>
          {rating > 0 && (
            <span className="caption text-ink-muted sg-num">
              Rating {rating.toFixed(2)} · {profile?.total_trips ?? 0} trips
            </span>
          )}
        </div>
        {vehicle ? (
          <>
            <p className="font-semibold sg-num m-0">
              {vehicle.vehicle_number || 'No registration number on file'}
            </p>
            <p className="text-ink-muted m-0">
              {[vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(' · ')
                || 'No make or model on file'}
            </p>
            {vehicle.insurance_expiry && (
              <p className="caption text-ink-subtle m-0">
                Insurance expires {vehicle.insurance_expiry}
              </p>
            )}
          </>
        ) : (
          <p className="text-ink-muted m-0">
            {vehicles === null ? 'Loading…' : 'No vehicle added yet.'}{' '}
            <Link href="/driver/documents" className="sg-link">
              Add your vehicle
            </Link>
          </p>
        )}
      </section>

      {/* ---------------- recent trips ---------------- */}
      {trips !== null && trips.length > 0 && (
        <section className="space-y-sg-3">
          <h2 className="text-xl font-semibold">Recent trips</h2>
          <ul className="card divide-y divide-line p-0">
            {trips.map((t, i) => (
              <li key={t.id ?? i} className="p-sg-4 grid gap-1">
                <span className="font-semibold truncate">
                  {t.pickup_address || 'Pickup'} → {t.destination_address || 'Drop'}
                </span>
                <span className="caption text-ink-muted">
                  {t.status || 'unknown'}
                  {money(t.total_fare ?? t.fare) ? ` · ${money(t.total_fare ?? t.fare)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="caption text-ink-subtle">
        Going online and accepting trips happen in the driver app.{' '}
        <Link href="/account" className="sg-link">
          Your profile and details
        </Link>
      </p>
    </div>
  );
}
