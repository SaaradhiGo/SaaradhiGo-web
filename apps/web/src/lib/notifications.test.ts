import { describe, expect, it } from 'vitest';
import {
  detectVariables, dltMappingProblems, dltSlotCount, emptyRegistration, failureRate, funnelLines,
  hoursWords, logQuery, parseNames, placeholdersOf, registrationProblems, renderPreview,
  smsSegments, toDltText, validateCopy, type Funnel,
} from './notifications';

const copy = (over: Partial<Parameters<typeof validateCopy>[0]> = {}) => ({
  body: 'Hi {name}', subject: '', title: '', variables: ['name'], personal: [], ...over,
});

describe('placeholders', () => {
  it('lists names in order with repeats, and ignores everything that is not a placeholder', () => {
    expect(placeholdersOf('A {x} B {y} C {x}')).toEqual(['x', 'y', 'x']);
    expect(placeholdersOf('{Upper} {1bad} {} {ok_1}')).toEqual(['ok_1']);
    expect(placeholdersOf(null)).toEqual([]);
    expect(placeholdersOf('{#var#}')).toEqual([]);
  });

  it('detects each variable once across body, subject and title', () => {
    expect(detectVariables('Hi {name} {city}', 'About {city}', '{name}')).toEqual(['name', 'city']);
  });

  it('parses a typed list of names, commas or spaces, no duplicates', () => {
    expect(parseNames('name, city  name\nfare')).toEqual(['name', 'city', 'fare']);
    expect(parseNames('  ')).toEqual([]);
  });
});

describe('template variable validation', () => {
  it('accepts copy whose placeholders are all declared and used', () => {
    expect(validateCopy(copy())).toEqual([]);
  });

  it('names the undeclared variable and where it is used', () => {
    const problems = validateCopy(copy({ body: 'Hi {name} {extra}', subject: 'Re {more}' }));
    expect(problems).toContain('The body uses undeclared variables: extra.');
    expect(problems).toContain('The subject uses undeclared variables: more.');
  });

  it('flags a variable declared but never used', () => {
    expect(validateCopy(copy({ variables: ['name', 'spare'] }))).toEqual(['Declared but never used: spare.']);
  });

  it('counts a variable used only in the title or subject as used', () => {
    expect(validateCopy(copy({ body: 'Hello', variables: ['name'], title: 'Hi {name}' }))).toEqual([]);
  });

  it('rejects a malformed name, a duplicate and a stray brace', () => {
    expect(validateCopy(copy({ variables: ['Name'], body: 'x' }))).toContain(
      'Variable name "Name" must be lowercase letters, digits and underscores.');
    expect(validateCopy(copy({ variables: ['name', 'name'] }))).toContain('Declared variables contain duplicates.');
    expect(validateCopy(copy({ body: 'Hi {name' }))).toContain('The body has a stray brace or a malformed placeholder.');
    expect(validateCopy(copy({ body: 'Hi {Name}', variables: [] }))).toContain(
      'The body has a stray brace or a malformed placeholder.');
  });

  it('refuses a DLT slot written into the body and an empty or oversized body', () => {
    expect(validateCopy(copy({ body: 'Pay {#var#}', variables: [] }))[0]).toContain('uses {#var#}');
    expect(validateCopy(copy({ body: '   ', variables: [] }))).toContain('The body is empty.');
    expect(validateCopy(copy({ body: 'x'.repeat(2001), variables: [] }))[0]).toContain('longer than 2000');
  });

  it('requires personal variables to be declared', () => {
    expect(validateCopy(copy({ personal: ['ghost'] }))).toContain(
      'Personal variables must be declared variables: ghost.');
    expect(validateCopy(copy({ personal: ['name'] }))).toEqual([]);
  });
});

describe('the preview renderer', () => {
  it('substitutes sample values and leaves unknowns visible, listing them once', () => {
    expect(renderPreview('Hi {name}, {name} again {city}', { name: 'Asha' })).toEqual({
      text: 'Hi Asha, Asha again {city}', missing: ['city'] });
  });

  it('treats an empty sample value as missing, not as an empty string', () => {
    expect(renderPreview('Hi {name}', { name: '' })).toEqual({ text: 'Hi {name}', missing: ['name'] });
  });

  it('caps a long value the way the server does and keeps text without placeholders as is', () => {
    expect(renderPreview('{x}', { x: 'a'.repeat(500) }).text).toHaveLength(300);
    expect(renderPreview('Plain', {})).toEqual({ text: 'Plain', missing: [] });
    expect(renderPreview(undefined, {})).toEqual({ text: '', missing: [] });
  });

  it('does not re-expand a value that itself looks like a placeholder', () => {
    expect(renderPreview('{a}', { a: '{b}', b: 'x' }).text).toBe('{b}');
  });
});

describe('SMS segments', () => {
  it('counts GSM-7 at 160 and 153 per part, and Unicode at 70 and 67', () => {
    expect(smsSegments('')).toEqual({ chars: 0, segments: 0, unicode: false });
    expect(smsSegments('a'.repeat(160))).toEqual({ chars: 160, segments: 1, unicode: false });
    expect(smsSegments('a'.repeat(161))).toEqual({ chars: 161, segments: 2, unicode: false });
    expect(smsSegments('अ'.repeat(70)).segments).toBe(1);
    expect(smsSegments('अ'.repeat(71))).toMatchObject({ segments: 2, unicode: true });
  });
});

describe('India DLT mapping', () => {
  const text = 'SaaradhiGo: pay {#var#} by {#var#}.';

  it('turns placeholders into slots and counts them', () => {
    expect(toDltText('SaaradhiGo: pay {amount} by {date}.')).toBe(text);
    expect(dltSlotCount(text)).toBe(2);
  });

  it('accepts a body that maps one to one, ignoring whitespace', () => {
    expect(dltMappingProblems('SaaradhiGo:  pay {amount}\nby {date}.', text)).toEqual([]);
  });

  it('refuses a different slot count and different fixed words, with the reason', () => {
    expect(dltMappingProblems('SaaradhiGo: pay {amount}.', text)[0]).toContain('1 placeholder(s) but the DLT text has 2');
    expect(dltMappingProblems('Please pay {amount} by {date}.', text)[0]).toContain('does not match the DLT-approved text');
    expect(dltMappingProblems('x', '  ')).toEqual(['No DLT-approved text is recorded for this template.']);
  });

  it('refuses to activate an India SMS without DLT id, sender id or flow id, naming each', () => {
    const body = 'SaaradhiGo: pay {amount} by {date}.';
    const none = registrationProblems('sms', 'IN', body, null);
    expect(none[0].code).toBe('DLT_REGISTRATION_REQUIRED');
    expect(none[0].message).toBe(
      'An India SMS template cannot be activated without its DLT template ID and sender ID and msg91 flow ID registered for msg91. Add the registration, then submit again.');
    const partial = registrationProblems('sms', 'IN', body, {
      ...emptyRegistration(), dlt_template_id: 'DLT-1', registered_text: text });
    expect(partial[0].message).toContain('sender ID and msg91 flow ID');
    expect(partial.some((p) => p.code === 'DLT_PLACEHOLDER_MISMATCH')).toBe(false);
  });

  it('is clear to go when the three ids are present and the text maps', () => {
    const reg = { ...emptyRegistration(), dlt_template_id: 'DLT-1', sender_id: 'SGOTST',
      provider_template_id: 'flow-1', registered_text: text };
    expect(registrationProblems('sms', 'IN', 'SaaradhiGo: pay {amount} by {date}.', reg)).toEqual([]);
    expect(registrationProblems('sms', 'IN', 'SaaradhiGo: pay {amount}.', reg)[0].code).toBe('DLT_PLACEHOLDER_MISMATCH');
  });

  it('asks nothing of a US SMS, an email or a push, and a name of a WhatsApp template', () => {
    expect(registrationProblems('sms', 'US', 'x', null)).toEqual([]);
    expect(registrationProblems('email', 'IN', 'x', null)).toEqual([]);
    expect(registrationProblems('whatsapp', 'IN', 'x', null)[0].code).toBe('WHATSAPP_REGISTRATION_REQUIRED');
    expect(registrationProblems('whatsapp', 'IN', 'x', {
      ...emptyRegistration(), whatsapp_template_name: 'notice' })).toEqual([]);
  });
});

describe('words and queries', () => {
  const funnel: Funnel = {
    total: 10, not_opted_in: 4, unreachable_on_channel: 1, reachable: 5, held_by_quiet_hours: 2,
    send_now: 3, quiet_hours: [21, 10], earliest_release_at: null, channel: 'push',
  };

  it('explains the audience funnel, naming quiet hours only when something is held', () => {
    const lines = funnelLines(funnel);
    expect(lines[0]).toBe('10 in the audience');
    expect(lines).toContain('5 will receive it');
    expect(lines.at(-1)).toContain('2 of those are held by quiet hours (21:00 to 10:00');
    expect(funnelLines({ ...funnel, held_by_quiet_hours: 0, not_opted_in: 0, unreachable_on_channel: 0 }))
      .toEqual(['10 in the audience', '5 will receive it']);
  });

  it('formats hours, failure rates and the log query', () => {
    expect(hoursWords([21, 10])).toBe('21:00 to 10:00');
    expect(hoursWords(undefined)).toBe('—');
    expect(failureRate({ recent_total: 0, recent_failed: 0 })).toBe('—');
    expect(failureRate({ recent_total: 8, recent_failed: 2 })).toBe('25%');
    expect(logQuery({ status: '', channel: '', provider: '', template: '', userId: '' })).toBe('');
    expect(logQuery({ status: 'failed', channel: 'sms', provider: '', template: ' a.b ', userId: '7' }))
      .toBe('&status=failed&channel=sms&template=a.b&user_id=7');
  });
});
