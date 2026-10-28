'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Field, SubmitButton } from '@/components/form';
import { Badge } from '@/components/sg/Badge';
import { Button, ButtonLink } from '@/components/sg/Button';
import { Check } from '@/components/sg/icons';
import {
  ChecklistDocument,
  Onboarding,
  createVehicle,
  driverOnboarding,
  patchDriverProfile,
  setActiveVehicle,
} from '@/lib/driver';
import { messageFor } from '@/lib/publicAuth';
import {
  DOCUMENT_ACCEPT,
  uploadDriverDocument,
  uploadVehicleDocument,
} from '@/lib/uploads';
import { useSession } from '@/lib/useSession';

/**
 * Where a driver supplies the documents they are approved on.
 *
 * THIS SCREEN DID NOT EXIST, AND ITS ABSENCE WAS THE WHOLE PROBLEM.
 *
 * Approval is gated on documents -- the server refuses `approved=True`
 * without a licence, an unexpired licence date, an assigned vehicle and
 * that vehicle's registration. The website offered no way to supply any of
 * it, so no driver could ever reach approval through it, and the driver
 * home said "Awaiting review" for a review that had nothing to look at.
 *
 * THE CHECKLIST IS THE SERVER'S.
 * Every row below comes from `/driver/driver/onboarding/`, which is computed
 * from the same compliance rules the operator console reviews against. This
 * page does not know which documents exist, what they are called, or which
 * country needs which -- it renders what it is told and presigns against the
 * `upload_kind` it is given. A driver and their reviewer therefore cannot be
 * looking at different lists.
 *
 * EACH UPLOAD SAVES ON ITS OWN.
 * There is no "submit everything" button. A driver photographing documents
 * on a phone, on a patchy connection, should not lose four uploads because
 * the fifth failed -- and should not have to remember which ones went
 * through. Every row reports its own state and the checklist is re-read
 * after each success, so what is on screen is what the server has.
 */
const STATUS_TONE: Record<string, 'success' | 'danger' | 'neutral'> = {
  approved: 'success',
  rejected: 'danger',
  pending: 'neutral',
};

const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved',
  rejected: 'Changes needed',
  pending: 'Awaiting review',
};

function DocumentRow({
  doc,
  busy,
  onPick,
}: {
  doc: ChecklistDocument;
  busy: boolean;
  onPick: (doc: ChecklistDocument, file: File) => void;
}) {
  const input = useRef<HTMLInputElement | null>(null);

  return (
    <li className="sg-doc">
      <span
        className={`sg-doc__tick ${doc.present ? 'is-done' : ''}`}
        aria-hidden="true"
      >
        {doc.present ? <Check /> : null}
      </span>

      <span className="sg-doc__text">
        <strong>{doc.label}</strong>
        <span>{doc.description}</span>
        {!doc.recordable && (
          <span className="sg-doc__warn">
            We cannot accept this document online yet. Contact support.
          </span>
        )}
      </span>

      <span className="sg-doc__action">
        <input
          ref={input}
          type="file"
          accept={DOCUMENT_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Clear the input so re-picking the SAME file fires again --
            // which is exactly what someone does after a failed upload.
            e.target.value = '';
            if (file) onPick(doc, file);
          }}
        />
        <Button
          variant={doc.present ? 'ghost' : 'secondary'}
          size="sm"
          disabled={busy || !doc.recordable || !doc.upload_kind}
          onClick={() => input.current?.click()}
        >
          {busy ? 'Uploading…' : doc.present ? 'Replace' : 'Upload'}
        </Button>
      </span>
    </li>
  );
}

export default function DriverDocumentsPage() {
  const router = useRouter();
  const session = useSession();
  const role = session.status === 'in' ? session.role : null;

  const [data, setData] = useState<Onboarding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [expiry, setExpiry] = useState('');

  const [vehicleNumber, setVehicleNumber] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [colour, setColour] = useState('');
  const [addingVehicle, setAddingVehicle] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await driverOnboarding();
      setData(next);
      setExpiry((current) => current || (next.license_expiry ?? ''));
      setVehicleType((current) => current || next.vehicle_types?.[0]?.type || '');
      setError(null);
    } catch (err) {
      setError(messageFor(err, 'We could not load your checklist.'));
    }
  }, []);

  useEffect(() => {
    if (role === 'driver') void load();
  }, [role, load]);

  async function onPick(doc: ChecklistDocument, file: File) {
    if (!doc.upload_kind) return;
    setError(null);
    setNotice(null);
    setUploading(doc.key);
    try {
      // The file goes to whichever record owns the document. The server
      // told us which; this page does not infer it from the name.
      if (doc.target === 'vehicle') {
        const vehicleId = data?.vehicle?.id;
        if (!vehicleId) {
          setError('Add your vehicle first, then upload its documents.');
          return;
        }
        await uploadVehicleDocument(vehicleId, doc.upload_kind, file);
      } else {
        await uploadDriverDocument(doc.upload_kind, file);
      }

      setNotice(`${doc.label} uploaded.`);
      await load();
    } catch (err) {
      setError(messageFor(err, `We could not upload your ${doc.label.toLowerCase()}.`));
    } finally {
      setUploading(null);
    }
  }

  async function onSaveExpiry(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSavingExpiry(true);
    try {
      await patchDriverProfile({ license_expiry: expiry });
      setNotice('Licence expiry saved.');
      await load();
    } catch (err) {
      setError(messageFor(err, 'We could not save that date.'));
    } finally {
      setSavingExpiry(false);
    }
  }

  async function onAddVehicle(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!vehicleNumber.trim()) {
      setError('Enter your vehicle registration number.');
      return;
    }
    setAddingVehicle(true);
    try {
      const created = await createVehicle({
        vehicle_number: vehicleNumber.trim().toUpperCase(),
        vehicle_type: vehicleType,
        brand: brand.trim(),
        model: model.trim(),
        color: colour.trim(),
      });
      // Adding a car is not the same as driving it: the approval gate wants
      // `active_vehicle` SET. Doing it here means a driver with one vehicle
      // never has to understand the distinction.
      if (created?.id) await setActiveVehicle(created.id);
      setNotice('Vehicle added.');
      await load();
    } catch (err) {
      setError(messageFor(err, 'We could not add that vehicle.'));
    } finally {
      setAddingVehicle(false);
    }
  }

  if (session.status === 'loading') {
    return <p className="text-ink-subtle">Loading…</p>;
  }

  if (session.status === 'out') {
    return (
      <div className="sg-page max-w-md">
        <h1 className="text-3xl font-bold">Your documents</h1>
        <div className="card mt-6 space-y-4">
          <Alert kind="info">Sign in with your driver account to continue.</Alert>
          <ButtonLink
            href="/driver/sign-in?next=%2Fdriver%2Fdocuments"
            variant="primary"
            block
          >
            Driver sign in
          </ButtonLink>
        </div>
      </div>
    );
  }

  if (role !== 'driver') {
    return (
      <div className="sg-page max-w-md">
        <h1 className="text-3xl font-bold">Your documents</h1>
        <div className="card mt-6 space-y-4">
          <Alert kind="info">
            This page belongs to a driver account. You are signed in as a{' '}
            {role === 'admin' ? 'operator' : 'rider'}.
          </Alert>
          <Button variant="secondary" block onClick={() => router.push('/')}>
            Go to the rider home
          </Button>
        </div>
      </div>
    );
  }

  const driverDocs = data?.driver_documents ?? [];
  const vehicleDocs = data?.vehicle_documents ?? [];
  const status = data?.doc_status ?? 'pending';
  const done = [...driverDocs, ...vehicleDocs].filter((d) => d.present).length;
  const total = driverDocs.length + vehicleDocs.length
    + 1 /* licence expiry */ + 1 /* a vehicle on file */;
  const complete = done
    + (data?.license_expiry_ok ? 1 : 0)
    + (data?.vehicle ? 1 : 0);

  return (
    <div className="sg-page max-w-3xl space-y-sg-6">
      <header className="flex items-start justify-between gap-sg-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold m-0">Your documents</h1>
          <p className="text-ink-muted mt-sg-1 m-0">
            {data?.country === 'IN'
              ? 'What the Motor Vehicles Aggregator Guidelines require before you can be dispatched.'
              : 'What we need before you can be dispatched.'}
          </p>
        </div>
        <Badge tone={data?.approved ? 'success' : STATUS_TONE[status] ?? 'neutral'}>
          {data?.approved ? 'Approved' : STATUS_LABEL[status] ?? status}
        </Badge>
      </header>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      {/* A rejection with a reason is the one thing a driver most needs to
          read, so it is above everything else rather than in a status chip. */}
      {status === 'rejected' && (
        <Alert kind="error">
          <strong className="block">An operator asked for changes.</strong>
          {data?.doc_rejection_reason
            ? data.doc_rejection_reason
            : 'No reason was recorded. Contact support if it is not clear what to change.'}
        </Alert>
      )}

      {data && (
        <section className="card space-y-sg-3">
          <div className="flex items-center justify-between gap-sg-3">
            <h2 className="text-xl font-semibold m-0">Progress</h2>
            <span className="caption text-ink-muted sg-num">
              {complete} of {total}
            </span>
          </div>
          <div className="sg-meter" role="img"
               aria-label={`${complete} of ${total} steps complete`}>
            <i style={{ width: `${total ? (complete / total) * 100 : 0}%` }} />
          </div>
          {data.ready_for_review ? (
            <Alert kind="success">
              Everything we need is on file. An operator reviews it before you
              can go online — nothing further is needed from you.
            </Alert>
          ) : (
            <p className="caption text-ink-muted m-0">
              Upload the rest below. Each one saves as you go.
            </p>
          )}
        </section>
      )}

      {/* --- the driver's own documents ----------------------------------- */}
      <section className="space-y-sg-3">
        <h2 className="text-xl font-semibold">About you</h2>
        {data === null ? (
          <p className="text-ink-subtle">Loading…</p>
        ) : (
          <ul className="card sg-doc-list">
            {driverDocs.map((doc) => (
              <DocumentRow
                key={doc.key}
                doc={doc}
                busy={uploading === doc.key}
                onPick={onPick}
              />
            ))}
          </ul>
        )}

        <form onSubmit={onSaveExpiry} className="card space-y-sg-3" noValidate>
          <Field
            label="Licence expiry date"
            name="license_expiry"
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            help="We cannot approve a licence that has already expired, however clear the photo is."
          />
          <SubmitButton busy={savingExpiry} busyLabel="Saving…">
            Save expiry date
          </SubmitButton>
          {data?.license_expiry && !data.license_expiry_ok && (
            <Alert kind="error">
              That licence expired on {data.license_expiry}. Upload a renewed
              one and update the date.
            </Alert>
          )}
        </form>
      </section>

      {/* --- the vehicle --------------------------------------------------- */}
      <section className="space-y-sg-3">
        <h2 className="text-xl font-semibold">Your vehicle</h2>

        {data?.vehicle ? (
          <>
            <div className="card space-y-sg-2">
              <p className="font-semibold sg-num m-0">
                {data.vehicle.vehicle_number || 'No registration number'}
              </p>
              <p className="text-ink-muted m-0">
                {[data.vehicle.brand, data.vehicle.model, data.vehicle.color]
                  .filter(Boolean)
                  .join(' · ') || 'No make or model on file'}
              </p>
              {!data.vehicle.is_active && (
                <>
                  <Alert kind="info">
                    This is not set as the vehicle you drive, and we cannot
                    approve you until it is.
                  </Alert>
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await setActiveVehicle(data.vehicle!.id);
                        await load();
                      } catch (err) {
                        setError(messageFor(err, 'We could not select that vehicle.'));
                      }
                    }}
                  >
                    I drive this vehicle
                  </Button>
                </>
              )}
            </div>

            <ul className="card sg-doc-list">
              {vehicleDocs.map((doc) => (
                <DocumentRow
                  key={doc.key}
                  doc={doc}
                  busy={uploading === doc.key}
                  onPick={onPick}
                />
              ))}
            </ul>
          </>
        ) : (
          <form onSubmit={onAddVehicle} className="card space-y-sg-3" noValidate>
            <p className="caption text-ink-muted m-0">
              Add the vehicle first — its documents are attached to it.
            </p>
            <Field
              label="Registration number"
              name="vehicle_number"
              value={vehicleNumber}
              onChange={(e) => setVehicleNumber(e.target.value)}
              required
            />
            <div className="sg-field">
              <label className="form-label" htmlFor="vehicle_type">
                Category
              </label>
              <select
                id="vehicle_type"
                name="vehicle_type"
                className="input"
                value={vehicleType}
                onChange={(e) => setVehicleType(e.target.value)}
              >
                {(data?.vehicle_types ?? []).map((v) => (
                  <option key={v.type} value={v.type}>
                    {v.description || v.type}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-sg-3 sm:grid-cols-3">
              <Field label="Make" name="brand" value={brand}
                     onChange={(e) => setBrand(e.target.value)} />
              <Field label="Model" name="model" value={model}
                     onChange={(e) => setModel(e.target.value)} />
              <Field label="Colour" name="color" value={colour}
                     onChange={(e) => setColour(e.target.value)} />
            </div>
            <SubmitButton busy={addingVehicle} busyLabel="Adding…">
              Add vehicle
            </SubmitButton>
          </form>
        )}
      </section>

      <p className="caption text-ink-subtle">
        Documents are stored privately and are visible only to the operator
        reviewing your account.{' '}
        <ButtonLink href="/driver/home" variant="ghost" size="sm">
          Back to driver home
        </ButtonLink>
      </p>
    </div>
  );
}
