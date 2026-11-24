'use client';

import { type DependencyList, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * 25 Nov (owner): no sideways scrolling at any width. A table that does not fit its box turns
 * into cards; one that fits again turns back. The switch follows the content, never a fixed
 * breakpoint: the table is measured as a table, and the width it needed is remembered so
 * it comes back only once there is room for it.
 *
 * Returns a ref for the box that holds the <table>, and whether to show cards. `deps` are what
 * changes the content (the rows): on a change the table is measured again before paint.
 */
export function useFitOrCards<T extends HTMLElement>(deps: DependencyList) {
  const ref = useRef<T>(null);
  const [cards, setCards] = useState(false);
  const cardsNow = useRef(false);
  const needed = useRef(0);

  const set = useCallback((value: boolean) => {
    if (cardsNow.current === value) return;
    cardsNow.current = value;
    setCards(value);
  }, []);

  // Decided synchronously, on the element itself, so no frame ever shows a table that scrolls;
  // React's state follows for the next render.
  const measure = useCallback(() => {
    const box = ref.current;
    const table = box?.querySelector('table');
    if (!box || !table || box.clientWidth === 0) return;
    labelCells(table);
    if (cardsNow.current) {
      if (box.clientWidth < needed.current + 8) return;
      box.classList.remove('is-cards'); // room again: try it as a table
    }
    const over = table.scrollWidth > box.clientWidth + 1;
    if (over) {
      needed.current = table.scrollWidth;
      box.classList.add('is-cards');
    }
    set(over);
  }, [set]);

  // New content: measure it as a table again, before paint.
  useLayoutEffect(() => {
    needed.current = 0;
    measure();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useLayoutEffect(() => measure());

  useEffect(() => {
    const box = ref.current;
    if (!box || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => measure());
    ro.observe(box);
    const table = box.querySelector('table');
    if (table) ro.observe(table);
    void document.fonts?.ready.then(() => measure());
    return () => ro.disconnect();
  }, [measure]);

  return [ref, cards] as const;
}

/** A card shows each value with its column's name: cells without a label take the header's. */
function labelCells(table: HTMLTableElement) {
  const heads = Array.from(table.tHead?.rows[0]?.cells ?? []).map((th) => (th.textContent ?? '').trim());
  if (!heads.length) return;
  for (const body of Array.from(table.tBodies)) {
    for (const row of Array.from(body.rows)) {
      let col = 0;
      Array.from(row.cells).forEach((cell, i) => {
        if (!cell.hasAttribute('data-label') && heads[col]) cell.setAttribute('data-label', heads[col]);
        if (!cell.hasAttribute('data-card') && i === 0 && cell.tagName === 'TD') cell.setAttribute('data-card', 'title');
        col += cell.colSpan || 1;
      });
    }
  }
}
