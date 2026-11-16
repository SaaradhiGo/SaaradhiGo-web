'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FinanceNav } from '@/components/console/finance';
import { PaymentRecord } from '@/components/console/money/PaymentRecord';

/**
 * One payment on its own page, for a link from elsewhere (a trip, a
 * reconciliation item, the switch chain). The same record the list opens.
 */
export default function PaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  return (
    <>
      <FinanceNav />
      <p className="ops-record-page__back"><Link href="/ops/finance/payments">All payments</Link></p>
      <div className="ops-record-page">
        {id ? <PaymentRecord key={id} id={id} /> : null}
      </div>
    </>
  );
}
