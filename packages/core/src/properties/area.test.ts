import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { parcelSchema, purposeSchema, structureSchema } from '../agent-schemas/certificate_v1';
import { readInput } from '../extraction/fields';
import { parseAreaInput, purposesMismatch, sumLandArea } from './area';
import { readKindDetails } from './form-fields';

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
      const read = parseAreaInput(text);
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
    ['', null, null],
    ['4,500', null, null],
    ['4,5 m', 4.5, 4.5],
  ])('%j reads as area %s and length %s in every field', (text, area, length) => {
    const read = Object.fromEntries(Object.entries(FIELDS).map(([field, [, parse]]) => [field, parse(text)]));
    const expected = Object.fromEntries(Object.entries(FIELDS).map(([field, [measure]]) => [field, measure === 'area' ? area : length]));
    expect(read).toEqual(expected);
  });
});

describe('parseAreaInput', () => {
  it.each([
    ['350,5', 350.5],
    ['350.5', 350.5],
    ['80,25 m²', 80.25],
    ['150m2', 150],
    ['1.250,75', 1250.75],
    ['1.250', 1250],
    [' 12 ', 12],
  ])('reads %s as %d m²', (text, expected) => {
    expect(parseAreaInput(text)).toEqual({ ok: true, value: expected });
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
  ])('refuses %j as %s', (text, reason) => {
    expect(parseAreaInput(text)).toEqual({ ok: false, reason });
  });
});

describe('sumLandArea (PRP-2)', () => {
  it('sums 120,5 and 80,25 to exactly 200,75', () => {
    expect(sumLandArea([{ area_m2: 120.5 }, { area_m2: 80.25 }])).toBe(200.75);
  });

  it('sums hundredths that floats would drift on', () => {
    expect(sumLandArea([{ area_m2: 0.1 }, { area_m2: 0.2 }])).toBe(0.3);
  });

  it('sums an empty list to 0 and skips a parcel with no area', () => {
    expect(sumLandArea([])).toBe(0);
    expect(sumLandArea([{ area_m2: null }, { area_m2: 150 }])).toBe(150);
  });
});

describe('purposesMismatch', () => {
  it('returns both totals when the purposes do not add up to the parcel', () => {
    expect(purposesMismatch({ area_m2: 80, purposes: [{ area_m2: 80 }, { area_m2: 20.5 }, { area_m2: 10 }] })).toEqual({ parcel: 80, purposes: 110.5 });
  });

  it('returns null when they match, when the parcel has no area and when no purpose carries one', () => {
    expect(purposesMismatch({ area_m2: 100.3, purposes: [{ area_m2: 100.1 }, { area_m2: 0.2 }] })).toBeNull();
    expect(purposesMismatch({ area_m2: null, purposes: [{ area_m2: 10 }] })).toBeNull();
    expect(purposesMismatch({ area_m2: 80, purposes: [{}] })).toBeNull();
  });
});
