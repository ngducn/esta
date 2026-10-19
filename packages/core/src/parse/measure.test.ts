import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { parcelSchema, purposeSchema, structureSchema } from '../agent-schemas/certificate_v1';
import { readInput } from '../extraction/fields';
import { readKindDetails } from '../properties/form-fields';
import { measureInputText, parseMeasureInput } from './measure';

const number = (value: unknown) => (typeof value === 'number' ? value : null);

const assistant = (leaf: z.ZodType<{ value: unknown }>) => (text: string) => {
  const read = leaf.safeParse({ value: text, confidence: 0.9, page: 1 });
  return read.success ? number(read.data.value) : null;
};

const propertyForm = (key: 'frontage_m' | 'road_width_m') => (text: string) => {
  const read = readKindDetails('residential_land', { [key]: text });
  return read.ok ? number(read.value[key]) : null;
};

/** Every field that reads an area or a length from text, and which of the two it reads. */
const FIELDS = {
  'assistant parcel area': ['area', assistant(parcelSchema.shape.area_m2)],
  'assistant purpose area': ['area', assistant(purposeSchema.shape.area_m2)],
  'assistant footprint': ['area', assistant(structureSchema.shape.footprint_m2)],
  'assistant floor area': ['area', assistant(structureSchema.shape.floor_area_m2)],
  'review screen area': [
    'area',
    (text: string) => {
      const read = readInput('area', text);
      return read.ok ? number(read.value) : null;
    },
  ],
  'legal tab and unit sheet area': [
    'area',
    (text: string) => {
      const read = parseMeasureInput(text, 'area');
      return read.ok ? read.value : null;
    },
  ],
  'property form frontage': ['length', propertyForm('frontage_m')],
  'property form road width': ['length', propertyForm('road_width_m')],
} as const;

describe('every field reads an area or a length the Vietnamese way (DOMAIN-VN §2.1)', () => {
  it.each([
    ['312,8', 312.8, 312.8],
    ['1.255,5', 1255.5, 1255.5],
    ['125,5 m²', 125.5, null],
    ['1.250', 1250, 1250],
    ['1,255', null, null],
    ['1,255 m²', null, null],
    ['1.255 m²', 1255, null],
    ['0,5', 0.5, 0.5],
    ['12.345,67', 12345.67, 12345.67],
    ['1 255', 1255, 1255],
    ['1 255,5', 1255.5, 1255.5],
    ['12 5', null, null],
    ['1,5 5', null, null],
    ['', null, null],
    ['4,500', null, null],
    ['4,5 m', 4.5, 4.5],
  ])('%j reads as area %s and length %s in every field', (text, area, length) => {
    const read = Object.fromEntries(Object.entries(FIELDS).map(([field, [, parse]]) => [field, parse(text)]));
    const expected = Object.fromEntries(Object.entries(FIELDS).map(([field, [measure]]) => [field, measure === 'area' ? area : length]));
    expect(read).toEqual(expected);
  });
});

describe('parseMeasureInput', () => {
  it.each([
    ['350,5', 350.5],
    ['350.5', 350.5],
    ['80,25 m²', 80.25],
    ['150m2', 150],
    ['1.250,75', 1250.75],
    ['1.250', 1250],
    [' 12 ', 12],
    ['1 255', 1255],
    ['1\u00A0255,5 m²', 1255.5],
    ['12 345 678,9', 12_345_678.9],
  ])('reads %j as %d m²', (text, expected) => {
    expect(parseMeasureInput(text, 'area')).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['120,555', 'too_precise'],
    ['0', 'invalid'],
    ['-5', 'invalid'],
    ['12,5,5', 'invalid'],
    ['abc', 'invalid'],
    ['99999999999', 'too_large'],
    ['12 5', 'invalid'],
    ['1,5 5', 'invalid'],
    ['125, 5', 'invalid'],
    ['1 25', 'invalid'],
    ['1 2550', 'invalid'],
    ['1.255 000', 'invalid'],
  ])('refuses %j as %s', (text, reason) => {
    expect(parseMeasureInput(text, 'area')).toEqual({ ok: false, reason });
  });

  it('reads a length typed with metres and refuses one typed with square metres', () => {
    expect(parseMeasureInput('4,5 m', 'length')).toEqual({ ok: true, value: 4.5 });
    expect(parseMeasureInput('4,5 m²', 'length')).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('measureInputText', () => {
  it('writes the decimal comma that parseMeasureInput reads back as the same number', () => {
    expect(measureInputText(350.5)).toBe('350,5');
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999_999_999_999 }), (hundredths) => {
        const value = hundredths / 100;
        expect(parseMeasureInput(measureInputText(value), 'area')).toEqual({ ok: true, value });
      }),
    );
  });
});
