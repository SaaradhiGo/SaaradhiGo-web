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
  const observer = useRef<ResizeObserver | null>(null);
  const watched = useRef<Element | null>(null);

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
    // The table can arrive (or be replaced) after the box mounts, once its data loads: watch the
    // one that is there now, so a later change in its width is seen.
    if (observer.current && watched.current !== table) {
      if (watched.current) observer.current.unobserve(watched.current);
      observer.current.observe(table);
      watched.current = table;
    }
    labelCells(table);
    if (cardsNow.current) {
      if (box.clientWidth < needed.current + 8) return;
      box.classList.remove('is-cards'); // room again: try it as a table
    }
    // The box's own scroll width also counts: a cell's content can spill past the table's edge.
    const wide = Math.max(table.scrollWidth, box.scrollWidth);
    const over = wide > box.clientWidth + 1;
    if (over) {
      needed.current = wide;
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
    // Again one frame later: a resize can change the CSS (media queries) after the first look.
    const ro = new ResizeObserver(() => { measure(); requestAnimationFrame(() => measure()); });
    observer.current = ro;
    watched.current = null;
    ro.observe(box);
    measure();
    void document.fonts?.ready.then(() => measure());
    return () => { ro.disconnect(); observer.current = null; watched.current = null; };
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
