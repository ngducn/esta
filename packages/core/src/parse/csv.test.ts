import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';

describe('parseCsv', () => {
  it('reads rows and keeps every cell as text', () => {
    expect(parseCsv('Mã,Giá mua\nDEMOGV,"3,2 tỷ"\nDEMOBT,2500000000\n')).toEqual([
      ['Mã', 'Giá mua'],
      ['DEMOGV', '3,2 tỷ'],
      ['DEMOBT', '2500000000'],
    ]);
  });

  it('reads the semicolons Excel writes on a Vietnamese system, with a byte order mark and CRLF', () => {
    expect(parseCsv('﻿Mã;Giá mua;Ghi chú\r\nDEMOGV;3,2 tỷ;\r\n')).toEqual([
      ['Mã', 'Giá mua', 'Ghi chú'],
      ['DEMOGV', '3,2 tỷ', ''],
    ]);
  });

  it('reads tabs when the header is tab separated', () => {
    expect(parseCsv('Mã\tTên\nDEMOGV\tNhà Demo, Gò Vấp')).toEqual([
      ['Mã', 'Tên'],
      ['DEMOGV', 'Nhà Demo, Gò Vấp'],
    ]);
  });

  it('keeps a delimiter, a line break and a doubled quote inside a quoted cell', () => {
    expect(parseCsv('a,b\n"Nhà ""Demo""","dòng 1\ndòng 2"\n')).toEqual([
      ['a', 'b'],
      ['Nhà "Demo"', 'dòng 1\ndòng 2'],
    ]);
  });

  it('chooses the delimiter from the header alone, outside quotes', () => {
    expect(parseCsv('"a;b",c\n1;2,3')).toEqual([
      ['a;b', 'c'],
      ['1;2', '3'],
    ]);
  });

  it('reads an empty file as no rows and keeps an empty line as one empty cell', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('a\n\nb')).toEqual([['a'], [''], ['b']]);
  });
});
