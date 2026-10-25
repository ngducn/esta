import { describe, expect, it } from 'vitest';
import { checkNote, MAX_NOTE_LENGTH } from './index';

const SHEET = new Map([['f1', { day_display: '05', count_display: '12' }]]);

describe('an answer, read with its GFM tables', () => {
  const answer = (template: string) => checkNote(template, SHEET, 'markdown-tables');

  it.each(['| Tài sản | Đã thu |\n| --- | --- |\n| [Dĩ An](q|25) |', '| Tài sản | Còn lại |\n| --- | --- |\n| [Thủ Đức](<x|25 ngày>) |'])(
    'rejects %j, whose cell shows the number after a pipe in a link target',
    (template) => {
      const result = answer(template);
      expect(!result.ok && result.reason.map((v) => v.rule)).toEqual(['number']);
      expect(checkNote(template, SHEET, 'markdown').ok, 'a note without tables reads it as a link and shows no number').toBe(true);
    },
  );

  it('reads values in neighbouring cells apart, so they never read as one number', () => {
    const result = answer('| Ngày | Còn lại |\n| --- | --- |\n| {{f1.day_display}} | {{f1.count_display}} ngày |');
    expect(result.ok && result.value.text).toBe('| Ngày | Còn lại |\n| --- | --- |\n| 05 | 12 ngày |');
  });

  it('counts only the template against its limit when the links are resolved', () => {
    const template = 'Xem [sổ](f1). '.repeat(60);
    const linked = template.replaceAll('](f1)', `](esta://ledger/${'0'.repeat(8)}-0000-4000-8000-${'0'.repeat(12)})`);
    expect(linked.length).toBeGreaterThan(MAX_NOTE_LENGTH);
    const result = checkNote(template, SHEET, 'markdown-tables', linked);
    expect(result.ok && result.value).toMatchObject({ text: linked, template });
  });
});
