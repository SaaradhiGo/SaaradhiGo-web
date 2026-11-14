import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AdminAccess, SCOPE_KEY, selectedMarket } from '@/lib/adminScope';
import { ConsoleLegalLine } from './ConsoleLegalLine';

const scope = (code: string, kind: string, path: string) => ({ code, name: code, kind, status: 'active', depth: path.split('/').length - 2, path });
const access = (scopes: ReturnType<typeof scope>[], model: AdminAccess['access_model'] = 'assignments'): AdminAccess => ({
  id: 1, email: 'a@x.test', full_name: 'A', is_superuser: false, is_break_glass: false, permissions: [], roles: [],
  access_model: model, super_admin_shortfall: 0, scopes,
});
const WORLD = access([scope('GLOBAL', 'global', 'GLOBAL/'), scope('IN', 'country', 'GLOBAL/IN/'),
  scope('US', 'country', 'GLOBAL/US/'), scope('US-TX-AUS', 'city', 'GLOBAL/US/US-TX/US-TX-AUS/')]);

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('the console footer follows the market switch', () => {
  it('names DeepTrics LLC with United States selected', () => {
    window.localStorage.setItem(SCOPE_KEY, 'US');
    render(<ConsoleLegalLine access={WORLD} />);
    expect(screen.getByTestId('legal-line').textContent).toContain('Operated by DeepTrics LLC.');
    expect(screen.getByTestId('legal-line').textContent).not.toContain('Pvt Ltd');
  });

  it('a US city belongs to the US company', () => {
    window.localStorage.setItem(SCOPE_KEY, 'US-TX-AUS');
    expect(selectedMarket(WORLD)).toBe('US');
  });

  it('names the India company with India selected', () => {
    window.localStorage.setItem(SCOPE_KEY, 'IN');
    render(<ConsoleLegalLine access={WORLD} />);
    expect(screen.getByTestId('legal-line').textContent).toContain('Operated by DeepTrics Software Solutions Pvt Ltd.');
  });

  it('names both companies on Global, and when everything held spans both markets', () => {
    window.localStorage.setItem(SCOPE_KEY, 'GLOBAL');
    render(<ConsoleLegalLine access={WORLD} />);
    const text = screen.getByTestId('legal-line').textContent ?? '';
    expect(text).toContain('DeepTrics Software Solutions Pvt Ltd (India)');
    expect(text).toContain('DeepTrics LLC (United States)');
    window.localStorage.removeItem(SCOPE_KEY);
    expect(selectedMarket(WORLD)).toBeNull();
    expect(selectedMarket(access([], 'legacy_unscoped'))).toBeNull();
  });

  it('an operator who holds only the US sees the US company without choosing', () => {
    expect(selectedMarket(access([scope('US', 'country', 'GLOBAL/US/')]))).toBe('US');
  });
});
