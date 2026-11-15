'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { money } from '@/lib/area/format';
import { type UnpaidTrip, payUnpaidTrip } from '@/lib/area/rider';

/**
 * 15 Nov (Srini's ruling): the rider's last trip was not paid, so booking waits until it is. In the
 * USA "Pay now" charges the card saved on that trip; elsewhere the trip page takes the payment.
 */
export function UnpaidTripCard({ trip, onPaid }: { trip: UnpaidTrip; onPaid: () => void }) {
  const tr = useTr();
  const { locale } = useLocale();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const amount = money(trip.amount, trip.currency, locale) ?? trip.amount;

  async function pay() {
    setBusy(true);
    setNote(null);
    try {
      const r = await payUnpaidTrip();
      if (r.result === 'paid' || r.result === 'nothing_to_pay') { onPaid(); return; }
      setNote(r.message ?? tr('We could not charge your card. Open the trip to pay.'));
    } catch (e) {
      setNote((e as { message?: string })?.message || tr('Your card was declined. Nothing was charged.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="acard acol" style={{ gap: 8 }} role="alert" data-testid="unpaid-trip">
      <h2 className="a16 ab">{tr('Pay for your last trip')}</h2>
      <p className="a14">{tr('Your payment of {amount} for trip #{n} did not go through. You can book again once it is paid.')
        .replace('{amount}', amount).replace('{n}', String(trip.trip_id))}</p>
      {note && <p className="a14 ared" role="status">{note}</p>}
      <div className="arow" style={{ gap: 8, flexWrap: 'wrap' }}>
        {trip.can_retry_card && (
          <button type="button" className="abtn abtn--pri" disabled={busy} onClick={pay} data-testid="unpaid-pay">
            {busy ? tr('Paying…') : tr('Pay {amount} now').replace('{amount}', amount)}
          </button>
        )}
        <Link href={`/trips/${trip.trip_id}`} className="abtn abtn--ghost">{tr('Open the trip')}</Link>
      </div>
    </section>
  );
}
