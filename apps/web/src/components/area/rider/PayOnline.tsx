'use client';

import { useState } from 'react';
import { useTr } from '@/i18n/website';
import { createOrder, payByCash, verifyPayment } from '@/lib/area/rider';

type Checkout = { open: () => void; on: (e: string, f: (r: unknown) => void) => void };
type RazorpayCtor = new (o: Record<string, unknown>) => Checkout;

let loader: Promise<boolean> | null = null;
function loadCheckout(): Promise<boolean> {
  const w = window as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(true);
  loader ??= new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => { loader = null; resolve(false); };
    document.head.appendChild(s);
  });
  return loader;
}

/**
 * Online payment at the end of the trip (11 Nov): the locked fare, by UPI or card through
 * Razorpay Checkout. A failure offers Try again and, as the fallback, paying the driver in cash.
 */
export function PayOnline({ tripId, fare, method, onPaid }: { tripId: string; fare: string; method: string; onPaid: (how: 'online' | 'cash') => void }) {
  const tr = useTr();
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [note, setNote] = useState<string | null>(null);

  async function pay() {
    setState('busy');
    setNote(null);
    try {
      const [order, ok] = await Promise.all([createOrder(tripId), loadCheckout()]);
      const Razorpay = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
      if (!ok || !Razorpay || !order.key_id || !(order.order_id || order.gateway_order_id)) throw new Error('checkout');
      const rz = new Razorpay({
        key: order.key_id, order_id: order.order_id ?? order.gateway_order_id, amount: order.amount_paise,
        currency: order.currency, name: 'SaaradhiGo', description: order.description, prefill: order.prefill,
        method: method === 'upi' ? { upi: true, card: false } : { card: true, upi: false },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try { await verifyPayment(r); onPaid('online'); } catch { setState('failed'); setNote(tr('We could not confirm the payment. Try again.')); }
        },
        modal: { ondismiss: () => setState((s) => (s === 'busy' ? 'idle' : s)) },
      });
      rz.on('payment.failed', () => { setState('failed'); setNote(tr('The payment did not go through.')); });
      rz.open();
    } catch {
      setState('failed');
      setNote(tr('Online payment is not available right now.'));
    }
  }

  async function cash() {
    setState('busy');
    try { await payByCash(tripId); onPaid('cash'); } catch { setState('failed'); setNote(tr('We could not switch to cash. Try again.')); }
  }

  return (
    <div className="acard acol" style={{ padding: 16, gap: 10 }} data-testid="pay-online">
      <div className="ab">{tr('Pay {fare}').replace('{fare}', fare)}</div>
      <div className="a14 amut">{tr(method === 'upi' ? 'By UPI, for the locked fare.' : 'By card, for the locked fare.')}</div>
      {note && <p className="a14 ared" role="alert">{note}</p>}
      <div className="arow" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="abtn abtn--pri agrow" onClick={pay} disabled={state === 'busy'}>
          {state === 'failed' ? tr('Try again') : state === 'busy' ? tr('Please wait…') : tr('Pay {fare}').replace('{fare}', fare)}
        </button>
        {state === 'failed' && <button type="button" className="abtn abtn--ghost" onClick={cash}>{tr('Pay cash instead')}</button>}
      </div>
    </div>
  );
}
