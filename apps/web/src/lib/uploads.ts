// Direct-to-S3 document upload.
//
// The bytes never pass through Django: the server signs a PUT, the browser
// sends the file straight to S3, and only the resulting KEY is submitted to
// the resource endpoint. That is the contract `/uploads/presign/` already
// offers and the Android driver app already uses; the website simply never
// called it, which is why there was no way to supply a document here.
//
// WHAT THIS FILE REFUSES TO DECIDE
// It does not know which documents exist or what they are called. The kind
// comes from the server's own onboarding checklist, so a country whose
// requirements change does not need a change here.

import { ApiError, api } from './api';
import { readRiderToken } from './publicAuth';

export type PresignedUpload = {
  kind: string;
  key: string;
  upload_url: string;
  expires_in: number;
  method: string;
  headers: Record<string, string>;
};

/** What the server will accept, mirrored so the picker can filter. */
export const DOCUMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

/** 10 MB. Checked before the round trip so a doomed upload fails fast. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function describeFileProblem(file: File): string | null {
  if (file.size === 0) return 'That file is empty.';
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 10 MB.`;
  }
  const type = (file.type || '').split(';')[0];
  if (!DOCUMENT_ACCEPT.split(',').includes(type)) {
    return 'Upload a JPEG, PNG, WebP or PDF.';
  }
  return null;
}

/**
 * Upload one document and return the key to submit.
 *
 * Two steps, and the second one does NOT go through `api`: it is a PUT to
 * S3 with the exact signed Content-Type and no Authorization header.
 * Sending our bearer token to a storage host would leak the session to a
 * third party, and S3 rejects a signature whose Content-Type does not match
 * byte for byte -- both are reasons this is deliberately not the normal
 * client.
 */
export async function uploadDocument(kind: string, file: File): Promise<string> {
  const problem = describeFileProblem(file);
  if (problem) throw new ApiError(0, 'UPLOAD_REJECTED', problem, true);

  const contentType = (file.type || '').split(';')[0];
  const signed = await api.post<PresignedUpload>(
    '/uploads/presign/',
    { kind, content_type: contentType },
    readRiderToken(),
  );

  const response = await fetch(signed.upload_url, {
    method: signed.method || 'PUT',
    // Exactly the headers the signature covers. An extra header invalidates
    // it, so this does not spread anything of its own in.
    headers: signed.headers,
    body: file,
  });

  if (!response.ok) {
    throw new ApiError(
      response.status,
      'UPLOAD_FAILED',
      'We could not store that file. Please try again.',
      true,
    );
  }

  return signed.key;
}
