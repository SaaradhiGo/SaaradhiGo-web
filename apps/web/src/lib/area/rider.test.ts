import { describe, expect, it } from 'vitest';
import { className, maskPhone, paidFare } from './rider';

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
  it('a completed trip whose fare did not change was paid its fare', () => {
    expect(paidFare({ id: 1, status: 'completed', estimated_fare: '129.00', final_fare: null, fare_breakdown: { total_fare: '129.00' } })).toBe('129.00');
    expect(paidFare({ id: 1, status: 'completed', estimated_fare: '129.00', final_fare: '140.00' })).toBe('140.00');
    expect(paidFare({ id: 1, status: 'completed', estimated_fare: '129.00', rider_payable: '99.00' })).toBe('99.00');
    expect(paidFare({ id: 1, status: 'cancelled', estimated_fare: '129.00' })).toBeNull();
  });
});
