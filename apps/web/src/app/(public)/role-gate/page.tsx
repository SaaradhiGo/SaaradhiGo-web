import type { Metadata } from 'next';
import { RoleGate } from '@/components/pages/RoleGate';

// 13 Nov: served by the middleware at the URL asked for, when it belongs to the other role.
// The middleware's rewrite carries `need` and `next`; only the server sees them (the browser's
// own URL is the page asked for), so they are read here and passed down.
export const metadata: Metadata = { title: 'SaaradhiGo', robots: { index: false, follow: false } };

export default async function RoleGatePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? null;
  return <RoleGate need={one(sp.need) === 'driver' ? 'driver' : 'rider'} next={one(sp.next)} />;
}
