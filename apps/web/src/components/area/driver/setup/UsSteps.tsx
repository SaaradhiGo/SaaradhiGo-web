'use client';

import { useEffect, useState } from 'react';
import { useTr } from '@/i18n/website';
import { areaGet, areaPost } from '@/lib/area/api';

type Disclosure = { title: string; version: string; paragraphs: string[] };
type BgState = { disclosure: Disclosure; disclosure_read: boolean; authorised: boolean; status: string;
  accessibility_acknowledged: boolean };

/**
 * The background check consent (14 Nov, USA; FCRA 15 U.S.C. 1681b(b)(2)): the disclosure on its own
 * page first, then a separate authorisation. The SSN is entered only in the provider's own form.
 */
export function BackgroundConsent({ reload }: { reload: () => void }) {
  const tr = useTr();
  const [st, setSt] = useState<BgState | null>(null);
  const [reading, setReading] = useState(false);
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [formUrl, setFormUrl] = useState<string | null>(null);
  useEffect(() => { areaGet<BgState>('/driver/background/disclosure/').then(setSt).catch(() => setSt(null)); }, []);
  if (!st) return null;
  async function read() {
    const next = await areaPost<BgState>('/driver/background/disclosure/', {});
    setSt(next);
    setReading(false);
  }
  async function authorise() {
    setErr(null);
    try {
      const r = await areaPost<BgState & { form_url: string }>('/driver/background/authorise/', { authorise: true });
      setSt({ ...st!, ...r });
      if (r.form_url) setFormUrl(r.form_url);
      reload();
    } catch (e) {
      setErr((e as { message?: string })?.message || tr('We could not start the check. Try again.'));
    }
  }
  if (reading) {
    // On its own page: nothing but the disclosure (the FCRA's stand-alone document).
    return (
      <section className="acard acol" style={{ padding: 20, gap: 12 }} data-testid="fcra-disclosure" aria-labelledby="fcra-title">
        <h2 className="a20" id="fcra-title">{st.disclosure.title}</h2>
        {st.disclosure.paragraphs.map((p) => <p key={p.slice(0, 24)}>{p}</p>)}
        <button type="button" className="abtn abtn--pri" onClick={read} data-testid="fcra-read">{tr('I have read the disclosure')}</button>
      </section>
    );
  }
  return (
    <div className="acol" style={{ gap: 10 }} data-testid="background-consent">
      {!st.disclosure_read ? (
        <>
          <p className="a14 amut">{tr('Before we can check your background, read the disclosure about the report we will get.')}</p>
          <button type="button" className="abtn abtn--ghost" onClick={() => setReading(true)} data-testid="fcra-open">
            {tr('Read the background check disclosure')}
          </button>
        </>
      ) : !st.authorised ? (
        <>
          <label className="s-consent__check" style={{ color: 'inherit' }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="fcra-agree" />
            <span>{tr('I authorise DeepTrics LLC and its background check provider to get consumer reports about me, now and while I drive, as described in the disclosure.')}</span>
          </label>
          <button type="button" className="abtn abtn--pri" disabled={!agree} onClick={authorise} data-testid="fcra-authorise">
            {tr('Authorise the background check')}
          </button>
        </>
      ) : (
        <p className="a14 agrn" role="status">{tr('Authorised. Your check is with our provider.')}</p>
      )}
      {formUrl && (
        <a className="abtn abtn--dark" href={formUrl} target="_blank" rel="noreferrer">
          {tr("Continue in the provider's secure form")}
        </a>
      )}
      <p className="a14 amut">{tr('SaaradhiGo never stores your Social Security number. You enter it only in the provider\'s secure form.')}</p>
      {err && <p className="a14 ared" role="alert">{err}</p>}
    </div>
  );
}

/** Non-discrimination and accessibility (14 Nov; Idaho 49-3713): the driver's acknowledgement. */
export function AccessibilityAck({ done, reload }: { done: boolean; reload: () => void }) {
  const tr = useTr();
  const [agree, setAgree] = useState(done);
  const [saved, setSaved] = useState(done);
  async function save(v: boolean) {
    setAgree(v);
    if (!v || saved) return;
    await areaPost('/driver/accessibility/acknowledge/', { acknowledge: true });
    setSaved(true);
    reload();
  }
  return (
    <label className="s-consent__check" style={{ color: 'inherit' }} data-testid="accessibility-ack">
      <input type="checkbox" checked={agree} disabled={saved} onChange={(e) => void save(e.target.checked)} />
      <span>
        {tr('I will serve every rider without discrimination, carry service animals, and help riders with disabilities, including stowing a folding wheelchair.')}{' '}
        <a href="/accessibility" target="_blank" rel="noreferrer">{tr('Read the policy')}</a>
      </span>
    </label>
  );
}
