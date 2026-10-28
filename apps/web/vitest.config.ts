/**
 * Component tests: vitest + jsdom + Testing Library.
 *
 * The pure-function tests under `tests/` run on node:test with Node's own
 * type stripping, which cannot read JSX. Anything that renders a React
 * component lives next to the component as `*.test.tsx` and runs here;
 * `npm test` runs both. The two sets are kept apart by path so neither
 * runner picks up the other's files.
 */
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // tsconfig says `jsx: preserve` for Next; esbuild needs to be told to
  // compile it here.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    clearMocks: true,
    unstubGlobals: true,
  },
});
