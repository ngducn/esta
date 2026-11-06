import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MEASURE_CASES } from './measure.cases';
import { measureInputText, parseMeasureInput } from './measure';

describe('the measure parser on its case table', () => {
  it.each(MEASURE_CASES)('$name: $text as a $measure', ({ text, measure, expected }) => {
    expect(parseMeasureInput(text, measure)).toEqual(
      typeof expected === 'number' ? { ok: true, value: expected } : { ok: false, reason: expected },
    );
  });
});

describe('the measure parser on generated text', () => {
  it('never reads a group that starts with 0 as thousands', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), fc.integer({ min: 0, max: 999 }), fc.constantFrom('.', ' ', ','), (head, tail, mark) => {
        const text = `0${String(head).padStart(2, '0').slice(1)}${mark}${String(tail).padStart(3, '0')}`;
        const read = parseMeasureInput(text, 'area');
        if (read.ok) expect(read.value).toBeLessThan(1);
      }),
      { seed: 20261007 },
    );
  });

  it('reads back every length it writes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 999_999 }), (hundredths) => {
        const value = hundredths / 100;
        expect(parseMeasureInput(measureInputText(value), 'length')).toEqual({ ok: true, value });
      }),
      { seed: 20261007 },
    );
  });
});
