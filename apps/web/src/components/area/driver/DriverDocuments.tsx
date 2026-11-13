'use client';

import Link from 'next/link';
import { useTr } from '@/i18n/website';
import { vehicles as loadVehicles } from '@/lib/area/driver';
import { dateOrder } from '@/lib/area/format';
import { setupHref, uploadFile } from '@/lib/area/requirements';
import { type DocRow, documentRows, isApproved } from '@/lib/area/setupChecks';
import { useLoad } from '@/lib/area/useLoad';
import { IHelp } from '../icons';
import { LoadError, Skel } from '../states';
import { DriverTop, useDriver } from './parts';
import { useRequirementsLoad } from './profile/shared';
import { DocTile, SaveContext, useSaveState } from './setup/fields';
import { IMAGE_ACCEPT, squarePhoto } from './setup/steps';

const NEEDS_YOU = ['rejected', 'missing', 'expiring'];
const GROUPS: [DocRow['target'], string][] = [['personal', 'Your photo'], ['identity', 'Identity and address'], ['vehicle', 'Vehicle photos and papers']];

/**
 * /driver/documents (driver-web-documents.html; 11 Nov): one source with setup, Profile and the
 * Dashboard, the server's checklist for the driver's country, state and vehicle. The count is the
 * approved files out of the files the market asks for (the profile photo and the five vehicle
 * photos included); what needs the driver comes first; each paper shows its expiry date.
 */
export function DriverDocuments() {
  const tr = useTr();
  const me = useDriver();
  const req = useRequirementsLoad();
  const cars = useLoad(loadVehicles);
  const saver = useSaveState();
  const data = req.data;
  const car = cars.data?.[0] ?? null;
  const rows = documentRows(data);
  const shown = rows.filter((r) => car || r.target !== 'vehicle');
  const vehicleRows = rows.some((r) => r.target === 'vehicle');
  const approved = rows.filter((r) => isApproved(r.status)).length;
  const order = dateOrder(data?.config.country);
  const again = () => { (req.refresh ?? req.retry)(); (cars.refresh ?? cars.retry)(); };
  const field = (key: string) => data?.upload_kinds[key] ?? key;

  async function upload(r: DocRow, f: File) {
    if (r.target === 'personal') await uploadFile('personal', 'photo', await squarePhoto(f));
    else if (r.target === 'vehicle' && car) await uploadFile({ vehicle: car.id }, field(r.key), f);
    else await uploadFile('identity', field(r.key), f);
    again();
  }
  const tile = (r: DocRow) => (
    <DocTile key={r.key} file={r} expires={r.expires} order={order} photo={r.target === 'personal' || r.key.startsWith('vehicle_photo')}
      accept={r.target === 'personal' || r.key.startsWith('vehicle_photo') ? IMAGE_ACCEPT : undefined} upload={(f) => upload(r, f)} />
  );
  const urgent = shown.filter((r) => NEEDS_YOU.includes(r.status));

  return (
    <>
      <DriverTop title={tr('Documents')} me={me} />
      <main className="dr-main">
        <section className="acard" style={{ padding: 20 }} data-testid="documents-summary">
          {/* 13 Nov: on phones the summary has its own row and the support button sits below it. */}
          <div className="arow astack-phone" style={{ flexWrap: 'wrap' }}>
            <div className="agrow">
              <h2 className="a20" data-testid="documents-count">
                {rows.length ? tr('{a} of {n} approved').replace('{a}', `${approved}`).replace('{n}', `${rows.length}`) : tr('Documents')}
              </h2>
              <div className="a14 amut">{tr('We remind you 30, 7 and 1 days before a document expires.')}</div>
            </div>
            <Link href="/driver/support" className="abtn abtn--ghost"><IHelp size={18} />{tr('Contact driver support')}</Link>
          </div>
          {req.state === 'error' && <LoadError what="documents" retry={req.retry} />}
          {!data && req.state !== 'error' && <Skel h={10} style={{ marginTop: 16 }} />}
          {data && rows.length === 0 && <p className="aempty">{tr('No documents are needed yet.')}</p>}
          {rows.length > 0 && (
            <div className="dr-meter" role="img" aria-label={tr('{a} of {n} approved').replace('{a}', `${approved}`).replace('{n}', `${rows.length}`)}>
              <div style={{ width: `${(approved / rows.length) * 100}%` }} />
            </div>
          )}
        </section>
        <SaveContext.Provider value={saver}>
          {urgent.length > 0 && (
            <section className="acard dr-docs dr-docs--urgent" data-testid="documents-urgent">
              <h2 className="a20">{tr('Needs you')}</h2>
              <div className="su-tiles">{urgent.map(tile)}</div>
            </section>
          )}
          {GROUPS.map(([target, title]) => {
            const group = shown.filter((r) => r.target === target && !urgent.includes(r));
            return group.length ? (
              <section key={target} className="acard dr-docs" data-testid={`documents-${target}`}>
                <h2 className="a20">{tr(title)}</h2>
                <div className="su-tiles">{group.map(tile)}</div>
              </section>
            ) : null;
          })}
        </SaveContext.Provider>
        {data && vehicleRows && cars.state !== 'ok' && (
          <section className="acard dr-docs" data-testid="vehicle-documents-loading">
            <h2 className="a20">{tr('Vehicle photos and papers')}</h2>
            {cars.state === 'error' ? <LoadError what="documents" retry={cars.retry} /> : <Skel h={18} lines={3} gap={14} />}
          </section>
        )}
        {data && cars.data && !car && data.checklist.items.some((i) => i.step === 'vehicle_docs' && i.need === 'required') && (
          <section className="acard dr-docs" data-testid="vehicle-documents-waiting">
            <div className="arow" style={{ gap: 12, flexWrap: 'wrap' }}>
              <div className="agrow"><h2 className="a20">{tr('Vehicle photos and papers')}</h2>
                <div className="a14 amut">{tr('Add your vehicle first')}</div></div>
              <Link href={setupHref('vehicle')} className="abtn abtn--dark">{tr('Add vehicle')}</Link>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
