import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#EEBD2B',
          dark: '#C59A1D',
          soft: '#F6D979',
        },
        // Warm charcoal, not flat black. A pure #000 background under gold
        // reads as cheap; these carry a little red so the gold sits in the
        // same family instead of floating on top of it.
        ink: {
          900: '#141110',
          800: '#1B1715',
          700: '#231E1A',
          600: '#2E2822',
          500: '#3A332B',
        },
      },
      boxShadow: {
        panel: '0 24px 60px -24px rgba(0,0,0,0.75)',
        glow: '0 0 0 1px rgba(238,189,43,0.25), 0 18px 50px -20px rgba(238,189,43,0.25)',
      },
      backgroundImage: {
        'warm-fade':
          'radial-gradient(1200px 600px at 15% -10%, rgba(238,189,43,0.10), transparent 60%),'
          + ' radial-gradient(900px 500px at 95% 0%, rgba(238,189,43,0.06), transparent 55%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
