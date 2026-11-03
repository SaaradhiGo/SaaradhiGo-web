'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { can, scopeLabel, useAdminAccess, withScope } from '@/lib/adminScope';
import {
  DEFAULT_DRIVER_FILTERS, type DriverActions, documentViewPath, driverName, queueApiPath, waitingLabel,
} from '@/lib/drivers';
import {
  type AuditEntry, type ReviewDoc, REJECT_REASONS, allApproved, docId, docState, expiryCheck, expiryFor,
  firstUndecided, isDecided, isReviewable, kycKeyAction, localToday, looksLikePdf, nextUndecided, nothingLeft,
  otherSide, paceFrom, reasonReady, reuploadReason, shortDuration, sideOf, stepIndex,
} from '@/lib/kycReview';
import { type ApprovalBody, interpretWrite } from '@/lib/trips';
import { type ChipTone, StatusChip } from '@/components/console/kit/StatusChip';
import { Empty, ErrorState, PageHeader, Skeleton } from '@/components/console/ui';

/**
 * KYC review, built for throughput (design board E).
 *
 * One driver at a time from the queue, longest waiting first; the document
 * beside the checks; a decision in one key. The checks list only what the
 * server returns: anything the platform has no source for (face match,
 * police check, the name and number printed on the licence) says "Not
 * connected", never a pass.
 *
 * Each document is fetched only when it is shown, through the audited view
 * endpoint, and the signed link is kept for its short life so stepping back
 * and forth does not log a new opening every time.
 */
type QueueRow = {
  id: number;
  user_details?: { full_name?: string | null } | null;
  vehicle_type?: string | null;
  waiting_seconds?: number | null;
};
type QueuePage = { count: number; results: QueueRow[] };

type Vehicle = {
  id: number; type: string | null; vehicle_number: string | null; is_active_vehicle: boolean;
  insurance_expiry: string | null; permit_expiry: string | null; fitness_expiry: string | null; puc_expiry: string | null;
};
type Detail = {
  id: number; approved: boolean; license_expiry: string | null;
  user: { full_name: string | null };
  vehicles: Vehicle[];
  documents?: ReviewDoc[];
  approval_blockers?: Array<{ code: string; message: string }>;
  actions?: DriverActions;
};

type View =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'broken'; url: string }
  | { status: 'error'; message: string };

type Notice = { text: string; kind: 'done' | 'pending' | 'error' };

const QUEUE_SIZE = 50;
const AUDIT_ACTION = 'driver_document_reviewed';

function message(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.fromServer ? err.message : fallback;
}

export default function KycReviewPage() {
  const access = useAdminAccess();
  const [queue, setQueue] = useState<QueueRow[] | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [done, setDone] = useState(0);
  const handled = useRef<Set<number>>(new Set());

  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [docIndex, setDocIndex] = useState(0);

  const [view, setView] = useState<View>({ status: 'idle' });
  const links = useRef<Map<string, { url: string; until: number }>>(new Map());
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);

  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pace, setPace] = useState<{ drivers: number; medianSeconds: number } | null>(null);
  const reasonBox = useRef<HTMLTextAreaElement>(null);

  const current = queue?.[position] ?? null;
  const docs = useMemo(() => detail?.documents ?? [], [detail]);
  const doc = docs[docIndex] ?? null;

  // -- Queue ---------------------------------------------------------------
  const loadQueue = useCallback(async () => {
    setQueueError(null);
    try {
      const page = await api.get<QueuePage>(withScope(queueApiPath({ ...DEFAULT_DRIVER_FILTERS, tab: 'queue', pageSize: QUEUE_SIZE })));
      const rows = page.results.filter((r) => !handled.current.has(r.id));
      setQueue(rows);
      setQueueCount(Math.max(0, page.count - (page.results.length - rows.length)));
      setPosition(0);
    } catch (err) {
      setQueueError(message(err, 'We could not load the KYC queue.'));
      setQueue([]);
    }
  }, []);
  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const nextDriver = useCallback(() => {
    if (current) handled.current.add(current.id);
    setDone((n) => n + 1);
    setDetail(null);
    setReason('');
    if (queue && position + 1 < queue.length) setPosition(position + 1);
    else void loadQueue();
  }, [current, queue, position, loadQueue]);

  // -- Driver --------------------------------------------------------------
  const fetchDetail = useCallback(async (id: number) => api.get<Detail>(`/driver/admin/${id}/full/`), []);

  useEffect(() => {
    if (!current) return;
    let live = true;
    setDetail(null); setDetailError(null);
    fetchDetail(current.id).then((d) => {
      if (!live) return;
      setDetail(d);
      setDocIndex(Math.max(0, firstUndecided(d.documents ?? [])));
    }).catch((err) => { if (live) setDetailError(message(err, 'We could not load this driver.')); });
    return () => { live = false; };
  }, [current, fetchDetail, attempt]);

  // -- Pace (only for an operator who may read the audit log) ---------------
  const mayAudit = can(access, 'audit.read');
  const myId = access?.id;
  const loadPace = useCallback(async () => {
    if (!mayAudit || myId === undefined || myId === null) { setPace(null); return; }
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const q = new URLSearchParams({
      actor: String(myId), action: AUDIT_ACTION, from: start.toISOString(), page_size: '100', verify: '0',
    });
    try {
      const page = await api.get<{ count: number; results: AuditEntry[] }>(`/admin-audit/admin/entries/?${q.toString()}`);
      // A partial day would give a wrong count: say nothing rather than guess.
      setPace(page.count > page.results.length ? null : paceFrom(page.results));
    } catch {
      setPace(null);
    }
  }, [mayAudit, myId]);
  useEffect(() => { void loadPace(); }, [loadPace]);

  // -- Document viewer -------------------------------------------------------
  const driverId = detail?.id;
  const currentDocId = doc ? docId(doc) : '';
  const docViewable = Boolean(doc?.present && doc?.viewable);
  useEffect(() => {
    setRotation(0); setZoom(1);
    if (!doc || driverId === undefined || !docViewable) { setView({ status: 'idle' }); return; }
    const cached = links.current.get(currentDocId);
    if (cached && cached.until > Date.now()) { setView({ status: 'ready', url: cached.url }); return; }
    let live = true;
    setView({ status: 'loading' });
    api.get<{ url: string; expires_in?: number }>(documentViewPath(driverId, doc)).then((r) => {
      const ttl = Math.max(30, (r.expires_in ?? 300) - 30) * 1000;
      links.current.set(currentDocId, { url: r.url, until: Date.now() + ttl });
      if (live) setView({ status: 'ready', url: r.url });
    }).catch((err) => { if (live) setView({ status: 'error', message: message(err, 'The document could not be opened.') }); });
    return () => { live = false; };
    // The document is identified by its id; the object changes on every reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, currentDocId, docViewable]);

  // -- Decisions -------------------------------------------------------------
  const mayReview = detail?.actions?.review_documents ?? false;
  const mayApprove = detail?.actions?.approve ?? false;
  const blockers = detail?.approval_blockers ?? [];
  const everyApproved = allApproved(docs);
  const offerDriverApproval = everyApproved && mayApprove && !detail?.approved;
  const canDecide = Boolean(doc && mayReview && isReviewable(doc) && !busy);
  // Approving needs eyes on the file: a document that would not open can be
  // rejected (with the reason) but never approved (owner's new-hire run).
  const canApprove = canDecide && view.status === 'ready';

  const decide = useCallback(async (decision: 'approve' | 'reject', sent: string) => {
    if (!detail || !doc) return;
    setBusy(true); setNotice(null);
    try {
      await api.post(`/driver/admin/${detail.id}/documents/review/`, {
        document_key: doc.key, vehicle_id: doc.vehicle_id, decision, reason: decision === 'reject' ? sent : '',
      });
      setReason('');
      setNotice({ text: decision === 'approve' ? `${doc.label} approved.` : `${doc.label} rejected. The driver will see your reason.`, kind: 'done' });
      void loadPace();
      const fresh = await fetchDetail(detail.id);
      const freshDocs = fresh.documents ?? [];
      setDetail(fresh);
      const next = nextUndecided(freshDocs, docIndex);
      if (next !== -1) { setDocIndex(next); return; }
      if (allApproved(freshDocs) && fresh.actions?.approve && !fresh.approved) return;
      if (nothingLeft(freshDocs)) nextDriver();
    } catch (err) {
      setNotice({ text: message(err, 'That did not go through. Nothing was changed.'), kind: 'error' });
    } finally {
      setBusy(false);
    }
  }, [detail, doc, docIndex, fetchDetail, loadPace, nextDriver]);

  const approveDriver = useCallback(async () => {
    if (!detail) return;
    setBusy(true); setNotice(null);
    const name = driverName(detail.user, detail.id);
    try {
      const body = await api.post<ApprovalBody>(`/driver/admin/${detail.id}/approve/`, { note: '' });
      const outcome = interpretWrite(body, `${name} is approved and can go online.`);
      setNotice({ text: outcome.message, kind: outcome.kind });
      nextDriver();
    } catch (err) {
      setNotice({ text: message(err, 'That did not go through. Nothing was changed.'), kind: 'error' });
    } finally {
      setBusy(false);
    }
  }, [detail, nextDriver]);

  const askReason = useCallback(() => {
    setNotice({ text: 'Pick or write a reason the driver will see first.', kind: 'error' });
    reasonBox.current?.focus();
  }, []);

  const onApprove = useCallback(() => {
    if (busy) return;
    if (offerDriverApproval && blockers.length === 0) { void approveDriver(); return; }
    if (canApprove && doc?.review_state !== 'approved') void decide('approve', '');
  }, [busy, offerDriverApproval, blockers.length, approveDriver, canApprove, doc, decide]);
  const onReject = useCallback(() => {
    if (!canDecide) return;
    if (!reasonReady(reason)) { askReason(); return; }
    void decide('reject', reason.trim());
  }, [canDecide, reason, askReason, decide]);
  const onReupload = useCallback(() => {
    if (!canDecide) return;
    if (!reasonReady(reason)) { askReason(); return; }
    void decide('reject', reuploadReason(reason));
  }, [canDecide, reason, askReason, decide]);
  const step = useCallback((delta: 1 | -1) => {
    setDocIndex((i) => Math.max(0, stepIndex(docs.length, i, delta)));
  }, [docs.length]);

  const keys = useRef({ onApprove, onReject, onReupload, step });
  keys.current = { onApprove, onReject, onReupload, step };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const act = kycKeyAction({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: e.target as HTMLElement | null });
      if (!act || e.repeat) return;
      e.preventDefault();
      const k = keys.current;
      if (act === 'approve') k.onApprove();
      else if (act === 'reject') k.onReject();
      else if (act === 'reupload') k.onReupload();
      else k.step(act === 'next' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // -- Render ----------------------------------------------------------------
  const place = scopeLabel(access) || 'All places';
  const oldest = queue && queue.length > 0 ? queue[0].waiting_seconds : null;
  const remaining = Math.max(queueCount, queue?.length ?? 0) - position;
  const total = done + remaining;
  const header = (
    <PageHeader
      title={`KYC queue · ${place}`}
      subtitle={queue && queue.length > 0
        ? `Driver ${done + 1} of ${total} · oldest waiting ${waitingLabel(oldest)}`
        : undefined}
      actions={pace ? (
        <span className="ops-kyc__pace">You today: {pace.drivers} driver{pace.drivers === 1 ? '' : 's'} · median {shortDuration(pace.medianSeconds)} between reviews</span>
      ) : undefined}
    />
  );

  if (queue === null) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Loading the KYC queue</span>
        {header}
        <div className="ops-kyc"><Skeleton kind="block" /><Skeleton kind="block" /></div>
      </div>
    );
  }
  if (queueError) {
    return <>{header}<ErrorState title="The KYC queue could not be loaded" detail={queueError} onRetry={() => void loadQueue()} /></>;
  }
  if (!current) {
    return (
      <>
        {header}
        {notice ? <NoticeBar notice={notice} /> : null}
        <Empty title="Nobody is waiting for review" detail={done > 0 ? `You reviewed ${done} driver${done === 1 ? '' : 's'} in this session.` : 'New uploads appear here, longest waiting first.'} />
      </>
    );
  }
  if (detailError) {
    return (
      <>
        {header}
        <ErrorState title="This driver could not be loaded" detail={detailError} onRetry={() => setAttempt((n) => n + 1)} />
        <div className="ops-kyc__decide-row"><button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={nextDriver}>Skip to next driver</button></div>
      </>
    );
  }
  if (!detail) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Loading the driver</span>
        {header}
        <div className="ops-kyc"><Skeleton kind="block" /><Skeleton kind="block" /></div>
      </div>
    );
  }

  const name = driverName(detail.user, detail.id);
  const active = detail.vehicles.find((v) => v.is_active_vehicle) ?? detail.vehicles[0] ?? null;
  const vehicleClass = active?.type ?? current.vehicle_type ?? null;
  const multiVehicle = detail.vehicles.length > 1;
  const plateOf = (id: number | null) => {
    const v = detail.vehicles.find((x) => x.id === id);
    return v?.vehicle_number || (id ? `#${id}` : '');
  };
  const chipLabel = (d: ReviewDoc) => (d.owner === 'vehicle' && multiVehicle ? `${d.label} · ${plateOf(d.vehicle_id)}` : d.label);
  const nextIdx = doc ? nextUndecided(docs, docIndex) : -1;
  const nextLabel = nextIdx !== -1 && nextIdx !== docIndex ? chipLabel(docs[nextIdx]) : null;
  const sibling = otherSide(docs, docIndex);
  const side = doc ? sideOf(doc) : null;
  const today = localToday();
  const docLabel = doc ? chipLabel(doc) : '';

  return (
    <>
      {header}
      {notice ? <NoticeBar notice={notice} /> : null}

      <div className="ops-kyc__chips" role="group" aria-label="Documents for this driver">
        <span className="ops-kyc__who">
          <Link href={`/drivers/${detail.id}`}>D-{detail.id}</Link> · {name} · {vehicleClass ?? 'No vehicle class'}
        </span>
        {docs.map((d, i) => {
          const [word, tone] = docState(d);
          return (
            <button
              key={docId(d)} type="button"
              className={`ops-kyc__chip${i === docIndex ? ' is-current' : ''}`}
              aria-current={i === docIndex ? 'true' : undefined}
              onClick={() => setDocIndex(i)}
            >
              <span>{chipLabel(d)}</span>
              <StatusChip tone={tone}>{word}</StatusChip>
            </button>
          );
        })}
      </div>

      {docs.length === 0 ? (
        <Empty title="No documents are required for this driver" detail="Open the driver's record to check their details." />
      ) : (
        <div className="ops-kyc">
          <section className="ops-kyc__viewer" aria-label={`Document: ${docLabel}`}>
            <div className="ops-kyc__tools">
              <b className="ops-kyc__title">{docLabel}</b>
              {side && sibling !== -1 ? (
                <span className="ops-kyc__toggle" role="group" aria-label="Side">
                  <button type="button" aria-pressed={side === 'front'} onClick={() => side !== 'front' && setDocIndex(sibling)}>Front</button>
                  <button type="button" aria-pressed={side === 'back'} onClick={() => side !== 'back' && setDocIndex(sibling)}>Back</button>
                </span>
              ) : null}
              <span className="ops-kyc__spacer" />
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setRotation((r) => (r + 270) % 360)} disabled={view.status !== 'ready'}>Rotate left</button>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setRotation((r) => (r + 90) % 360)} disabled={view.status !== 'ready'}>Rotate right</button>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))} disabled={view.status !== 'ready' || zoom <= 0.5}>Zoom out</button>
              <span className="ops-kyc__zoom" aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={() => setZoom((z) => Math.min(3, +(z + 0.25).toFixed(2)))} disabled={view.status !== 'ready' || zoom >= 3}>Zoom in</button>
            </div>
            <div className="ops-kyc__stage">
              <DocumentStage
                doc={doc} view={view} label={docLabel} rotation={rotation} zoom={zoom}
                onBroken={(url) => setView({ status: 'broken', url })}
              />
            </div>
            <p className="ops-kyc__meta">
              {current.waiting_seconds !== null && current.waiting_seconds !== undefined ? `Sent for review ${waitingLabel(current.waiting_seconds)} ago · ` : ''}
              Opening is logged
            </p>
          </section>

          <aside className="ops-kyc__side">
            <section className="ops-kyc__panel" aria-labelledby="kyc-checks">
              <h2 id="kyc-checks">Checks</h2>
              <ul className="ops-kyc__checks">
                <Check label="Name on profile" value={detail.user.full_name || 'Not given'} />
                <Check label="Name on document" value="Not read automatically" chip={['Not connected', 'neutral']} />
                {doc?.owner === 'driver' && doc.key.startsWith('license') ? (
                  <Check label="Licence number" value="Not sent to the console" chip={['Not connected', 'neutral']} />
                ) : null}
                {doc ? <ExpiryRow iso={expiryFor(doc, detail.license_expiry, detail.vehicles)} today={today} /> : null}
                <Check
                  label="Vehicle class"
                  value={vehicleClass ? `${vehicleClass}${active?.vehicle_number ? ` · ${active.vehicle_number}` : ''}` : 'No vehicle on file'}
                />
                {doc?.review && !doc.review.current ? (
                  <Check label="Earlier decision" value={`${doc.review.state === 'rejected' ? 'Rejected' : 'Approved'} an older file${doc.review.reason ? `: ${doc.review.reason}` : ''}`} />
                ) : null}
                {doc?.review?.current && doc.review.state === 'rejected' ? (
                  <Check label="Driver was told" value={doc.review.reason} />
                ) : null}
                <Check label="Face match" value="No face check on this platform" chip={['Not connected', 'neutral']} />
                <Check label="Police check" value="No police check on this platform" chip={['Not connected', 'neutral']} />
              </ul>
            </section>

            {mayReview ? (
              <section className="ops-kyc__panel" aria-labelledby="kyc-reason">
                <h2 id="kyc-reason">If you reject, pick a reason the driver will see</h2>
                <div className="ops-kyc__reasons" role="group" aria-label="Reasons">
                  {REJECT_REASONS.map(([chip, text]) => (
                    <button key={chip} type="button" className="ops-kyc__reason" aria-pressed={reason === text} onClick={() => setReason(text)}>{chip}</button>
                  ))}
                </div>
                <label className="ops-form__label" htmlFor="kyc-reason-text">Reason the driver reads</label>
                <textarea
                  id="kyc-reason-text" ref={reasonBox} className="input" rows={3} value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Or write your own"
                />
              </section>
            ) : null}

            <section className="ops-kyc__panel" aria-labelledby="kyc-decide">
              <h2 id="kyc-decide">Decision</h2>
              {offerDriverApproval ? (
                <>
                  <p className="ops-kyc__hint">Every document is approved.</p>
                  {blockers.length > 0 ? (
                    <div className="ops-decide__why">
                      <strong className="block">Approval is refused until:</strong>
                      <ul>{blockers.map((b) => <li key={`${b.code}-${b.message}`}>{b.message}</li>)}</ul>
                    </div>
                  ) : null}
                  <button type="button" className="sg-btn sg-btn--primary ops-kyc__primary" onClick={() => void approveDriver()} disabled={busy || blockers.length > 0}>
                    {busy ? 'Working…' : `Approve driver · A`}
                  </button>
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={nextDriver} disabled={busy}>Next driver</button>
                </>
              ) : !mayReview ? (
                <>
                  <p className="ops-kyc__hint">You can look at these documents but not decide them.</p>
                  <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={nextDriver}>Next driver</button>
                </>
              ) : (
                <>
                  <button
                    type="button" className="sg-btn sg-btn--primary ops-kyc__primary" onClick={onApprove}
                    disabled={!canApprove || doc?.review_state === 'approved'}
                  >
                    {busy ? 'Working…' : `Approve ${docLabel} · A`}
                  </button>
                  <div className="ops-kyc__decide-row">
                    <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={onReject} disabled={!canDecide}>Reject · R</button>
                    <button type="button" className="sg-btn sg-btn--secondary sg-btn--sm" onClick={onReupload} disabled={!canDecide}>Ask to re-upload · U</button>
                  </div>
                  {doc && !isReviewable(doc) ? <p className="ops-kyc__hint">There is no file to decide on yet.</p> : null}
                  {doc && isReviewable(doc) && view.status === 'error' ? <p className="ops-kyc__hint">The file did not open, so it cannot be approved. Reject it or ask for a new upload.</p> : null}
                  {doc && isDecided(doc) ? <p className="ops-kyc__hint">Already decided. You can change the decision.</p> : null}
                  <button type="button" className="sg-btn sg-btn--ghost sg-btn--sm" onClick={nextDriver} disabled={busy}>Skip to next driver</button>
                </>
              )}
              <p className="ops-kyc__hint"><kbd>J</kbd> / <kbd>K</kbd> next and previous document</p>
              {mayReview && !offerDriverApproval ? (
                <p className="ops-kyc__hint">{nextLabel ? `Approving moves to ${nextLabel}` : blockers.length ? `Still needed before this driver can drive: ${blockers.length} more` : 'Approving finishes this driver'}</p>
              ) : null}
            </section>
          </aside>
        </div>
      )}
    </>
  );
}

function NoticeBar({ notice }: { notice: Notice }) {
  if (notice.kind === 'error') return <div className="alert-error mb-5" role="alert">{notice.text}</div>;
  return <div className={notice.kind === 'pending' ? 'ops-confirm mb-5' : 'alert-success mb-5'} role="status"><b>{notice.text}</b></div>;
}

function Check({ label, value, chip }: { label: string; value: string; chip?: [string, ChipTone] }) {
  return (
    <li>
      <span className="ops-kyc__check-label">{label}</span>
      <span className="ops-kyc__check-value">{value}</span>
      {chip ? <StatusChip tone={chip[1]}>{chip[0]}</StatusChip> : <span />}
    </li>
  );
}

function ExpiryRow({ iso, today }: { iso: string | null | undefined; today: string }) {
  if (iso === undefined) return null;
  const check = expiryCheck(iso, today);
  if (check.state === 'none') return <Check label="Expiry date" value="Not on record" chip={['Not set', 'caution']} />;
  if (check.state === 'expired') {
    return <Check label="Expiry date" value={`${(iso ?? "").slice(0, 10)} · ${check.days} day${check.days === 1 ? '' : 's'} ago`} chip={['Expired', 'critical']} />;
  }
  return <Check label="Expiry date" value={`${(iso ?? "").slice(0, 10)} · ${check.days} day${check.days === 1 ? '' : 's'} left`} chip={['Valid', 'good']} />;
}

function DocumentStage({ doc, view, label, rotation, zoom, onBroken }: {
  doc: ReviewDoc | null; view: View; label: string; rotation: number; zoom: number; onBroken: (url: string) => void;
}) {
  if (!doc) return <p className="ops-kyc__placeholder">Pick a document above.</p>;
  if (!doc.recordable) return <p className="ops-kyc__placeholder">This document is required but cannot be stored yet, so there is nothing to look at.</p>;
  if (!doc.present) return <p className="ops-kyc__placeholder">The driver has not uploaded this document yet.</p>;
  if (doc.url_withheld || !doc.viewable) return <p className="ops-kyc__placeholder">You need permission to see personal documents in this city to open it.</p>;
  if (view.status === 'loading' || view.status === 'idle') return <p className="ops-kyc__placeholder" aria-busy="true">Opening the document…</p>;
  if (view.status === 'error') return <p className="ops-kyc__placeholder" role="alert">{view.message}</p>;
  if (view.status === 'broken') {
    return (
      <p className="ops-kyc__placeholder">
        This file cannot be shown here. <a href={view.url} target="_blank" rel="noopener noreferrer">Open it in a new tab</a>
      </p>
    );
  }
  const style = { transform: `rotate(${rotation}deg) scale(${zoom})` };
  if (looksLikePdf(view.url)) {
    return <iframe className="ops-kyc__file" title={label} src={view.url} style={style} />;
  }
  // A signed, five-minute link from storage: next/image cannot optimise it.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="ops-kyc__file" src={view.url} alt={label} style={style} onError={() => onBroken(view.url)} />;
}
