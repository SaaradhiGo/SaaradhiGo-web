'use client';

import { useTr } from '@/i18n/website';

/** What could not be loaded, for "We couldn't load your …". */
export type What = 'earnings' | 'trips' | 'payouts' | 'documents' | 'profile' | 'account' | 'places' | 'receipt' | 'balance' | 'contacts';

const WORDS: Record<What, string> = {
  earnings: "We couldn't load your earnings.",
  trips: "We couldn't load your trips.",
  payouts: "We couldn't load your payouts.",
  documents: "We couldn't load your documents.",
  profile: "We couldn't load your profile.",
  account: "We couldn't load your account.",
  places: "We couldn't load your saved places.",
  receipt: "We couldn't load this receipt.",
  balance: "We couldn't load your balance.",
  contacts: "We couldn't load your trusted contacts.",
};

/** Grey blocks in the shape of what is coming; at most ten seconds (useLoad). */
export function Skel({ h = 16, w = '100%', lines = 1, gap = 10, style }: {
  h?: number; w?: number | string; lines?: number; gap?: number; style?: React.CSSProperties;
}) {
  const tr = useTr();
  return (
    <div className="askel-wrap" role="status" aria-label={tr('Loading')} style={{ display: 'grid', gap, ...style }}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="askel" style={{ height: h, width: i === lines - 1 && lines > 1 ? '60%' : w }} />
      ))}
    </div>
  );
}

/** The error state: what failed and Try again. The rest of the page stays. */
export function LoadError({ what, retry, ink }: { what: What; retry: () => void; ink?: boolean }) {
  const tr = useTr();
  return (
    <div className="aerr" role="alert">
      <span>{tr(WORDS[what])}</span>
      <button type="button" className={`abtn ${ink ? 'abtn--pri' : 'abtn--ghost'} a14`} style={{ height: 36, padding: '0 14px' }} onClick={retry}>
        {tr('Try again')}
      </button>
    </div>
  );
}
