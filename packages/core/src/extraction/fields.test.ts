import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { certificateV1Schema } from '../agent-schemas/certificate_v1';
import { utilityBillV1Schema } from '../agent-schemas/utility_bill_v1';
import truthFile from '../../../../fixtures/certificates/gcn_2024-photo/truth.json';
import { EXTRACTION_FIELDS, INPUT_KINDS, reviewFields } from './fields';

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
    expect(INPUT_KINDS.use_form.parse('Sử dụng chung')).toEqual({ ok: true, value: 'shared' });
    expect(INPUT_KINDS.money.parse('1.234.567')).toEqual({ ok: true, value: 1234567 });
  });

  it('keeps only the last four digits of a typed ID number (D11)', () => {
    expect(INPUT_KINDS.id_last4.parse('079 160 018 829')).toEqual({ ok: true, value: '8829' });
    expect(INPUT_KINDS.id_last4.parse('12')).toEqual({ ok: false });
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
