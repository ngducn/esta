import { describe, expect, it } from 'vitest';
import { sameAddress } from './same';

describe('sameAddress', () => {
  const printed = '5 Hàng Bạc, Phường Hoàn Kiếm, Hà Nội';

  it('ignores Unicode form, spacing and letter case', () => {
    expect(sameAddress(printed, `  ${printed.normalize('NFD')} `)).toBe(true);
    expect(sameAddress(printed, printed.replace(' ', '  '))).toBe(true);
    expect(sameAddress(printed, printed.toLocaleUpperCase('vi'))).toBe(true);
  });

  it('keeps addresses with different words or numbers apart', () => {
    expect(sameAddress(printed, '6 Hàng Bạc, Phường Hoàn Kiếm, Hà Nội')).toBe(false);
    expect(sameAddress(printed, '5 Hàng Bạc, Phường Hoàn Kiếm')).toBe(false);
  });
});
