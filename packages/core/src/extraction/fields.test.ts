import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { certificateV1Schema } from '../agent-schemas/certificate_v1';
import { utilityBillV1Schema } from '../agent-schemas/utility_bill_v1';
import truthFile from '../../../../fixtures/certificates/gcn_2024-photo/truth.json';
import { EXTRACTION_FIELDS, INPUT_KINDS, readInput, reviewFields } from './fields';

type Shape = { readonly shape: Record<string, z.ZodType> };

/** Every `{ value, confidence, page }` leaf of a schema, lists written `[]`, read from the zod shape itself. */
function leafPaths(schema: z.ZodType, prefix = ''): string[] {
  const def = (schema as unknown as { def: { type: string; element?: z.ZodType; innerType?: z.ZodType } }).def;
  if (def.type === 'optional' && def.innerType !== undefined) return leafPaths(def.innerType, prefix);
  if (def.type === 'array' && def.element !== undefined) return leafPaths(def.element, `${prefix}[]`);
  if (def.type !== 'object') return [];
  const shape = (schema as unknown as Shape).shape;
  if ('value' in shape && 'confidence' in shape && 'page' in shape) return [prefix];
  return Object.entries(shape).flatMap(([key, child]) => leafPaths(child, prefix === '' ? key : `${prefix}.${key}`));
}

describe('EXTRACTION_FIELDS', () => {
  it.each([
    ['certificate_v1', certificateV1Schema],
    ['utility_bill_v1', utilityBillV1Schema],
  ] as const)('has exactly one descriptor per leaf of %s', (name, schema) => {
    const paths = EXTRACTION_FIELDS[name].map((descriptor) => descriptor.path);
    expect(paths.toSorted()).toEqual(leafPaths(schema).toSorted());
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every reviewed field a message key and every required field a target', () => {
    for (const descriptor of [...EXTRACTION_FIELDS.certificate_v1, ...EXTRACTION_FIELDS.utility_bill_v1]) {
      expect(descriptor.label).toMatch(/^[a-z][A-Za-z0-9]*$/);
      if (descriptor.required) expect(descriptor.target).not.toBeNull();
    }
  });
});

describe('INPUT_KINDS', () => {
  it('reads areas with a decimal comma, dates as printed, and terms', () => {
    expect(INPUT_KINDS.area.parse('125,5')).toEqual({ ok: true, value: 125.5 });
    expect(INPUT_KINDS.area.parse('125,5 m²')).toEqual({ ok: true, value: 125.5 });
    expect(INPUT_KINDS.area.parse('một trăm')).toEqual({ ok: false });
    expect(INPUT_KINDS.date.parse('05/11/2024')).toEqual({ ok: true, value: '2024-11-05' });
    expect(INPUT_KINDS.term.parse('Lâu dài')).toEqual({ ok: true, value: 'long_term' });
    expect(INPUT_KINDS.term.parse('Đến ngày 15/10/2064')).toEqual({ ok: true, value: '2064-10-15' });
    expect(INPUT_KINDS.term.parse('Đến tháng 10/2043')).toEqual({ ok: true, value: '2043-10-31' });
    expect(INPUT_KINDS.term.parse('đến tháng 2/2024')).toEqual({ ok: true, value: '2024-02-29' });
    expect(INPUT_KINDS.term.parse('Đến tháng 13/2043')).toEqual({ ok: false });
    expect(INPUT_KINDS.term.parse('Từ tháng 10/1993 đến tháng 10/2043')).toEqual({ ok: true, value: '2043-10-31' });
    expect(INPUT_KINDS.term.parse('Từ 15/10/1993 đến 15/10/2043')).toEqual({ ok: true, value: '2043-10-15' });
    expect(INPUT_KINDS.term.parse('Từ năm 1993 đến tháng 10/2043')).toEqual({ ok: true, value: '2043-10-31' });
    expect(INPUT_KINDS.term.parse('50 năm kể từ ngày 15/10/1993')).toEqual({ ok: false });
    expect(INPUT_KINDS.term.parse('Từ tháng 10/1993')).toEqual({ ok: false });
    expect(INPUT_KINDS.use_form.parse('Sử dụng chung')).toEqual({ ok: true, value: 'shared' });
    expect(INPUT_KINDS.money.parse('1.234.567')).toEqual({ ok: true, value: 1234567 });
  });

  it.each([
    ['a dash between two dates', '15/10/1993 - 15/10/2043', '2043-10-15'],
    ['an en dash between two dates', '15/10/1993 – 15/10/2043', '2043-10-15'],
    ['an em dash with no spaces', '15/10/1993—15/10/2043', '2043-10-15'],
    ['a dash with no spaces', '15/10/1993-15/10/2043', '2043-10-15'],
    ['dashed dates joined by a dash', '15-10-1993 - 15-10-2043', '2043-10-15'],
    ['ISO dates joined by an en dash', '1993-10-15 – 2043-10-15', '2043-10-15'],
    ['Từ before a dash range', 'Từ 15/10/1993 - 15/10/2043', '2043-10-15'],
    ['a range without accents', 'Tu 15/10/1993 den 15/10/2043', '2043-10-15'],
    ['a range in capitals without accents', 'TU NGAY 15/10/1993 DEN NGAY 15/10/2043', '2043-10-15'],
    ['two dates joined by đến', '15/10/1993 đến 15/10/2043', '2043-10-15'],
    ['two dates joined by den', '15/10/1993 den 15/10/2043', '2043-10-15'],
    ['months joined by a dash', '10/1993 - 10/2043', '2043-10-31'],
    ['months joined by an en dash', 'Tháng 10/1993 – tháng 10/2043', '2043-10-31'],
    ['months joined by den', 'Tu thang 10/1993 den thang 10/2043', '2043-10-31'],
    ['an end month without accents', 'Den thang 10/2043', '2043-10-31'],
  ] as const)('reads a term written as %s as its end', (_, text, end) => {
    expect(INPUT_KINDS.term.parse(text)).toEqual({ ok: true, value: end });
  });

  it.each([
    ['a start without accents', 'Tu 15/10/1993'],
    ['a start date and a dash with no end date after it', '15/10/1993 - 50 năm'],
    ['a period from a start without accents', '50 nam ke tu ngay 15/10/1993'],
  ] as const)('refuses a term that names only %s', (_, text) => {
    expect(INPUT_KINDS.term.parse(text)).toEqual({ ok: false });
  });

  it('keeps only the last four digits of a typed ID number (D11)', () => {
    expect(INPUT_KINDS.id_last4.parse('079 160 018 829')).toEqual({ ok: true, value: '8829' });
    expect(INPUT_KINDS.id_last4.parse('12')).toEqual({ ok: false });
  });

  it('refuses a typed number whose text holds an ID instead of keeping its digits (D11)', () => {
    for (const typed of ['001123456789', '0791234567,89', '07912345678,9', '0791234567,89 m²']) expect(readInput('area', typed), typed).toEqual({ ok: false });
    expect(readInput('area', '1.250,5')).toEqual({ ok: true, value: 1250.5 });
  });

  it('keeps a land use code missing from the list, upper case', () => {
    expect(INPUT_KINDS.land_use_code.parse('xyz')).toEqual({ ok: true, value: 'XYZ' });
  });
});

describe('reviewFields', () => {
  it('lists the certificate, then each holder, parcel with its purposes and structure, in reading order', () => {
    const fields = reviewFields('certificate_v1', truthFile.certificate);
    const sections = [...new Set(fields.map((field) => field.section.key))];
    expect(sections).toEqual(['', 'holders[0]', 'holders[1]', 'parcels[0]', 'parcels[0].purposes[0]', 'structures[0]']);
    expect(fields.find((field) => field.path === 'parcels[0].area_m2')?.leaf).toEqual({ value: 82.7, confidence: 1, page: 1 });
    expect(fields.some((field) => field.descriptor.target === null)).toBe(false);
  });

  it('gives a manual entry one empty holder, parcel and purpose', () => {
    const fields = reviewFields('certificate_v1', null);
    expect([...new Set(fields.map((field) => field.section.key))]).toEqual(['', 'holders[0]', 'parcels[0]', 'parcels[0].purposes[0]']);
    expect(fields.every((field) => field.leaf === null)).toBe(true);
  });
});
