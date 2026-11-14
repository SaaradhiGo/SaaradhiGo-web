'use client';

import { useEffect, useRef, useState } from 'react';
import { useTr } from '@/i18n/website';

/** What the hold needs from Stripe.js (14 Nov, USA). */
export type StripeSetup = { clientSecret: string; publishableKey: string; amount: string; currency: string };
type StripeJs = {
  elements: (o: Record<string, unknown>) => { create: (kind: string) => { mount: (el: HTMLElement) => void; destroy: () => void } };
  confirmPayment: (o: Record<string, unknown>) => Promise<{ error?: { message?: string }; paymentIntent?: { status: string } }>;
};

let loader: Promise<boolean> | null = null;
function loadStripe(): Promise<boolean> {
  const w = window as unknown as { Stripe?: unknown };
  if (w.Stripe) return Promise.resolve(true);
  loader ??= new Promise((resolve) => {
    const el = document.createElement('script');
    el.src = 'https://js.stripe.com/v3/';
    el.onload = () => resolve(true);
    el.onerror = () => { loader = null; resolve(false); };
    document.head.appendChild(el);
  });
  return loader;
}

/**
 * Stripe's own form (cards, Apple Pay, Google Pay) to hold the locked fare before booking. The card
 * never reaches SaaradhiGo. Done when Stripe says the payment is held (`requires_capture`).
 */
export function CardHoldSheet({ setup, onDone }: { setup: StripeSetup; onDone: (ok: boolean) => void }) {
  const tr = useTr();
  const box = useRef<HTMLDivElement | null>(null);
  const [js, setJs] = useState<{ stripe: StripeJs; elements: unknown } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadStripe().then((ok) => {
      const ctor = (window as unknown as { Stripe?: (k: string) => StripeJs }).Stripe;
      if (!live || !ok || !ctor || !box.current) { if (live) setErr(tr('Card payment is not available right now.')); return; }
      const stripe = ctor(setup.publishableKey);
      const elements = stripe.elements({ clientSecret: setup.clientSecret });
      elements.create('payment').mount(box.current);
      setJs({ stripe, elements });
    });
    return () => { live = false; };
  }, [setup, tr]);
  async function confirm() {
    if (!js) return;
    setBusy(true);
    setErr(null);
    const r = await js.stripe.confirmPayment({ elements: js.elements, redirect: 'if_required' });
    setBusy(false);
    if (r.error || !['requires_capture', 'succeeded'].includes(r.paymentIntent?.status ?? '')) {
      setErr(r.error?.message || tr('Your card was not accepted.'));
      return;
    }
    onDone(true);
  }
  return (
    <div className="asheet-scrim" role="dialog" aria-modal="true" aria-labelledby="hold-title">
      <div className="asheet">
        <h2 className="a20" id="hold-title">{tr('Confirm your card')}</h2>
        <p className="a14 amut">{tr('We hold {amount} now and charge it only when the trip ends.').replace('{amount}', `${setup.currency} ${setup.amount}`)}</p>
        <div ref={box} data-testid="stripe-payment" />
        {err && <p className="a14 ared" role="alert">{err}</p>}
        <div className="arow" style={{ gap: 8 }}>
          <button type="button" className="abtn abtn--pri agrow" onClick={confirm} disabled={!js || busy}>
            {busy ? tr('Please wait…') : tr('Hold and book')}
          </button>
          <button type="button" className="abtn abtn--ghost" onClick={() => onDone(false)}>{tr('Cancel')}</button>
        </div>
      </div>
    </div>
  );
}
