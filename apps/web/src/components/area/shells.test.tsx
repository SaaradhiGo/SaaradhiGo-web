/**
 * Gate: every driver page renders inside the driver frame (sidebar and DRIVER
 * badge); no rider page shows either (owner, 2026-11-08). The area layouts
 * are the only way a page reaches the screen, so the frames are checked.
 */
import { render } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/LocaleProvider';
import { DriverShell } from './DriverShell';
import { RiderShell } from './RiderShell';

vi.mock('next/navigation', () => ({
  usePathname: () => '/driver',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

const pages = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = path.join(dir, f);
  return statSync(p).isDirectory() ? pages(p) : f === 'page.tsx' ? [p] : [];
});
const APP = path.resolve(__dirname, '../../app');

describe('area frames', () => {
  it('the driver frame has the sidebar and the DRIVER badge', () => {
    const { container } = render(<LocaleProvider><DriverShell><p>x</p></DriverShell></LocaleProvider>);
    expect(container.querySelector('aside.dr-side')).not.toBeNull();
    expect(container.querySelector('.dr-badge')?.textContent).toBe('DRIVER');
  });

  it('the rider frame has neither', () => {
    const { container } = render(<LocaleProvider><RiderShell><p>x</p></RiderShell></LocaleProvider>);
    expect(container.querySelector('.dr-side')).toBeNull();
    expect(container.querySelector('.dr-badge')).toBeNull();
    expect(container.textContent).not.toContain('DRIVER');
  });

  it('every driver page sits under the driver layout, every rider page under the rider one', () => {
    const driver = pages(path.join(APP, '(driver)', 'driver'));
    const rider = pages(path.join(APP, '(rider)', 'rider'));
    expect(driver.length).toBeGreaterThanOrEqual(8);
    expect(rider.length).toBeGreaterThanOrEqual(6);
    expect(readFileSync(path.join(APP, '(driver)', 'driver', 'layout.tsx'), 'utf8')).toContain('<DriverShell>');
    expect(readFileSync(path.join(APP, '(rider)', 'rider', 'layout.tsx'), 'utf8')).toContain('<RiderShell>');
    for (const p of rider) expect(readFileSync(p, 'utf8')).not.toMatch(/DriverShell|dr-badge/);
  });
});
