import { describe, expect, it } from 'vitest';
import { formatCurrentAddress } from './format-current';

describe('formatCurrentAddress', () => {
  it('puts the house number before the street', () => {
    expect(formatCurrentAddress({ houseNo: '901 Demo', street: 'Đường số 15' })).toBe('901 Demo Đường số 15');
  });

  it('is the street alone without a house number', () => {
    expect(formatCurrentAddress({ street: 'Đường Châu Thị Kim' })).toBe('Đường Châu Thị Kim');
    expect(formatCurrentAddress({ houseNo: '  ', street: 'Đường Châu Thị Kim' })).toBe('Đường Châu Thị Kim');
  });

  it('is the house number alone without a street', () => {
    expect(formatCurrentAddress({ houseNo: '12/3', street: null })).toBe('12/3');
  });

  it('collapses spaces and normalizes to NFC', () => {
    expect(formatCurrentAddress({ houseNo: ' 903/9   Demo ', street: 'Đường  Nguyễn An Ninh'.normalize('NFD') })).toBe(
      '903/9 Demo Đường Nguyễn An Ninh',
    );
  });

  it('is null with neither part', () => {
    expect(formatCurrentAddress({})).toBeNull();
  });
});
