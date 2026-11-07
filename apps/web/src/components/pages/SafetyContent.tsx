'use client';

import { Masthead } from './PageShell';
import { usePages } from '@/i18n/usePages';
import { Alert, Lock, Phone, Shield, UserCheck } from '@/components/sg/icons';

/**
 * /safety -- the four safety features that exist, and the emergency line.
 * Fits one screen at 1366x768 (owner, 2026-11-06).
 *
 * EVERY CLAIM WAS CHECKED IN THE BACKEND. The PIN is compared server-side in
 * the trip consumer; the driver's coordinates are broadcast over the trip
 * socket; an SOS raised during a ride is dispatched to the operations
 * console with the trip attached; a driver's documents are approved before
 * they can go online.
 *
 * The emergency line says plainly what does not exist -- no staffed desk, no
 * ride recording, no insurance -- and points to real emergency services
 * first. Implying otherwise is the most harmful thing this page could do.
 */
const ICONS = [Lock, Phone, Shield, UserCheck];

export function SafetyContent() {
  const p = usePages().safety;

  return (
    <>
      <Masthead title={p.title} lead={p.lead} />

      <section className="hp hp-section">
        <ul className="hp-cards hp-cards--4">
          {p.sections.map((s, i) => {
            const Icon = ICONS[i] ?? Shield;
            return (
              <li className="hp-card" key={s.h}>
                <span className="hp-card__icon" aria-hidden="true"><Icon /></span>
                <h2>{s.h}</h2>
                <p>{s.p}</p>
              </li>
            );
          })}
        </ul>

        <div className="hp-emergency" role="note">
          <Alert />
          <p>{p.emergency}</p>
        </div>
      </section>
    </>
  );
}
