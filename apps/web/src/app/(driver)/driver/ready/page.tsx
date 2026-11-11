import { redirect } from 'next/navigation';

/** The 10 Nov checklist became the guided setup (10 Nov v2). */
export default function Page() {
  redirect('/driver/setup');
}
