import { describe, expect, it } from 'vitest';
import { defaultDocumentTitle, placeName } from './title';

describe('defaultDocumentTitle', () => {
  it.each([
    ['Đất vườn Long An', 'Sổ hồng Long An'],
    ['Đất Bảo Lộc', 'Sổ hồng Bảo Lộc'],
    ['Căn hộ Thủ Đức', 'Sổ hồng Thủ Đức'],
    ['Nhà phố Q7', 'Sổ hồng Q7'],
    ['Kho Biên Hòa', 'Sổ hồng Biên Hòa'],
  ])('names %s by its place', (nickname, title) => {
    expect(defaultDocumentTitle('Sổ hồng', nickname)).toBe(title);
  });

  it('keeps a nickname that is only a kind word, or has none', () => {
    expect(placeName('Nhà')).toBe('Nhà');
    expect(placeName('Nhàn Cư')).toBe('Nhàn Cư');
    expect(placeName('Villa Đà Lạt')).toBe('Villa Đà Lạt');
  });

  it('uses the prefix alone without a property', () => {
    expect(defaultDocumentTitle('CCCD', null)).toBe('CCCD');
  });
});
