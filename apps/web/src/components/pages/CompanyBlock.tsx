'use client';

import Link from 'next/link';
import { useLegal } from '@/components/sg/LegalProvider';
import { POLICY_PAGES as P } from '@/lib/legal';

/**
 * Who operates SaaradhiGo in the market on screen (13 Nov), as a company must show it: the name,
 * then, when configured, the registered office, the CIN (India) or state file number (USA), phone
 * and email, and the Grievance Officer (India). An unset value is left out, never invented.
 */
export function CompanyBlock() {
  const { market, entity } = useLegal();
  const rows: [string, string | undefined][] = market === 'IN'
    ? [['Registered office', entity.registered_address], ['CIN', entity.cin],
       ['Phone', entity.support_phone], ['Email', entity.support_email],
       ['Grievance Officer', [entity.grievance_officer_name, entity.grievance_officer_email,
         entity.grievance_officer_phone].filter(Boolean).join(', ') || undefined]]
    : [['Registered office', entity.registered_address],
       ['State of formation', entity.state_of_formation], ['File number', entity.file_number],
       ['Phone', entity.support_phone], ['Email', entity.support_email]];
  return (
    <section className="s-wrap sg-company" aria-label="Company" data-testid="company-block">
      <span className="sg-company__name">SaaradhiGo is operated by {entity.legal_name}.</span>
      {rows.filter(([, v]) => v).map(([k, v]) => <span key={k}>{k}: {v}</span>)}
      {market === 'IN' && <span>Complaints: <Link href={P.grievance}>Grievance redressal</Link></span>}
    </section>
  );
}
