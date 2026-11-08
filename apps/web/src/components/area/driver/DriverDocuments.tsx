'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTr } from '@/i18n/website';
import {
  type Doc, type Onboarding, type Profile, type Vehicle, daysUntil, onboarding as loadDocs, vehicles as loadVehicles,
} from '@/lib/area/driver';
import { IDoc, IHelp } from '../icons';
import { DriverTop, useDriver } from './parts';

export type DocRow = { key: string; label: string; status: string; reason: string | null; expiresIn: number | null };

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

/** The documents as rows: icon, name, a note when action is needed, status. */
export function DocList({ rows }: { rows: DocRow[] }) {
  const tr = useTr();
  if (!rows.length) return <p className="aempty">{tr('Loading…')}</p>;
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
  const [docs, setDocs] = useState<Onboarding | null>(null);
  const [car, setCar] = useState<Vehicle | null>(null);
  useEffect(() => {
    loadDocs().then(setDocs).catch(() => setDocs({}));
    loadVehicles().then((v) => setCar(v[0] ?? null)).catch(() => {});
  }, []);

  const rows = docRows(docs, me, car);
  const approved = rows.filter((r) => r.status === 'approved').length;
  const urgent = rows.filter((r) => (r.expiresIn !== null && r.expiresIn <= 30) || r.status === 'rejected' || r.status === 'missing');
  const rest = rows.filter((r) => !urgent.includes(r));

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
            <Link href="/driver/documents/upload" className="abtn abtn--dark">{tr(r.status === 'missing' ? 'Upload' : 'Upload renewal')}</Link>
          </section>
        ))}
        {rest.length > 0 && <section className="acard" style={{ padding: '8px 20px' }}><DocList rows={rest} /></section>}
      </main>
    </>
  );
}
