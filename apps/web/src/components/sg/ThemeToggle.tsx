'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from './icons';

type Theme = 'dark' | 'light';

/**
 * Switches between the two themes the design system ships.
 *
 * The dark theme is the default and is set statically on <html>, so this
 * control exists for the rider who wants the ivory one -- in daylight, or
 * because a very dark screen is hard for them to read. The choice is theirs
 * to keep, so it is stored and reapplied before first paint by the inline
 * script in the root layout.
 *
 * It is a GHOST button, not a primary one. There is one primary action per
 * view and on these pages it is "Sign up" or "See fares"; a theme switch is
 * never the thing a screen is for.
 *
 * `aria-pressed` rather than a label that changes meaning: the button is
 * "Light theme", and whether it is on is its state. The icon is decorative,
 * so the name is in `aria-label` and survives with images off.
 */
export function ThemeToggle() {
  // Rendered unknown until mounted. The server cannot know what the visitor
  // stored, and guessing produces a toggle that shows the wrong state for one
  // frame -- on a theme switch, exactly the frame you are looking at.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === 'light' ? 'light' : 'dark');
  }, []);

  function choose(next: Theme) {
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem('sg-theme', next);
    } catch {
      // Private browsing refuses the write. The theme still applies for this
      // visit; it simply will not be remembered, which is not worth an error.
    }
  }

  const light = theme === 'light';

  return (
    <button
      type="button"
      className="sg-btn sg-btn--ghost sg-btn--sm"
      aria-label="Light theme"
      aria-pressed={theme === null ? undefined : light}
      onClick={() => choose(light ? 'dark' : 'light')}
    >
      {light ? <Moon /> : <Sun />}
    </button>
  );
}
