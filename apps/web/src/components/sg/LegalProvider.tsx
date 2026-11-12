'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Market } from '@/i18n/locales';
import { LEGAL_FALLBACK, type LegalEntity, type LegalMap, marketOfTimeZone } from '@/lib/legal';

/** The same key the locale provider keeps the market under, plus a cookie the server reads. */
const MARKET_KEY = 'sg-market';
const MARKET_COOKIE = 'sg-market';

type Ctx = {
  legal: LegalMap;
  /** The market the footer and legal pages speak for right now. */
  market: Market;
  entity: LegalEntity;
  /** The visitor's footer choice: remembered in storage and a cookie. */
  choose: (m: Market) => void;
  /** A trip, receipt, statement or city page names its own market while it is on screen. */
  setOnScreen: (m: Market | null) => void;
};

const LegalContext = createContext<Ctx | null>(null);

/**
 * `initialMarket` is what the server could tell (the visitor's cookie, the account's market, the
 * edge's country header) and `decided` says whether it found any of them. When it did not, the
 * browser's time zone decides, then India.
 */
export function LegalProvider({
  children,
  legal = LEGAL_FALLBACK,
  initialMarket = 'IN',
  decided = false,
}: {
  children: React.ReactNode;
  legal?: LegalMap;
  initialMarket?: Market;
  decided?: boolean;
}) {
  const [base, setBase] = useState<Market>(initialMarket);
  const [onScreen, setOnScreen] = useState<Market | null>(null);

  useEffect(() => {
    if (decided) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(MARKET_KEY); } catch { /* private mode */ }
    if (saved === 'IN' || saved === 'US') { setBase(saved); return; }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setBase(marketOfTimeZone(tz) ?? 'IN');
  }, [decided]);

  const choose = useCallback((m: Market) => {
    setBase(m);
    try { localStorage.setItem(MARKET_KEY, m); } catch { /* not remembered */ }
    document.cookie = `${MARKET_COOKIE}=${m}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const market = onScreen ?? base;
  const value = useMemo<Ctx>(() => ({
    legal, market, entity: legal[market] ?? LEGAL_FALLBACK[market], choose, setOnScreen,
  }), [legal, market, choose]);

  return <LegalContext.Provider value={value}>{children}</LegalContext.Provider>;
}

export function useLegal(): Ctx {
  const ctx = useContext(LegalContext);
  if (ctx) return ctx;
  // Outside a provider (a test, an isolated widget): the India entity, read-only.
  return {
    legal: LEGAL_FALLBACK, market: 'IN', entity: LEGAL_FALLBACK.IN,
    choose: () => undefined, setOnScreen: () => undefined,
  };
}

/** A page about one market's trip, receipt, statement or city: the footer speaks for it. */
export function useOnScreenMarket(market: string | null | undefined) {
  const { setOnScreen } = useLegal();
  useEffect(() => {
    const m = String(market ?? '').toUpperCase();
    setOnScreen(m === 'IN' || m === 'US' ? (m as Market) : null);
    return () => setOnScreen(null);
  }, [market, setOnScreen]);
}
