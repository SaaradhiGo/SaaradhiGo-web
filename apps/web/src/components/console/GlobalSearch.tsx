'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Search } from '@/components/console/icons';

/**
 * One box for "find me this thing".
 *
 * An operator arrives with a trip number from a complaint, a phone number
 * from a call, or a plate from a report. The box takes any of them and
 * goes to the one place that can answer:
 *
 *   a number        -> that trip, directly
 *   anything else   -> the drivers list, searched for it
 *
 * WHAT IT DOES NOT PRETEND. The server has no search endpoint yet; the
 * drivers page searches the rows it has loaded and says so on the page.
 * The box is honest about that rather than hiding it behind a spinner.
 *
 * `/` focuses it from anywhere that is not already a text field, which is
 * the convention every tool an operator already uses follows.
 */
export function GlobalSearch() {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'
        || t.tagName === 'SELECT' || t.isContentEditable);
      if (typing) return;
      e.preventDefault();
      ref.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function go(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    if (!q) return;
    const tripId = q.match(/^#?(\d{1,12})$/);
    if (tripId) {
      router.push(`/trips/${tripId[1]}`);
    } else {
      router.push(`/drivers?q=${encodeURIComponent(q)}`);
    }
    setValue('');
    ref.current?.blur();
  }

  return (
    <form className="ops__search" role="search" onSubmit={go}>
      <Search className="ops__search-icon" />
      <input
        ref={ref}
        type="search"
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Trip ID, phone or plate"
        aria-label="Search by trip ID, phone number or plate"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      <kbd aria-hidden="true">/</kbd>
    </form>
  );
}
