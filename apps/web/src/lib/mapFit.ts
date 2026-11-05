/** Padding that keeps the route clear of the booking panel (desktop) or sheet (phone). */
export type FitPadding = { top: number; right: number; bottom: number; left: number };

const BASE = 48;
const DESKTOP_MIN_WIDTH = 768;

export function fitPadding(args: {
  viewportWidth: number;
  panelWidth: number;
  panelLeft: number;
  sheetHeight: number;
}): FitPadding {
  if (args.viewportWidth >= DESKTOP_MIN_WIDTH) {
    // panel width + its left gutter + 32px of air before the route starts
    return { top: BASE, right: BASE, bottom: BASE, left: args.panelWidth + args.panelLeft + 32 };
  }
  // 56px clears the destination marker and its glow above the sheet edge.
  return { top: BASE, right: 24, bottom: args.sheetHeight + 56, left: 24 };
}
