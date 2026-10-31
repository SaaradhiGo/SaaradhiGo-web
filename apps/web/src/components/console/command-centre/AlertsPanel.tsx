'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { OperatorAlert, acknowledgeAlert, alertMeasure, messageFor } from '@/lib/commandCentre';
import type { Remote } from '@/lib/useCommandCentre';
import type { AlertsPage } from '@/lib/commandCentre';
import { AdminAccess, can } from '@/lib/adminScope';
import { canOpen } from '@/lib/consoleLinks';
import { stamp } from '@/lib/consoleTime';
import { Empty, ErrorState, Panel, Pill, Skeleton } from '@/components/console/ui';

/**
 * Open operator alerts: what a threshold or an unroutable SOS raised and
 * nobody has taken yet.
 *
 * Each row says the severity in a word, the city, the metric, the value
 * against its line, and when it was raised in the CITY's clock. The
 * Acknowledge button appears only when the operator holds the capability
 * the server named for that kind (`ack_permission`); the server asks the
 * same question again, so the button is a convenience, not the control.
 *
 * The count is announced through an `aria-live` region when it changes,
 * so a screen-reader user hears "3 open alerts" without the page being
 * re-read.
 */
export function AlertsPanel({
  alerts,
  access,
  timeZones,
  onChanged,
}: {
  alerts: Remote<AlertsPage>;
  access: AdminAccess | null;
  /** City code -> IANA zone, from the overview, so a stamp is local. */
  timeZones: Record<string, string>;
  onChanged?: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const lastCount = useRef<number | null>(null);

  const count = alerts.data?.open_count ?? null;
  useEffect(() => {
    if (count === null || count === lastCount.current) return;
    lastCount.current = count;
    setAnnounce(count === 0 ? 'No alerts open' : `${count} open alert${count === 1 ? '' : 's'}`);
  }, [count]);

  if (alerts.status === 'forbidden') {
    return (
      <p className="ops-cc-note" role="note">
        Alerts are not part of your access.
      </p>
    );
  }

  async function take(alert: OperatorAlert) {
    setBusy(alert.id);
    setFailure(null);
    try {
      await acknowledgeAlert(alert.id, 'Taken from the Command Centre');
      alerts.reload();
      onChanged?.();
    } catch (err) {
      setFailure(messageFor(err, `Alert #${alert.id} could not be acknowledged.`));
    } finally {
      setBusy(null);
    }
  }

  const title = count === null ? 'Alerts' : `Alerts · ${count} open`;

  return (
    <Panel title={title} flush>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announce}</div>
      {alerts.status === 'loading' && !alerts.data ? (
        <div className="ops-skel-rows" aria-busy="true">
          <span className="sr-only">Loading alerts</span>
          <Skeleton kind="row" count={3} />
        </div>
      ) : alerts.status === 'error' && !alerts.data ? (
        <ErrorState title="Alerts could not be loaded" detail={alerts.error ?? undefined} onRetry={alerts.reload} />
      ) : !alerts.data || alerts.data.results.length === 0 ? (
        <Empty title="No open alerts" detail="Thresholds are being checked every minute." />
      ) : (
        <ul className="ops-cc-alerts" aria-busy={alerts.refreshing || undefined}>
          {failure ? <li className="ops-cc-alert__fail" role="alert">{failure}</li> : null}
          {alerts.data.results.map((a) => {
            const tz = a.city ? timeZones[a.city] : undefined;
            const measure = alertMeasure(a);
            const allowed = a.ack_permission ? can(access, a.ack_permission) : false;
            const tone = a.severity === 'critical' ? 'bad' : a.severity === 'warning' ? 'wait' : 'neutral';
            return (
              <li key={a.id} className={`ops-cc-alert ops-cc-alert--${a.severity}`}>
                <Pill tone={tone}>{a.severity}</Pill>
                <div className="ops-cc-alert__text">
                  <b>{a.payload.metric_label ?? a.title}</b>
                  <span>
                    {a.city_name ?? a.payload.city_name ?? 'No city'}
                    {measure ? <> · <span className="sg-num">{measure}</span></> : null}
                    {a.payload.window && a.payload.window !== 'now' ? ` · over ${a.payload.window}` : ''}
                    {' · '}
                    <time dateTime={a.created_at}>{stamp(a.created_at, tz)}</time>
                    {a.kind.startsWith('fraud.') && typeof a.payload.path === 'string' && canOpen(access, 'fraud') ? (
                      <> · <Link href={a.payload.path}>Open in Fraud &amp; Risk</Link></>
                    ) : null}
                  </span>
                </div>
                {allowed ? (
                  <button
                    type="button"
                    className="sg-btn sg-btn--secondary sg-btn--sm"
                    disabled={busy === a.id}
                    aria-label={`Acknowledge alert: ${a.title}`}
                    onClick={() => void take(a)}
                  >
                    {busy === a.id ? 'Taking…' : 'Acknowledge'}
                  </button>
                ) : (
                  <span className="ops-cc-alert__who">
                    {a.ack_permission ? `for ${a.ack_permission.split('.')[0]}` : 'not acknowledgeable'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
