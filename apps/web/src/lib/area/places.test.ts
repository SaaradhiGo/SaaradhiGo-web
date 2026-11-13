import { describe, expect, it } from 'vitest';
import { placeLabel, shortPlace } from './places';

describe('short place labels (13 Nov), the same rule as the server', () => {
  it.each([
    ['Charminar, Charminar Road, Char Kaman, Ghansi Bazaar, Hyderabad, Telangana, India', 'Charminar, Ghansi Bazaar'],
    ['Gachibowli Stadium, Gachibowli, Hyderabad, Telangana 500032, India', 'Gachibowli Stadium, Gachibowli'],
    ['Kothaguda Junction, Kondapur, Hyderabad', 'Kothaguda Junction, Kondapur'],
    ['1600 Broadway, New York, NY 10019, USA', '1600 Broadway, New York'],
    ['', ''],
  ])('%s', (address, label) => expect(shortPlace(address)).toBe(label));

  it('prefers the label the server stored', () => {
    expect(placeLabel('Charminar, Ghansi Bazaar', 'anything')).toBe('Charminar, Ghansi Bazaar');
    expect(placeLabel('', 'Kothaguda Junction, Kondapur, Hyderabad')).toBe('Kothaguda Junction, Kondapur');
  });
});
