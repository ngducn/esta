import { describe, expect, it } from 'vitest';
import { visibleText } from './visible-text';

describe('visibleText for a copy (#351)', () => {
  const zalo = ['Chào anh Em,', '', 'Tiền thuê **Phòng 5** đến hạn ngày 25/09/2026.', '', '- Chuyển khoản', '- Tiền mặt', '', '> Cảm ơn anh.'].join('\n');

  it('keeps the blank line between paragraphs, so a pasted Zalo draft keeps its paragraphs', () => {
    expect(visibleText(zalo, { paragraphs: true })).toBe(['Chào anh Em,', '', 'Tiền thuê Phòng 5 đến hạn ngày 25/09/2026.', '', 'Chuyển khoản', 'Tiền mặt', '', 'Cảm ơn anh.'].join('\n'));
  });

  it('keeps a table one row per line', () => {
    expect(visibleText('Tháng 9:\n\n| Phòng | Còn nợ |\n| --- | --- |\n| Phòng 5 | 2.800.000 ₫ |', { tables: true, paragraphs: true })).toBe('Tháng 9:\n\nPhòng | Còn nợ\nPhòng 5 | 2.800.000 ₫');
  });

  it('reads one block per line for the guard, as before', () => {
    expect(visibleText(zalo)).toBe('Chào anh Em,\nTiền thuê Phòng 5 đến hạn ngày 25/09/2026.\nChuyển khoản\nTiền mặt\nCảm ơn anh.');
  });
});
