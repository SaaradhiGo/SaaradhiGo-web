import { describe, expect, it } from 'vitest';
import { className, maskPhone } from './rider';

describe('rider helpers', () => {
  it('masks a phone to its last three digits after the country code', () => {
    expect(maskPhone('+919876543210')).toBe('+91 ••••• ••210');
    expect(maskPhone('+15125550199')).toBe('+1 ••••• ••199');
    expect(maskPhone(null)).toBeNull();
  });
  it('names the classes in Latin', () => {
    expect(className('mini')).toBe('Mini');
    expect(className('suv')).toBe('SUV');
    expect(className('hatchback')).toBe('Mini');
  });
});
