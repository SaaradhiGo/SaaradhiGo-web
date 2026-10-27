/**
 * What `./LoginPreview` resolves to in every build made WITHOUT
 * `NEXT_PUBLIC_CONSOLE_PREVIEW=true` -- see next.config.js. Same export,
 * renders nothing, imports nothing. The real component, its stylesheet and
 * its marker string never enter the module graph, so the production
 * bundle cannot contain them; scripts/check-no-preview.mjs asserts that.
 */
export function LoginPreview(_: { current: string }) {
  return null;
}
