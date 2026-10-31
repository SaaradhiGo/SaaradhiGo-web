/**
 * The Stale trip panel's logic, kept out of the component so it can be tested.
 *
 * The server decides what may be done (`stale_actions` on the trip detail); this
 * only turns that answer into what the panel draws. A button is drawn when the
 * server said the call would be accepted, never otherwise, so the console does
 * not offer an action that will fail.
 */

export type StaleActions = {
  can_resolve: boolean;
  is_stale: boolean;
  mark_reviewed: boolean;
  release_driver: boolean;
  /** A: finished trip, driver still marked busy. B: ghost trip before pickup. C: started trip. */
  release_case: 'A' | 'B' | 'C' | null;
  refusal: { code: string; message: string } | null;
  routes: Array<'safety' | 'support'>;
  reason_min_length: number;
  reason_max_length: number;
};

export type StaleDetail = {
  silent_seconds: number | null;
  last_activity_at: string | null;
  flagged_at: string | null;
  reviewed_at: string | null;
  reviewed_by: { id: number; label: string; role: string } | null;
};

export type StaleStep = 'mark_reviewed' | 'release_driver';

export type PanelModel = {
  /** Draw the panel at all. */
  show: boolean;
  /** The steps to offer as buttons, in order. */
  buttons: StaleStep[];
  /** The server's refusal for a started trip, shown as text with the routes. */
  refusal: { code: string; message: string } | null;
  routes: Array<'safety' | 'support'>;
  /** The operator can see the panel but holds no action (read-only role). */
  readOnly: boolean;
};

export const REASON_MIN = 5;
export const REASON_MAX = 500;

/** What the panel shows for a trip, from the server's `stale` and `stale_actions` answers. */
export function panelModel(
  stale: { is_stale: boolean; reason: string | null } | null | undefined,
  actions: StaleActions | null | undefined,
): PanelModel {
  const hidden: PanelModel = { show: false, buttons: [], refusal: null, routes: [], readOnly: false };
  if (!actions) return hidden;
  const isStale = Boolean(stale?.is_stale);
  // A finished trip whose driver is still marked busy is not "stale" but is offered the repair.
  const repair = actions.release_driver && actions.release_case === 'A';
  if (!isStale && !repair) return hidden;
  const buttons: StaleStep[] = [];
  if (actions.mark_reviewed) buttons.push('mark_reviewed');
  if (actions.release_driver) buttons.push('release_driver');
  return {
    show: true,
    buttons,
    refusal: actions.refusal,
    routes: actions.routes ?? [],
    readOnly: buttons.length === 0 && !actions.refusal,
  };
}

/** "12 minutes", "1 hour 5 minutes": how long the driver has been silent. */
export function silentFor(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return 'unknown';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = `${hours} hour${hours === 1 ? '' : 's'}`;
  if (hours >= 24) return `${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? '' : 's'} ${hours % 24} hour${hours % 24 === 1 ? '' : 's'}`;
  return rest ? `${h} ${rest} minute${rest === 1 ? '' : 's'}` : h;
}

const REASON_WORDS: Record<string, string> = {
  driver_silent: 'The driver has gone quiet',
  driver_silent_long: 'The driver has been quiet for a long time',
  no_acceptance: 'No driver accepted this request',
  no_arrival: 'The driver accepted but has not arrived',
  no_activity_evidence: 'There is no sign of activity on this trip',
};
export function staleReasonText(reason: string | null | undefined): string {
  if (!reason) return 'This trip has stopped progressing';
  return REASON_WORDS[reason] ?? reason.replace(/_/g, ' ');
}

/** null when the reason is acceptable, otherwise what to tell the operator. */
export function reasonProblem(text: string, min = REASON_MIN, max = REASON_MAX): string | null {
  const t = text.trim();
  if (t.length === 0) return 'A reason is required.';
  if (t.length < min) return `Write at least ${min} characters.`;
  if (t.length > max) return `Keep it to ${max} characters or fewer (now ${t.length}).`;
  return null;
}

/** A plain statement of what pressing the button will do, read back before it. */
export function consequence(step: StaleStep, releaseCase: StaleActions['release_case']): string {
  if (step === 'mark_reviewed') {
    return 'The stale flag is cleared and this is recorded as reviewed by you. The trip is not changed. If the driver comes back and goes quiet again, it is flagged again.';
  }
  if (releaseCase === 'A') {
    return 'This trip is already finished, but the driver is still marked busy. The mark is cleared so the driver can take trips again. The trip is not changed.';
  }
  return 'The trip will be cancelled with no charge to the rider and no fee to the driver, and the driver can take trips again.';
}

export type StaleResult = {
  trip_id: number;
  outcome: string;
  case?: string;
  driver_released?: boolean;
};

/** The sentence shown after an action succeeded. */
export function outcomeText(step: StaleStep, result: StaleResult | null | undefined): string {
  if (step === 'mark_reviewed') return 'Marked reviewed. The trip is unchanged.';
  if (!result) return 'Done.';
  if (result.case === 'B') {
    return 'Trip cancelled with no charge to the rider and no fee to the driver. The rider has been told and the driver can take trips again.';
  }
  if (result.outcome === 'repaired_cleared') {
    return 'The driver is no longer marked busy and can take trips again.';
  }
  if (result.outcome === 'repaired_set') {
    return 'The driver has another active trip, so they were not released. Their live state was corrected to match.';
  }
  return 'Done.';
}

/** The refusal or failure shown inline (never a toast that disappears). */
export function failureText(err: unknown): { code: string | null; message: string } {
  const e = err as { fromServer?: boolean; message?: string; code?: string } | null;
  if (e && e.fromServer && e.message) return { code: e.code ?? null, message: e.message };
  return { code: null, message: 'That did not go through. Nothing was changed.' };
}
