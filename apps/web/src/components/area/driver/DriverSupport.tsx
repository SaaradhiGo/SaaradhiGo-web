'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLocale } from '@/i18n/LocaleProvider';
import { useTr } from '@/i18n/website';
import { areaGet, areaPost } from '@/lib/area/api';
import { dateLabel } from '@/lib/area/format';
import { useLoad } from '@/lib/area/useLoad';
import { messageFor } from '@/lib/publicAuth';
import { LoadError, Skel } from '../states';
import { DriverTop, useDriver } from './parts';

/** The driver's questions, by topic (11 Nov). Answers point at the screen that holds the detail. */
const TOPICS: { key: string; title: string; href: string; link: string; qa: [string, string][] }[] = [
  { key: 'payment', title: 'Earnings and payouts', href: '/driver/payouts', link: 'Open Payouts', qa: [
    ['When am I paid?', 'Your next payout and its estimated amount are on Payouts. Where Withdraw now is on, you can also take your balance today; the provider fee is shown before you confirm.'],
    ['Why is my balance lower than my earnings?', 'Cash you collected from riders is already in your hand, so it is taken off what we send you. Every trip shows how it was paid.'],
    ['I changed my bank or UPI. Why are payouts paused?', 'For your safety, payouts wait 24 hours after a change, and we text you about it. If you did not make the change, write to us now.'],
  ] },
  { key: 'account', title: 'Documents and expiry', href: '/driver/documents', link: 'Open Documents', qa: [
    ['How long does a review take?', 'Usually one working day. Each document shows its own state; a rejected one says why.'],
    ['When do you remind me about expiry?', '30, 7 and 1 days before a licence, insurance, permit, fitness or PUC date. Upload the renewed one in Documents.'],
    ['What happens when a document expires?', 'You cannot go online until the renewed document is approved. Your earnings and payouts are not affected.'],
  ] },
  { key: 'payment', title: 'Platform fee', href: '/driver/earnings', link: 'Open Earnings', qa: [
    ['How is my platform fee worked out?', 'Earnings shows your plan in one line, and "How our fee works" lists every rule with its amounts. You always keep at least 80% of every fare.'],
    ['When is the fee taken?', 'Once a day, after the day ends. Each day with a fee shows how it was worked out.'],
  ] },
  { key: 'fare_dispute', title: 'Trips and fares', href: '/driver/trips', link: 'Open Trips', qa: [
    ['Where do I see a trip’s fare and fee?', 'Open the trip on Trips: the fare, the platform fee, tips and what you earned, with the places and times.'],
    ['Something went wrong on a trip', 'Open the trip and choose Report a problem. The ticket is linked to that trip, so you do not need to explain which one.'],
  ] },
  { key: 'safety', title: 'Safety and SOS', href: '/safety', link: 'How SOS works', qa: [
    ['How do I raise an SOS?', 'In the driver app during a trip, hold the SOS button for 2 seconds. It is sent to our safety team at once.'],
    ['I pressed SOS by mistake', 'Tap the “this was a mistake” button on the screen that follows.'],
  ] },
  { key: 'account', title: 'Your account', href: '/driver/profile', link: 'Open your profile', qa: [
    ['How do I change my phone number?', 'In your profile, open Personal details and choose Change next to Mobile. We send a code to the new number.'],
    ['How do I change my vehicle?', 'Open Your vehicle in setup. A change goes for review; you can go online again once it is approved.'],
  ] },
];

type Ticket = { id: number; status: string; issue_type: string; description: string; created_at: string; trip_id: number | null };
const ISSUES: [string, string][] = [['payment', 'Earnings or payouts'], ['account', 'Documents or account'], ['fare_dispute', 'A trip or fare'],
  ['safety', 'Safety'], ['app_bug', 'Something is not working'], ['other', 'Something else']];

/** Write to support: the topic and what happened; the reply comes back here. */
function WriteToUs({ onSent }: { onSent: () => void }) {
  const tr = useTr();
  const [issue, setIssue] = useState('payment');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  async function send() {
    if (text.trim().length < 10) { setNote({ ok: false, text: tr('Tell us what happened in a sentence or two.') }); return; }
    setBusy(true); setNote(null);
    try {
      const t = await areaPost<{ id: number }>('/support/tickets/create/', { issue_type: issue, description: text.trim() });
      setText(''); setNote({ ok: true, text: tr('Sent. Ticket #{n}. We reply here and by notification.').replace('{n}', String(t.id)) }); onSent();
    } catch (e) { setNote({ ok: false, text: messageFor(e, tr('We could not send that. Try again.')) }); } finally { setBusy(false); }
  }
  return (
    <section className="acard ds-topic" data-testid="support-write">
      <h2 className="a20">{tr('Write to driver support')}</h2>
      <label className="a14 ab" htmlFor="ds-issue">{tr('About')}</label>
      <div className="ainput"><select id="ds-issue" value={issue} onChange={(e) => setIssue(e.target.value)}>
        {ISSUES.map(([v, l]) => <option key={v} value={v}>{tr(l)}</option>)}
      </select></div>
      <label className="a14 ab" htmlFor="ds-text">{tr('What happened?')}</label>
      <textarea id="ds-text" className="ainput" rows={4} style={{ height: 'auto', padding: 12 }} value={text} onChange={(e) => setText(e.target.value)} />
      {note && <p className={`a14 ${note.ok ? 'agreen' : 'ared'}`} role={note.ok ? 'status' : 'alert'}>{note.text}</p>}
      <div><button type="button" className="abtn abtn--dark" disabled={busy} onClick={() => void send()}>{tr(busy ? 'Sending…' : 'Send')}</button></div>
    </section>
  );
}

/**
 * /driver/support (11 Nov): inside the driver frame and header, the driver's own topics (earnings
 * and payouts, documents and expiry, the fee plan, trips and fares, safety and SOS, the account),
 * a way to write to support, and the driver's tickets. No rider questions, no "apply to drive".
 */
export function DriverSupport() {
  const tr = useTr();
  const { locale } = useLocale();
  const me = useDriver();
  const tickets = useLoad(async () => {
    const got = await areaGet<{ results?: Ticket[] } | Ticket[]>('/support/tickets/');
    return Array.isArray(got) ? got : got.results ?? [];
  });
  return (
    <>
      <DriverTop title={tr('Support')} me={me} />
      <main className="dr-main" data-testid="driver-support">
        <div className="ds-topics">
          {TOPICS.map((t) => (
            <section key={t.title} className="acard ds-topic" data-topic={t.title}>
              <h2 className="a20">{tr(t.title)}</h2>
              {t.qa.map(([q, a]) => (
                <details key={q}><summary>{tr(q)}</summary><p className="a14 amut">{tr(a)}</p></details>
              ))}
              <Link href={t.href} className="aacc ab a14">{tr(t.link)} →</Link>
            </section>
          ))}
        </div>
        <div className="dr-grid2">
          <WriteToUs onSent={() => (tickets.refresh ?? tickets.retry)()} />
          <section className="acard ds-topic" data-testid="support-tickets">
            <h2 className="a20">{tr('Your tickets')}</h2>
            {tickets.state === 'error' && <LoadError what="account" retry={tickets.retry} />}
            {!tickets.data && tickets.state !== 'error' && <Skel h={18} lines={3} gap={14} />}
            {tickets.data?.length === 0 && <p className="aempty">{tr('No tickets yet.')}</p>}
            {tickets.data?.slice(0, 10).map((t) => (
              <div key={t.id} className="pf-row a14">
                <span className="agrow" style={{ minWidth: 0 }}>
                  <span className="ab">#{t.id}</span>{t.trip_id ? ` · ${tr('Trip #{n}').replace('{n}', String(t.trip_id))}` : ''} · {dateLabel(t.created_at, locale)}
                  <span className="amut" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</span>
                </span>
                <span className="apill apill--neu">{tr(t.status.replace(/_/g, ' '))}</span>
              </div>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}
