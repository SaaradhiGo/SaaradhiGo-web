import { describe, expect, it } from 'vitest';
import type { AdminAccess } from './adminScope';
import {
  auditQuery, compareVersions, diffRows, emptyAuditFilters, isMinimumRaise, launchBlockedBy, looksSensitive,
  mayDecide, noticeActiveAt, parseVersion, pendingWords, readinessSummary, resolveFlag, validateFlagKey,
  validateNotice, validateSettingValue, validateVersionSlot, visibleTabs,
} from './platform';

function access(permissions: string[], id = 1): AdminAccess {
  return {
    id, email: 'a@saaradhigo.test', full_name: 'A', is_superuser: false, is_break_glass: false, permissions,
    roles: [], scopes: [], access_model: 'assignments', super_admin_shortfall: 0,
  };
}

describe('tabs follow the capabilities (the link rule)', () => {
  it('shows a Super Admin everything and a role with nothing no tab', () => {
    const all = access(['platform.read', 'platform.settings', 'platform.integrations.read', 'audit.read']);
    expect(visibleTabs(all).map((t) => t.key)).toEqual(
      ['markets', 'flags', 'versions', 'notices', 'settings', 'integrations', 'audit']);
    expect(visibleTabs(access(['trip.read']))).toEqual([]);
    expect(visibleTabs(null)).toEqual([]);
  });

  it('gives City Ops the read tabs and the audit log, not settings or integrations', () => {
    const ops = access(['platform.read', 'platform.city_pause', 'audit.read']);
    expect(visibleTabs(ops).map((t) => t.key)).toEqual(['markets', 'flags', 'versions', 'notices', 'audit']);
  });
});

describe('who may decide a request', () => {
  it('needs approval.check and a different person', () => {
    const req = { maker_id: 7 };
    expect(mayDecide(access(['approval.check'], 8), req)).toBe(true);
    expect(mayDecide(access(['approval.check'], 7), req)).toBe(false);
    expect(mayDecide(access([], 8), req)).toBe(false);
    expect(mayDecide(null, req)).toBe(false);
  });
});

describe('readiness wording', () => {
  it('counts blocking items and warnings', () => {
    expect(readinessSummary({ blocking_count: 2, warning_count: 1, status: 'draft' })).toBe('2 blocking items');
    expect(readinessSummary({ blocking_count: 1, warning_count: 0, status: 'draft' })).toBe('1 blocking item');
    expect(readinessSummary({ blocking_count: 0, warning_count: 2, status: 'draft' })).toBe('Ready, 2 warnings');
    expect(readinessSummary({ blocking_count: 0, warning_count: 0, status: 'live' })).toBe('Ready');
  });

  it('a warning never blocks a launch', () => {
    const items = [
      { key: 'zone', ok: true, status: 'ok' as const, blocking: false, label: 'Zone', detail: '', href: '/zones' },
      { key: 'tax', ok: true, status: 'warning' as const, blocking: false, label: 'Tax', detail: '', href: '' },
      { key: 'fare_card', ok: false, status: 'missing' as const, blocking: true, label: 'Fare cards', detail: '', href: '/pricing' },
    ];
    expect(launchBlockedBy(items).map((i) => i.key)).toEqual(['fare_card']);
    expect(launchBlockedBy(null)).toEqual([]);
  });

  it('describes a pending request in words', () => {
    const base = { id: 1, reason: 'x', maker_label: 'A', maker_id: 1, requested_at: null, expires_at: null };
    expect(pendingWords({ ...base, target: 'X-1', to_status: 'live' })).toBe('Launch X-1');
    expect(pendingWords({ ...base, target: 'X-1', to_status: 'paused' })).toBe('Pause X-1');
    expect(pendingWords({ ...base, kind: 'add_node', node: { kind: 'city', code: 'A-B-C', name: 'Cee' } }))
      .toBe('Add city Cee (A-B-C) as a draft');
  });
});

describe('feature flag resolution', () => {
  const flag = { default_enabled: false, overrides: { 'XX': true, 'XX-AA-BBB': false } as Record<string, boolean> };

  it('city beats country beats default', () => {
    expect(resolveFlag(flag, 'XX-AA-BBB', 'XX')).toEqual({ enabled: false, source: 'city' });
    expect(resolveFlag(flag, 'XX-AA-CCC', 'XX')).toEqual({ enabled: true, source: 'country' });
    expect(resolveFlag(flag, 'YY-AA-CCC', 'YY')).toEqual({ enabled: false, source: 'default' });
    expect(resolveFlag(flag, null, null)).toEqual({ enabled: false, source: 'default' });
  });

  it('validates a key', () => {
    expect(validateFlagKey('good.flag_1')).toBeNull();
    for (const bad of ['Bad', '1abc', 'ab', 'has space', 'x'.repeat(81)]) expect(validateFlagKey(bad)).not.toBeNull();
  });
});

describe('versions', () => {
  it('parses and compares numerically', () => {
    expect(parseVersion('1.4.2+17')).toEqual([1, 4, 2, 0]);
    expect(parseVersion('2')).toEqual([2, 0, 0, 0]);
    expect(parseVersion('abc')).toBeNull();
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('x', '1.0.0')).toBeNull();
  });

  it('only RAISING the minimum needs a checker', () => {
    expect(isMinimumRaise('1.0.0', '1.2.0')).toBe(true);
    expect(isMinimumRaise('1.2.0', '1.2.0')).toBe(false);
    expect(isMinimumRaise('1.2.0', '1.0.0')).toBe(false);
    expect(isMinimumRaise('0.0.0', '0.0.0')).toBe(false);
  });

  it('validates a slot', () => {
    const ok = { minimum: '1.0.0', latest: '1.2.0', storeUrl: 'https://store.test/app', message: '' };
    expect(validateVersionSlot(ok)).toBeNull();
    expect(validateVersionSlot({ ...ok, latest: '0.9.0' })).toMatch(/below the minimum/);
    expect(validateVersionSlot({ ...ok, minimum: 'one' })).toMatch(/minimum/);
    expect(validateVersionSlot({ ...ok, storeUrl: 'http://x.test' })).toMatch(/https/);
  });
});

describe('notices', () => {
  const when = '2026-01-01T10:00:00Z';
  const later = '2026-01-01T12:00:00Z';

  it('validates the message and the window', () => {
    expect(validateNotice({ message: 'Planned work', startsAt: when, endsAt: later })).toBeNull();
    expect(validateNotice({ message: '  ', startsAt: when, endsAt: later })).toMatch(/Write/);
    expect(validateNotice({ message: 'x'.repeat(281), startsAt: when, endsAt: later })).toMatch(/280/);
    expect(validateNotice({ message: '<b>hi</b>', startsAt: when, endsAt: later })).toMatch(/plain text/);
    expect(validateNotice({ message: 'a', startsAt: later, endsAt: when })).toMatch(/after the start/);
    expect(validateNotice({ message: 'a', startsAt: when, endsAt: '2026-06-01T00:00:00Z' })).toMatch(/90 days/);
    expect(validateNotice({ message: 'a', startsAt: '', endsAt: later })).toMatch(/start and an end/);
  });

  it('start is inclusive, end exclusive, cancelled never', () => {
    const n = { starts_at: when, ends_at: later, state: 'active' as const };
    expect(noticeActiveAt(n, new Date(when))).toBe(true);
    expect(noticeActiveAt(n, new Date(later))).toBe(false);
    expect(noticeActiveAt(n, new Date('2026-01-01T09:59:59Z'))).toBe(false);
    expect(noticeActiveAt({ ...n, state: 'cancelled' }, new Date(when))).toBe(false);
  });
});

describe('settings values', () => {
  it('checks each type', () => {
    expect(validateSettingValue('integer', '42')).toBeNull();
    expect(validateSettingValue('integer', '4.5')).not.toBeNull();
    expect(validateSettingValue('decimal', '12.50')).toBeNull();
    expect(validateSettingValue('decimal', 'abc')).not.toBeNull();
    expect(validateSettingValue('boolean', 'Yes')).toBeNull();
    expect(validateSettingValue('boolean', 'maybe')).not.toBeNull();
    expect(validateSettingValue('json', '{"a":1}')).toBeNull();
    expect(validateSettingValue('json', '{broken')).not.toBeNull();
    expect(validateSettingValue('string', 'x'.repeat(2001))).not.toBeNull();
  });

  it('knows a sensitive name', () => {
    for (const k of ['MY_SECRET', 'API_TOKEN', 'DB_PASSWORD', 'SIGNING_KEY', 'VENDOR_CREDENTIAL']) expect(looksSensitive(k)).toBe(true);
    expect(looksSensitive('MAX_RETRIES')).toBe(false);
  });
});

describe('audit helpers', () => {
  it('builds a query from only the filters that have a value', () => {
    expect(auditQuery(emptyAuditFilters())).toBe('');
    expect(auditQuery({ ...emptyAuditFilters(), action: 'zone_changed', city: ' XX-AA-BBB ' }, { page: 2 }))
      .toBe('?action=zone_changed&city=XX-AA-BBB&page=2');
  });

  it('diffs two payloads and flags what changed', () => {
    const rows = diffRows({ a: 1, b: 'same' }, { a: 2, b: 'same', c: [1] });
    expect(rows).toEqual([
      { key: 'a', before: '1', after: '2', changed: true },
      { key: 'b', before: 'same', after: 'same', changed: false },
      { key: 'c', before: '', after: '[1]', changed: true },
    ]);
  });
});
