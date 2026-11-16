import { redirect } from 'next/navigation';

/** /ops itself has no page: staff land on Start (16 Nov regression sweep: it was a 404). */
export default function OpsIndex() {
  redirect('/ops/start');
}
