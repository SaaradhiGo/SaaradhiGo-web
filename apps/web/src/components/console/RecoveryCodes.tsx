'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Check, Copy, Download } from '@/components/console/icons';

/**
 * The recovery codes, shown ONCE.
 *
 * The server returns a fresh set in exactly one response -- the sign-in
 * that mints the first token after the authenticator is confirmed, or a
 * regeneration -- and never again. So this screen is the only time the
 * operator will see them, and it is built around that: the codes are in
 * component state and nowhere else (no storage, no URL, no request), they
 * can be copied or saved as a text file made in the browser from a Blob,
 * and the way out is a confirmation that they have been kept. `onDone`
 * is the caller's cue to drop the codes from its own state too.
 *
 * `confirmLabel` is what the operator is continuing TO ("Continue to the
 * console", "Back to Security"), because the one thing this screen must
 * not do is leave them guessing whether pressing the button loses the list.
 */
export function RecoveryCodesScreen({
  codes,
  notice,
  heading = 'Save your recovery codes',
  confirmLabel = 'Continue',
  onDone,
}: {
  codes: string[];
  notice?: string | null;
  heading?: string;
  confirmLabel?: string;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const checkId = useId();
  const listId = useId();

  // The screen appears in place of a form that had focus. Focus moves to
  // its heading so a screen-reader user hears what just happened rather
  // than landing on a checkbox with no context.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 4000);
    return () => clearTimeout(t);
  }, [copied]);

  const text = codes.join('\n');

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
  }

  function download() {
    // Made here, from the list in memory. Nothing is sent anywhere.
    const blob = new Blob(
      [`SaaradhiGo Admin recovery codes\nEach code signs you in once if you lose your authenticator.\n\n${text}\n`],
      { type: 'text/plain' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'saaradhigo-admin-recovery-codes.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function finish() {
    if (!saved) {
      setError('Tick the box once the codes are saved. They will not be shown again.');
      return;
    }
    setError(null);
    onDone();
  }

  return (
    <div className="rc" data-testid="recovery-codes-screen">
      <h3 ref={headingRef} tabIndex={-1} className="rc__heading">{heading}</h3>
      <p className="rc__notice">
        {notice || 'Each one signs you in once if you lose your authenticator. They will not be shown again.'}
      </p>

      <ol className="rc__list" id={listId} aria-label="Recovery codes">
        {codes.map((code) => (
          <li key={code}><code>{code}</code></li>
        ))}
      </ol>

      <div className="rc__actions">
        <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={() => void copyAll()}>
          <Copy /> Copy all
        </button>
        <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={download}>
          <Download /> Download .txt
        </button>
      </div>
      {/* Announced, not just shown: a copy button with no feedback is a
          button the operator presses three times. */}
      <p className="rc__feedback" role="status" aria-live="polite">
        {copied === 'done' ? <><Check /> Copied {codes.length} codes to the clipboard.</> : null}
        {copied === 'failed' ? 'Copying is blocked here. Select the list or download the file instead.' : null}
      </p>

      {error && (
        <div className="login__alert" role="alert">
          <Alert />
          <span>{error}</span>
        </div>
      )}

      <label className="rc__confirm" htmlFor={checkId}>
        <input
          id={checkId}
          type="checkbox"
          checked={saved}
          onChange={(e) => { setSaved(e.target.checked); if (e.target.checked) setError(null); }}
          aria-describedby={listId}
        />
        <span>I have saved these codes somewhere safe</span>
      </label>

      <button type="button" className="sg-btn sg-btn--primary login__submit" onClick={finish}>
        {confirmLabel}
      </button>
    </div>
  );
}
