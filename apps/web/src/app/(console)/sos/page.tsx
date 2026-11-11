import { redirect } from 'next/navigation';

/**
 * The SOS board became Safety (`/safety-ops`): the queue, the incident page and
 * the settings. Old links, bookmarks and the Command Centre's `?scope=` link
 * keep working by landing on the Active SOS tab.
 */
export default async function SosRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const scope = typeof params.scope === 'string' ? params.scope : '';
  redirect(scope ? `/safety-ops?scope=${encodeURIComponent(scope)}` : '/safety-ops');
}
