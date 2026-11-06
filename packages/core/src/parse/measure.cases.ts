import type { Measure, MeasureReason } from './measure';

export type MeasureCase = {
  readonly name: string;
  readonly text: string;
  readonly measure: Measure;
  readonly expected: number | MeasureReason;
};

const NBSP = ' ';

/** What Mẹ types into an area or length box; a number is the value read, a word is the reason it is refused. */
export const MEASURE_CASES: readonly MeasureCase[] = [
  { name: 'a leading zero group is not thousands', text: '0.255', measure: 'area', expected: 'leading_zero' },
  { name: 'two leading zeros are not thousands', text: '00.500', measure: 'area', expected: 'leading_zero' },
  { name: 'a leading zero before a comma is a decimal with too many places', text: '0,255', measure: 'area', expected: 'too_precise' },
  { name: 'a leading zero before a space group', text: '0 255', measure: 'area', expected: 'leading_zero' },
  { name: 'a leading zero on the first group', text: '01.500', measure: 'area', expected: 'leading_zero' },
  { name: 'a leading zero group of a frontage', text: '0.450', measure: 'length', expected: 'leading_zero' },
  { name: 'a first group of three that starts with 0 and a lone digit', text: '045 0', measure: 'area', expected: 'leading_zero' },
  { name: 'a leading zero group with a unit', text: '0 255 m²', measure: 'area', expected: 'leading_zero' },
  { name: 'a leading zero group after a non-breaking space', text: `0${NBSP}255`, measure: 'area', expected: 'leading_zero' },
  { name: 'a dot decimal with two places is still a decimal', text: '0.25', measure: 'area', expected: 0.25 },
  { name: 'a leading zero group deeper in the number is invalid', text: '1.000.0255', measure: 'area', expected: 'invalid' },
  { name: 'a small area with one decimal', text: '0,5', measure: 'area', expected: 0.5 },
  { name: 'a grouped area', text: '1.250', measure: 'area', expected: 1250 },
  { name: 'a non-breaking space group', text: `1${NBSP}255,5 m²`, measure: 'area', expected: 1255.5 },
  { name: 'a frontage with a decimal comma', text: '4,5', measure: 'length', expected: 4.5 },
  { name: 'a frontage typed with grouping still reads as thousands', text: '4.500', measure: 'length', expected: 4500 },
  { name: 'the same text as an area stays valid', text: '4.500', measure: 'area', expected: 4500 },
  { name: 'square metres do not belong to a length', text: '4,5 m²', measure: 'length', expected: 'invalid' },
  { name: 'a zero', text: '0', measure: 'length', expected: 'invalid' },
  { name: 'a negative', text: '-4,5', measure: 'length', expected: 'invalid' },
  { name: 'an exponent', text: '1e3', measure: 'area', expected: 'invalid' },
  { name: 'a plus sign', text: '+12', measure: 'area', expected: 'invalid' },
  { name: 'Arabic-Indic digits', text: '١٢', measure: 'area', expected: 'invalid' },
];
