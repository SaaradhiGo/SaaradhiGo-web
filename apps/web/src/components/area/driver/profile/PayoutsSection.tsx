'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTr } from '@/i18n/website';
import { ifsc as lookupIfsc, savePayoutMethod, stripeOnboarding, stripeRefresh } from '@/lib/area/requirements';
import { Field, Reason, Section, item, useReq, useSaver } from './shared';

const VERIFY: Record<string, string> = {
  verified: 'Verified', pending: 'Verification pending', pending_config: 'Verification pending (config)',
  failed: 'Could not be verified',
};
const STRIPE: Record<string, string> = { not_started: 'Not started', in_progress: 'In progress', ready: 'Ready' };

/** India: bank account (number twice, IFSC looked up) or UPI ID. USA: Stripe Connect onboarding. */
export function PayoutsSection() {
  const tr = useTr();
  const { data, reload } = useReq();
  const search = useSearchParams();
  const pm = data?.payout_method;
  const [method, setMethod] = useState<'bank' | 'upi'>('bank');
  const [holder, setHolder] = useState('');
  const [number, setNumber] = useState('');
  const [confirm, setConfirm] = useState('');
  const [code, setCode] = useState('');
  const [bank, setBank] = useState<string | null>(null);
  const [upi, setUpi] = useState('');
  const saver = useSaver();

  useEffect(() => { if (pm?.kind === 'upi') setMethod('upi'); }, [pm?.kind]);
  useEffect(() => {
    // Back from Stripe's onboarding (or QA's fake one): read the account's state again.
    if (search?.get('stripe') === 'return') stripeRefresh(search.get('fake') === '1').then(reload, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setBank(null);
    if (/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code)) lookupIfsc(code).then((b) => setBank(`${b.bank}, ${b.branch}`), () => setBank(''));
  }, [code]);
  if (!data || !pm) return null;
  const it = item(data, 'payout_method');

  if (data.config.country === 'US') {
    return (
      <Section id="payouts" title={tr('Payouts')} it={it}>
        <p className="a14 amut">{tr('Payouts in the USA go through Stripe. Stripe asks for your bank details and tax information; SaaradhiGo never sees them.')}</p>
        <div className="arow" style={{ justifyContent: 'space-between' }}>
          <span>{tr('Status')}: <span className="ab">{tr(STRIPE[pm.stripe_status ?? 'not_started'])}</span></span>
          {pm.stripe_status !== 'ready' && (
            <button type="button" className="abtn abtn--dark" disabled={saver.busy} data-testid="stripe-setup"
              onClick={() => void saver.run(async () => { const { url } = await stripeOnboarding(); window.location.assign(url); }, tr('Opening Stripe…'))}>
              {tr('Set up payouts')}
            </button>
          )}
        </div>
        {saver.line}
      </Section>
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = method === 'upi' ? { method, upi_id: upi }
      : { method, holder_name: holder, account_number: number, account_number_confirm: confirm, ifsc: code };
    if (await saver.run(() => savePayoutMethod(body))) { setNumber(''); setConfirm(''); setUpi(''); reload(); }
  }

  return (
    <Section id="payouts" title={tr('Bank and payouts')} it={it}>
      <Reason it={it} />
      {pm.bank && <p className="a14">{tr('On file')}: <span className="ab">{pm.bank.bank_name} {pm.bank.account_masked}</span> · {pm.bank.ifsc} · {tr(VERIFY[pm.bank.verification_status] ?? pm.bank.verification_status)}</p>}
      {pm.kind === 'upi' && pm.upi_masked && <p className="a14">{tr('On file')}: <span className="ab">UPI {pm.upi_masked}</span></p>}
      {pm.held_until && <p className="a14 ared" role="note">{tr('Your payout details changed. For your safety, payouts resume at {time}.').replace('{time}', new Date(pm.held_until).toLocaleString())}</p>}
      <div className="arow" role="radiogroup" aria-label={tr('Payout method')} style={{ gap: 8 }}>
        {(['bank', 'upi'] as const).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={method === m} className={`achip${method === m ? ' achip--on' : ''}`} onClick={() => setMethod(m)}>
            {tr(m === 'bank' ? 'Bank account' : 'UPI ID')}
          </button>
        ))}
      </div>
      <form onSubmit={save} style={{ display: 'grid', gap: 12 }}>
        {method === 'bank' ? (
          <>
            <Field id="pb-h" label={tr('Account holder name')}><div className="afield"><input id="pb-h" value={holder} onChange={(e) => setHolder(e.target.value)} required /></div></Field>
            <Field id="pb-n" label={tr('Account number')}><div className="afield"><input id="pb-n" inputMode="numeric" autoComplete="off" value={number} onChange={(e) => setNumber(e.target.value.replace(/\s/g, ''))} required /></div></Field>
            <Field id="pb-c" label={tr('Account number again')}><div className="afield"><input id="pb-c" inputMode="numeric" autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\s/g, ''))} required onPaste={(e) => e.preventDefault()} /></div></Field>
            <Field id="pb-i" label={tr('IFSC')} help={bank === null ? undefined : bank ? bank : tr('We could not find that IFSC.')}>
              <div className="afield"><input id="pb-i" maxLength={11} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required /></div>
            </Field>
          </>
        ) : (
          <Field id="pb-u" label={tr('UPI ID')}><div className="afield"><input id="pb-u" placeholder="name@okaxis" value={upi} onChange={(e) => setUpi(e.target.value.trim())} required /></div></Field>
        )}
        <p className="a14 amut">{tr('Changing your payout details pauses payouts for 24 hours, and we text you about the change.')}</p>
        <div><button type="submit" className="abtn abtn--dark" disabled={saver.busy}>{tr('Save')}</button></div>
        {saver.line}
      </form>
    </Section>
  );
}
