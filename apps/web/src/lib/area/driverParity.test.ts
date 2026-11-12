/**
 * App and web show the same document status (13 Nov follow-up): QA driver 59's real checklist
 * (`/driver/requirements/`) through the web's labels and dates must equal what the driver app's
 * test produced from the same fixture (SaaradhiGo-driver test/fixtures/driver59_expected.json).
 */
import { describe, expect, it } from 'vitest';
import expected from './fixtures/driver59_expected.json';
import fixture from './fixtures/driver59_requirements.json';
import { numericDate } from './format';
import { STATUS_LABEL } from './requirements';

type Item = { key: string; status: keyof typeof STATUS_LABEL; expires: string | null };

describe('driver 59: web and app agree', () => {
  it('has the same status label and expiry date for every checklist item', () => {
    const web = Object.fromEntries((fixture.checklist.items as Item[]).map((i) => [i.key, {
      status_label: STATUS_LABEL[i.status],
      expiry_text: i.expires ? numericDate(i.expires, 'dmy') : '',
    }]));
    expect(web).toEqual(expected);
  });
});
