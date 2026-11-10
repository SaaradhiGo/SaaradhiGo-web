'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useTr } from '@/i18n/website';
import { messageFor } from '@/lib/publicAuth';
import { DOCUMENT_ACCEPT, uploadDriverDocument, uploadVehicleDocument } from '@/lib/uploads';
import {
  type Doc, type Onboarding, type Profile, type Vehicle, daysUntil, onboarding as loadDocs, vehicles as loadVehicles,
} from '@/lib/area/driver';
import { useLoad } from '@/lib/area/useLoad';
import { IDoc, IHelp } from '../icons';
import { LoadError, Skel } from '../states';
import { DriverTop, useDriver } from './parts';

export type DocRow = {
  key: string; label: string; status: string; reason: string | null; expiresIn: number | null;
  present?: boolean; kind?: string | null; target?: 'driver' | 'vehicle'; recordable?: boolean;
};

/** The expiry date the server keeps for a document, if any. */
function expiryFor(key: string, me: Profile | null, car: Vehicle | null): string | null | undefined {
  const k = key.toLowerCase();
  if (k.includes('insurance')) return car?.insurance_expiry ?? me?.active_vehicle_details?.insurance_expiry;
  if (k.includes('permit')) return car?.permit_expiry ?? me?.active_vehicle_details?.permit_expiry;
  if (k.includes('fitness')) return car?.fitness_expiry;
  if (k.includes('puc') || k.includes('pollution')) return car?.puc_expiry;
  if (k.includes('licen')) return me?.license_expiry;
  return null;
}

/** Every required document with its review state and days to expiry. */
export function docRows(o: Onboarding | null, me: Profile | null, car: Vehicle | null): DocRow[] {
  if (!o) return [];
  const all: Doc[] = [...(o.driver_documents ?? []), ...(o.vehicle_documents ?? [])].filter((d) => d.required);
  return all.map((d) => ({
    key: d.key,
    label: d.label,
    status: d.status ?? (d.present ? 'in_review' : 'missing'),
    reason: d.reason ?? null,
    expiresIn: daysUntil(expiryFor(d.key, me, car)),
    present: d.present, kind: d.upload_kind ?? null, target: d.target, recordable: d.recordable !== false,
  }));
}

function Pill({ row }: { row: DocRow }) {
  const tr = useTr();
  if (row.expiresIn !== null && row.expiresIn <= 30) {
    return (
      <span className="apill apill--warn">
        {row.expiresIn < 0 ? tr('Expired') : tr('Expires in {n} days').replace('{n}', `${row.expiresIn}`)}
      </span>
    );
  }
  const map: Record<string, [string, string]> = {
    approved: ['apill--ok', 'Approved'], rejected: ['apill--err', 'Rejected'],
    in_review: ['apill--warn', 'In review'], missing: ['apill--neu', 'Missing'],
  };
  const [cls, label] = map[row.status] ?? ['apill--neu', row.status];
  return <span className={`apill ${cls}`}>{tr(label)}</span>;
}

/**
 * Upload or replace one document from the web (10 Nov), through the same upload the phone uses;
 * it goes to the reviewer queue and the list is read again.
 */
export function UploadButton({ row, vehicleId, onDone, dark }: { row: DocRow; vehicleId: number | null; onDone: () => void; dark?: boolean }) {
  const tr = useTr();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!row.kind || row.recordable === false) return null;
  const needsCar = row.target === 'vehicle' && !vehicleId;

  async function pick(file: File) {
    setBusy(true); setErr(null);
    try {
      if (row.target === 'vehicle' && vehicleId) await uploadVehicleDocument(vehicleId, row.kind!, file);
      else await uploadDriverDocument(row.kind!, file);
      onDone();
    } catch (e) {
      setErr(messageFor(e, tr('We could not upload that. Try again.')));
    } finally { setBusy(false); }
  }

  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <input ref={input} type="file" accept={DOCUMENT_ACCEPT} className="sr-only" aria-label={tr(row.label)}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f); }} />
      {needsCar ? <Link href="/driver/profile" className="a14">{tr('Add your vehicle first')}</Link> : (
        <button type="button" className={`abtn ${dark ? 'abtn--dark' : 'abtn--ghost a14'}`} style={dark ? undefined : { height: 36, padding: '0 14px' }}
          disabled={busy} data-testid={`upload-${row.key}`} onClick={() => input.current?.click()}>
          {busy ? tr('Uploading…') : tr(row.present ? 'Replace' : 'Upload')}
        </button>
      )}
      {err && <span className="a14 ared" role="alert">{err}</span>}
    </span>
  );
}

/** The documents as rows: icon, name, a note when action is needed, status, and Upload or Replace. */
export function DocList({ rows, action }: { rows: DocRow[]; action?: (r: DocRow) => React.ReactNode }) {
  const tr = useTr();
  if (!rows.length) return <p className="aempty">{tr('No documents are needed yet.')}</p>;
  return (
    <div style={{ marginTop: 8 }}>
      {rows.map((r) => (
        <div key={r.key} className="arow" style={{ padding: '12px 0', borderTop: '1px solid var(--c-border)' }}>
          <span className="aico"><IDoc /></span>
          <div className="agrow">
            <div className="ab">{tr(r.label)}</div>
            {r.expiresIn !== null && r.expiresIn <= 30 && <div className="a14 ared">{tr('Renewal needed')}</div>}
            {r.status === 'rejected' && r.reason && <div className="a14 ared">{r.reason}</div>}
          </div>
          <Pill row={r} />
          {action?.(r)}
        </div>
      ))}
    </div>
  );
}

/**
 * /driver/documents (driver-web-documents.html): how many are approved, the
 * document that needs renewing first, and the rest with their states.
 */
export function DriverDocuments() {
  const tr = useTr();
  const me = useDriver();
  const docs = useLoad(loadDocs);
  const car = useLoad(async () => (await loadVehicles())[0] ?? null);
  const rows = docRows(docs.data, me, car.data);
  const approved = rows.filter((r) => r.status === 'approved').length;
  const urgent = rows.filter((r) => (r.expiresIn !== null && r.expiresIn <= 30) || r.status === 'rejected' || r.status === 'missing');
  const rest = rows.filter((r) => !urgent.includes(r));
  const vehicleId = docs.data?.vehicle?.id ?? car.data?.id ?? null;
  const again = () => { docs.retry(); car.retry(); };

  return (
    <>
      <DriverTop title={tr('Documents')} me={me} />
      <main className="dr-main">
        <section className="acard" style={{ padding: 20 }}>
          <div className="arow" style={{ flexWrap: 'wrap' }}>
            <div className="agrow">
              <h2 className="a20">{rows.length ? tr('{a} of {n} approved').replace('{a}', `${approved}`).replace('{n}', `${rows.length}`) : tr('Documents')}</h2>
              <div className="a14 amut">{tr('We remind you before any document expires.')}</div>
            </div>
            <Link href="/driver/support" className="abtn abtn--ghost"><IHelp size={18} />{tr('Contact driver support')}</Link>
          </div>
          {docs.state === 'error' && <LoadError what="documents" retry={docs.retry} />}
          {docs.state === 'loading' && <Skel h={10} style={{ marginTop: 16 }} />}
          {docs.state === 'ok' && rows.length === 0 && <p className="aempty">{tr('No documents are needed yet.')}</p>}
          {rows.length > 0 && (
            <div style={{ marginTop: 16, height: 10, borderRadius: 5, background: 'var(--c-muted)' }}>
              <div style={{ width: `${(approved / rows.length) * 100}%`, height: 10, borderRadius: 5, background: 'var(--c-green)' }} />
            </div>
          )}
        </section>
        {urgent.map((r) => (
          <section key={r.key} className="acard arow" style={{ padding: 20, borderColor: 'var(--c-warn-border)', borderWidth: 2, flexWrap: 'wrap' }}>
            <span className="aico" style={{ width: 56, height: 56, background: 'var(--c-warn-bg)', color: 'var(--c-warn-ink)' }}><IDoc /></span>
            <div className="agrow">
              <div className="arow" style={{ gap: 10, flexWrap: 'wrap' }}><h2 className="a20">{tr(r.label)}</h2><Pill row={r} /></div>
              <div className="amut">
                {r.status === 'rejected' && r.reason ? r.reason
                  : r.status === 'missing' ? tr('Upload this document. Our team reviews it, usually the same day.')
                    : tr('Upload the renewed document. Our team reviews it, usually the same day. Until it expires you can keep driving.')}
              </div>
            </div>
            <UploadButton row={r} vehicleId={vehicleId} onDone={again} dark />
          </section>
        ))}
        {rest.length > 0 && <section className="acard" style={{ padding: '8px 20px' }}><DocList rows={rest} action={(r) => <UploadButton row={r} vehicleId={vehicleId} onDone={again} />} /></section>}
      </main>
    </>
  );
}
