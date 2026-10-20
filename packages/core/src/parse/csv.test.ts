import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

const read = (...cells: string[]) => ({ ok: true, value: cells });
const refused = (reason: string) => ({ ok: false, reason });

describe('parseCsv one record per line, as a bank statement reads', () => {
  const perLine = (text: string) => parseCsv(text, { spanLines: false });

  it('reads comma-separated rows with a BOM, CRLF line ends and a trailing newline', () => {
    expect(perLine('\uFEFFa,b\r\n1,2\r\n')).toEqual([read('a', 'b'), read('1', '2')]);
  });

  it('keeps delimiters and doubled quotes inside quoted fields', () => {
    expect(perLine('x,y\n"3,500,000","he said ""hi"", then left"')).toEqual([read('x', 'y'), read('3,500,000', 'he said "hi", then left')]);
  });

  it('refuses a quoted field that would span a line break, then reads the next line as its own record', () => {
    expect(perLine('x,y\n"3,500,000","he said ""hi""\nthen left"')).toEqual([read('x', 'y'), refused('unterminated_quote'), refused('stray_quote')]);
    expect(perLine('a,b\r\n1,"open\r\n2,x\r\n3,"y"\r\n')).toEqual([read('a', 'b'), refused('unterminated_quote'), read('2', 'x'), read('3', 'y')]);
  });

  it('returns one record per line, whatever quotes the lines hold', () => {
    const line = fc.string({ unit: fc.constantFrom('"', ',', ';', '\t', ' ', 'a', '7') });
    fc.assert(
      fc.property(fc.array(line, { minLength: 1, maxLength: 12 }), fc.constantFrom('\n', '\r\n'), (lines, end) => {
        expect(perLine(lines.map((text) => text + end).join(''))).toHaveLength(lines.length);
      }),
      { seed: 20261017, numRuns: 1000 },
    );
  });

  it.each([
    ['semicolons', 'a;b;c\n1;2;3', read('1', '2', '3')],
    ['tabs', 'a\tb\tc\n1\t2\t3', read('1', '2', '3')],
    ['commas when all three appear', 'a,b;c\td\n1,2;3\t4', read('1', '2;3\t4')],
  ])('detects %s from the first line', (_label, text, secondRecord) => {
    expect(perLine(text)[1]).toEqual(secondRecord);
  });

  it('returns no records for empty text and keeps empty fields', () => {
    expect(perLine('')).toEqual([]);
    expect(perLine('a,,c\n,,\n')).toEqual([read('a', '', 'c'), read('', '', '')]);
  });

  it('opens a quoted field only at the start of a field, and refuses a record with a quote anywhere else', () => {
    expect(perLine('a,b\r\n1,CK "PHONG 5\r\n2,x\r\n')).toEqual([read('a', 'b'), refused('stray_quote'), read('2', 'x')]);
    expect(perLine('a,b\n"1"2,x\n3,y')).toEqual([read('a', 'b'), refused('stray_quote'), read('3', 'y')]);
    expect(perLine('a,b\n1, "x"\n')).toEqual([read('a', 'b'), refused('stray_quote')]);
  });

  it('refuses a record whose quote never closes and reads on from the next line', () => {
    expect(perLine('a,b\n1,"open\r\n2,x\n3,y\n')).toEqual([read('a', 'b'), refused('unterminated_quote'), read('2', 'x'), read('3', 'y')]);
  });
});

describe('parseCsv with records that span lines, as a spreadsheet reads', () => {
  const spanning = (text: string) => parseCsv(text, { spanLines: true });

  it('reads rows and keeps every cell as text', () => {
    expect(spanning('Mã,Giá mua\nDEMOGV,"3,2 tỷ"\nDEMOBT,2500000000\n')).toEqual([read('Mã', 'Giá mua'), read('DEMOGV', '3,2 tỷ'), read('DEMOBT', '2500000000')]);
  });

  it('reads the semicolons Excel writes on a Vietnamese system, with a byte order mark and CRLF', () => {
    expect(spanning('\uFEFFMã;Giá mua;Ghi chú\r\nDEMOGV;3,2 tỷ;\r\n')).toEqual([read('Mã', 'Giá mua', 'Ghi chú'), read('DEMOGV', '3,2 tỷ', '')]);
  });

  it('reads tabs when the header is tab separated', () => {
    expect(spanning('Mã\tTên\nDEMOGV\tNhà Demo, Gò Vấp')).toEqual([read('Mã', 'Tên'), read('DEMOGV', 'Nhà Demo, Gò Vấp')]);
  });

  it('keeps a delimiter, a line break and a doubled quote inside a quoted cell', () => {
    expect(spanning('a,b\n"Nhà ""Demo""","dòng 1\ndòng 2"\n')).toEqual([read('a', 'b'), read('Nhà "Demo"', 'dòng 1\ndòng 2')]);
    expect(spanning('x,y\n"3,500,000","he said ""hi""\nthen left"')).toEqual([read('x', 'y'), read('3,500,000', 'he said "hi"\nthen left')]);
  });

  it('chooses the delimiter from the first line alone', () => {
    expect(spanning('a,b\n1;2;3;4,5')).toEqual([read('a', 'b'), read('1;2;3;4', '5')]);
  });

  it('reads an empty file as no records and keeps an empty line as one empty cell', () => {
    expect(spanning('')).toEqual([]);
    expect(spanning('a\n\nb')).toEqual([read('a'), read(''), read('b')]);
  });

  it('still refuses a quote inside a field, and a quote that never closes', () => {
    expect(spanning('a,b\n1,CK "PHONG 5\n2,x\n')).toEqual([read('a', 'b'), refused('stray_quote'), read('2', 'x')]);
    expect(spanning('a,b\n1,"open\n2,x\n')).toEqual([read('a', 'b'), refused('unterminated_quote'), read('2', 'x')]);
  });
});
