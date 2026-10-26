// Sending a document from the browser.
//
// WHY NOT THE PRESIGNED DIRECT-TO-S3 PUT
//
// `/uploads/presign/` exists, the Android driver app uses it, and on paper
// it is the better shape: the server signs a PUT, the browser sends the
// file straight to the bucket, and the bytes never occupy a Daphne worker.
//
// A browser will not make that request unless the BUCKET publishes a CORS
// rule allowing the origin, and the Railway-managed bucket does not. Its
// storage API also refuses `PutBucketCORS` with the credentials the
// deployment holds, so the rule cannot be added from the application side.
// This was measured, not assumed: the PUT fails in the browser with
// `net::ERR_FAILED` before it leaves, and no request reaches our API at
// all -- which is why the failure showed up as "we could not upload" with a
// clean server log. The mobile apps never hit it because a native HTTP
// client does not enforce CORS.
//
// So the web posts the file to our own API, which already has the right
// CORS and writes to S3 with server credentials. It costs a worker for the
// length of the upload. For a driver's documents -- a few megabytes, a
// handful of times, once -- that is worth paying to remove a dependency on
// a bucket setting nobody can verify or change.
//
// It is also STRICTER. The presign path validates a key and trusts what is
// behind it; this path hands Django the real bytes, which run through
// `validate_document_file` and the size limits before anything is stored.

import { ApiError, api } from './api';
import { readRiderToken } from './publicAuth';

/** What the server will accept, mirrored so the picker can filter. */
export const DOCUMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/**
 * 5 MB, which is what the SERVER enforces (`base.media.MAX_UPLOAD_SIZE`).
 *
 * Checked here so a doomed upload fails instantly instead of after the
 * round trip, and set to the server's real number so the message a driver
 * reads is the rule that will actually be applied. A client limit looser
 * than the server's is worse than none: it promises something and then the
 * upload is refused anyway.
 */
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function describeFileProblem(file: File): string | null {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`;
  }
  const type = (file.type || '').split(';')[0];
  if (!DOCUMENT_ACCEPT.split(',').includes(type)) {
    return 'Upload a JPEG, PNG, WebP or PDF.';
  }
  return null;
}

/**
 * Attach a document to the driver's own record.
 *
 * `field` is the column the server told us to use -- `license_doc`,
 * `rc_doc`, and so on. This module does not know which documents exist or
 * what they are called; the onboarding checklist does.
 */
export async function uploadDriverDocument<T>(field: string, file: File): Promise<T> {
  const problem = describeFileProblem(file);
  if (problem) throw new ApiError(0, 'UPLOAD_REJECTED', problem, true);

  const form = new FormData();
  form.append(field, file, file.name);
  return api.patchForm<T>('/driver/driver/update/', form, readRiderToken());
}

/** The same, for a document that belongs to a vehicle rather than a person. */
export async function uploadVehicleDocument<T>(
  vehicleId: number,
  field: string,
  file: File,
): Promise<T> {
  const problem = describeFileProblem(file);
  if (problem) throw new ApiError(0, 'UPLOAD_REJECTED', problem, true);

  const form = new FormData();
  form.append(field, file, file.name);
  return api.patchForm<T>(
    `/driver/vehicles/${vehicleId}/`,
    form,
    readRiderToken(),
  );
}
