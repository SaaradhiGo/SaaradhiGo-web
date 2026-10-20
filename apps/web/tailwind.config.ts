import type { Config } from 'tailwindcss';

/**
 * Tailwind reads the design system; it does not restate it.
 *
 * Every colour, shadow, radius, spacing step and family below is a
 * `var(--token)` reference into `src/styles/tokens.css`, which is the only
 * file in this app allowed to contain a colour literal. Copying the hex
 * values here would have created a second palette to drift against the one
 * the designers ship, and it is what let the old gold literal and the `sand`
 * scale diverge from the brand in the first place.
 *
 * It also means both themes work for free: `[data-theme="light"]` redefines
 * the same custom properties, so a `bg-bg-100` class resolves to ivory in
 * the light theme and near-black in the dark one without a single `dark:`
 * variant anywhere in the app.
 *
 * NO OPACITY MODIFIERS ON THESE COLOURS. A token resolves to a plain
 * `var(...)`, so Tailwind cannot compute `bg-gold-500/30` from it and
 * silently drops the declaration. The design system has named tokens for the
 * two translucent golds it uses -- `gold-soft` (14%) and `gold-line` (30%) --
 * and those are the ones to reach for.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // The black band: nav and the Saaradhi Black section, in BOTH themes.
        noir: 'var(--noir)',
        'on-noir': 'var(--on-noir)',
        'on-noir-muted': 'var(--on-noir-muted)',

        // Surfaces, light to dark in the dark theme and the reverse in light.
        bg: {
          '000': 'var(--bg-000)',
          100: 'var(--bg-100)',
          200: 'var(--bg-200)',
          300: 'var(--bg-300)',
          glass: 'var(--bg-glass)',
        },
        line: {
          DEFAULT: 'var(--line)',
          strong: 'var(--line-strong)',
        },

        // Foreground.
        ink: {
          DEFAULT: 'var(--ink)',
          muted: 'var(--ink-muted)',
          subtle: 'var(--ink-subtle)',
        },

        // Gold. `gold-500` is for FILLS (with `on-gold` text); `gold-text` is
        // the accessible gold for TYPE. They are not interchangeable: gold-500
        // as body text fails contrast on both themes.
        gold: {
          500: 'var(--gold-500)',
          300: 'var(--gold-300)',
          700: 'var(--gold-700)',
          soft: 'var(--gold-soft)',
          line: 'var(--gold-line)',
          text: 'var(--gold-text)',
        },
        'on-gold': 'var(--on-gold)',
        logo: 'var(--logo)',
        champagne: 'var(--champagne)',

        // State. `pickup` is also a shape (a circle) wherever it appears --
        // the destination marker is a square -- so none of this is carried by
        // colour alone.
        pickup: 'var(--pickup)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        'focus-ring': 'var(--focus-ring)',

        // The map's own palette. Used by the Google Maps style array and by
        // nothing else.
        map: {
          ground: 'var(--map-ground)',
          street: 'var(--map-street)',
          arterial: 'var(--map-arterial)',
          highway: 'var(--map-highway)',
          water: 'var(--map-water)',
          park: 'var(--map-park)',
          label: 'var(--map-label)',
        },

        // `brand` predates the design system and is used in ~90 places,
        // including the operations console, which this redesign does not
        // touch. Pointing it at the gold tokens migrates all of them at once
        // instead of churning thirty files, and leaves no hex behind.
        brand: {
          DEFAULT: 'var(--gold-500)',
          dark: 'var(--gold-700)',
          soft: 'var(--gold-300)',
        },
      },

      // Namespaced on purpose. `spacing.5` and `rounded-md` already mean
      // something in Tailwind, and redefining them would quietly resize every
      // existing page in the console. These sit alongside the defaults.
      spacing: {
        'sg-1': 'var(--space-1)',
        'sg-2': 'var(--space-2)',
        'sg-3': 'var(--space-3)',
        'sg-4': 'var(--space-4)',
        'sg-5': 'var(--space-5)',
        'sg-6': 'var(--space-6)',
        'sg-7': 'var(--space-7)',
        'sg-8': 'var(--space-8)',
      },
      borderRadius: {
        'sg-sm': 'var(--radius-sm)',
        'sg-md': 'var(--radius-md)',
        'sg-lg': 'var(--radius-lg)',
        'sg-xl': 'var(--radius-xl)',
        'sg-pill': 'var(--radius-pill)',
      },

      boxShadow: {
        panel: 'var(--shadow-panel)',
        glow: 'var(--shadow-glow)',
        sheen: 'var(--shadow-sheen)',
      },

      fontFamily: {
        // Cormorant Garamond: headlines and the brand promises, nothing else.
        display: ['var(--font-display)'],
        // Manrope: every number, label and control. The default.
        sans: ['var(--font-sans)'],
        // Cinzel: the brand name, eyebrows and map labels. Never body copy.
        brand: ['var(--font-brand)'],
      },

      transitionDuration: {
        // 140ms for hover and press, 240ms for sheets and selection.
        press: '140ms',
        sheet: '240ms',
      },
    },
  },
  plugins: [],
};
export default config;
