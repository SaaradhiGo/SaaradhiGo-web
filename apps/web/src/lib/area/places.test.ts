import { describe, expect, it } from 'vitest';
import { placeLabel, shortPlace, suggestionLines } from './places';

describe('short place labels (13 Nov), the same rule as the server', () => {
  it.each([
    ['Charminar, Charminar Road, Char Kaman, Ghansi Bazaar, Hyderabad, Telangana, India', 'Charminar, Ghansi Bazaar'],
    ['Gachibowli Stadium, Gachibowli, Hyderabad, Telangana 500032, India', 'Gachibowli Stadium, Gachibowli'],
    ['Kothaguda Junction, Kondapur, Hyderabad', 'Kothaguda Junction, Kondapur'],
    ['1600 Broadway, New York, NY 10019, USA', '1600 Broadway, New York'],
    ['', ''],
    // 14 Nov: a house number is not the place name.
    ['10, Hitech City Rd, HITEC City, Hyderabad, Telangana 500081, India', 'Hitech City Rd, HITEC City'],
    ['7-1-28, Ameerpet, Hyderabad, Telangana 500016, India', 'Ameerpet, Hyderabad'],
  ])('%s', (address, label) => expect(shortPlace(address)).toBe(label));

  it('prefers the label the server stored', () => {
    expect(placeLabel('Charminar, Ghansi Bazaar', 'anything')).toBe('Charminar, Ghansi Bazaar');
    expect(placeLabel('', 'Kothaguda Junction, Kondapur, Hyderabad')).toBe('Kothaguda Junction, Kondapur');
  });
});

describe('place suggestions as two lines (14 Nov)', () => {
  it('name, then the area without state or country; the field keeps the short text', () => {
    const p = { description: 'Cyber Towers - HITEC City, Hyderabad, Telangana, India', place_id: 'x',
      structured_formatting: { main_text: 'Cyber Towers', secondary_text: 'HITEC City, Hyderabad, Telangana, India' } };
    expect(suggestionLines(p)).toEqual({ name: 'Cyber Towers', area: 'HITEC City, Hyderabad', short: 'Cyber Towers, HITEC City' });
  });
  it('works from the description alone', () => {
    expect(suggestionLines({ description: 'Charminar, Ghansi Bazaar, Hyderabad, Telangana 500002, India' }))
      .toEqual({ name: 'Charminar', area: 'Ghansi Bazaar, Hyderabad', short: 'Charminar, Ghansi Bazaar' });
    expect(suggestionLines({ description: 'Hyderabad' })).toEqual({ name: 'Hyderabad', area: '', short: 'Hyderabad' });
  });
});
