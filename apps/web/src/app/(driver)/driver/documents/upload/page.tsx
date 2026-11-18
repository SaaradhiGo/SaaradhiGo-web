import { redirect } from 'next/navigation';

/**
 * 18 Nov: the old upload checklist read the role from a browser copy of the account, which the
 * HttpOnly-cookie session (14 Nov) no longer keeps, so a signed-in driver was told "This page
 * belongs to a driver account. You are signed in as a rider." The middleware only lets drivers
 * into /driver; the upload form is the Documents screen, so this address goes there.
 */
export default function Page() {
  redirect('/driver/documents');
}
