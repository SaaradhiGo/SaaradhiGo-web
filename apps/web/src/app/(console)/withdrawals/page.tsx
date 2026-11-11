import { redirect } from 'next/navigation';

/**
 * The Withdrawals page became the Payouts tab of Finance (/finance/payouts),
 * which keeps its approve and reject actions. Old bookmarks, the Command
 * Centre's links and any `?status=` they carry land there.
 *
 * `processing` was this page's word for what the server calls `processed`.
 */
const STATUS = new Set(['pending', 'approved', 'processed', 'completed', 'failed', 'unresolved', 'rejected']);

export default async function WithdrawalsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const q = new URLSearchParams();
  const raw = one(params.status);
  const status = raw === 'processing' ? 'processed' : raw;
  if (STATUS.has(status) && status !== 'pending') q.set('status', status);
  const scope = one(params.scope);
  if (scope) q.set('scope', scope);
  redirect(`/finance/payouts${q.toString() ? `?${q}` : ''}`);
}
