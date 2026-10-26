'use client';

import { useState } from 'react';
import { Pill } from '@/components/console/ui';

/**
 * The decision panel, and the documents it is made from.
 *
 * WHAT THIS REPLACES
 * "Approve KYC" was a text link in the top-right corner, the size of a
 * breadcrumb, beside a field reading "License doc —". An operator was
 * asked to decide whether somebody may carry paying passengers while
 * looking at four em-dashes, and a rejection reason was collected with
 * `window.prompt()`.
 *
 * Approval is the most consequential action in this product. It gets a
 * panel, the evidence beside it, and a reason the driver will actually
 * read.
 *
 * THE CHECKLIST IS THE SERVER'S. It comes from `compliance.evaluate_*`,
 * the same functions that build the driver's own screen, so the operator
 * and the driver cannot be looking at different lists.
 */
export type ReviewDocument = {
  key: string;
  label: string;
  description?: string;
  present: boolean;
  recordable: boolean;
  /** Short-lived signed link, when there is a document to open. */
  url?: string | null;
};

export function DocumentList({ documents }: { documents: ReviewDocument[] }) {
  if (documents.length === 0) {
    return <p className="text-ink-subtle text-sm m-0">Nothing required here.</p>;
  }
  return (
    <div>
      {documents.map((doc) => (
        <div className="ops-doc" key={doc.key}>
          <span
            className={`ops-doc__tick ${doc.present ? 'is-on' : 'is-off'}`}
            aria-hidden="true"
          >
            {doc.present ? '✓' : '!'}
          </span>
          <span className="ops-doc__text">
            <b>{doc.label}</b>
            <span>
              {!doc.recordable
                ? 'Required, but we have nowhere to store it — cannot be satisfied'
                : doc.present
                  ? doc.description || 'On file'
                  : 'Not uploaded'}
            </span>
          </span>
          {doc.present && doc.url ? (
            // Opened in a new tab deliberately: an operator comparing a
            // licence against the name on screen should not lose the page
            // they are reviewing.
            <a
              className="ops-doc__open"
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open
            </a>
          ) : (
            <span className="ops-doc__missing">
              {doc.present ? 'No link' : 'Missing'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function DecisionPanel({
  approved,
  docStatus,
  rejectionReason,
  missing,
  busy,
  onApprove,
  onReject,
}: {
  approved: boolean;
  docStatus?: string | null;
  rejectionReason?: string | null;
  missing: string[];
  busy: boolean;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');

  const blocked = missing.length > 0;

  return (
    <div className="ops-decide">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2>Decision</h2>
        <Pill tone={approved ? 'good' : docStatus === 'rejected' ? 'bad' : 'wait'}>
          {approved ? 'Approved' : docStatus === 'rejected' ? 'Rejected' : 'Awaiting review'}
        </Pill>
      </div>

      {docStatus === 'rejected' && rejectionReason ? (
        <p className="ops-decide__why">
          <strong className="block text-ink">Last rejected for:</strong>
          {rejectionReason}
        </p>
      ) : null}

      {/* The server refuses approval without these. Saying so here means an
          operator is not left to interpret a validation error after the
          fact. */}
      {blocked ? (
        <p className="ops-decide__why">
          <strong className="block" style={{ color: 'var(--danger)' }}>
            {missing.length} document{missing.length === 1 ? '' : 's'} outstanding.
          </strong>
          Approval is refused by the server until these are on file. Reject
          with a reason so the driver knows what to send.
        </p>
      ) : (
        <p className="ops-decide__why">
          Everything this driver&rsquo;s country requires is on file. Open each
          document above before approving.
        </p>
      )}

      {rejecting ? (
        <div className="ops-decide__actions">
          <label className="form-label" htmlFor="reject-reason">
            What does the driver need to change?
          </label>
          <textarea
            id="reject-reason"
            className="input"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="The licence photo is cut off at the bottom — please re-upload the whole document."
          />
          <p className="help m-0">
            This is shown to the driver on their documents screen. Write it
            for them, not for us.
          </p>
          <button
            className="btn-primary"
            disabled={busy || reason.trim().length < 5}
            onClick={() => onReject(reason.trim())}
          >
            {busy ? 'Sending…' : 'Send back to the driver'}
          </button>
          <button
            className="btn-ghost"
            onClick={() => { setRejecting(false); setReason(''); }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="ops-decide__actions">
          <button
            className="btn-primary"
            disabled={busy || blocked || approved}
            onClick={onApprove}
            title={blocked ? 'Documents are outstanding' : undefined}
          >
            {approved ? 'Already approved' : busy ? 'Working…' : 'Approve to drive'}
          </button>
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => setRejecting(true)}
          >
            {approved ? 'Revoke approval' : 'Send back with a reason'}
          </button>
        </div>
      )}
    </div>
  );
}
