import { describe, expect, it } from 'vitest';
import { parityProblems } from './i18n-parity.ts';

const vi = (messages: unknown) => ({ file: 'vi.json', messages });
const en = (messages: unknown) => ({ file: 'en.json', messages });

describe('parityProblems', () => {
  it('accepts matching keys and placeholders', () => {
    expect(
      parityProblems(
        vi({ app: { name: 'Esta', due: 'Quá hạn {days} ngày' } }),
        en({ app: { name: 'Esta', due: '{days} days overdue' } }),
      ),
    ).toEqual([]);
  });

  it('names a key missing from en.json', () => {
    expect(parityProblems(vi({ app: { name: 'Esta', tagline: 'Sổ cái' } }), en({ app: { name: 'Esta' } }))).toEqual([
      'en.json is missing app.tagline, which vi.json has',
    ]);
  });

  it('names an extra key in en.json', () => {
    expect(parityProblems(vi({ app: { name: 'Esta' } }), en({ app: { name: 'Esta', extra: 'Extra' } }))).toEqual([
      'vi.json is missing app.extra, which en.json has',
    ]);
  });

  it('names a renamed placeholder with both names', () => {
    expect(parityProblems(vi({ rooms: '{count} phòng' }), en({ rooms: '{n} rooms' }))).toEqual([
      'rooms: vi.json uses {count}, en.json uses {n}',
    ]);
  });

  it('compares placeholders inside plural branches and rich text tags', () => {
    expect(
      parityProblems(
        vi({ rooms: '{count, plural, other {<b>#</b> phòng ở {place}}}' }),
        en({ rooms: '{count, plural, one {<b>#</b> room} other {<b>#</b> rooms}}' }),
      ),
    ).toEqual(['rooms: vi.json uses <b> {count} {place}, en.json uses <b> {count}']);
  });

  it('reports a malformed message and a non-string leaf', () => {
    expect(parityProblems(vi({ a: 'Xin {', b: 'ok' }), en({ a: 'Hi', b: 3 }))).toEqual([
      expect.stringMatching(/^vi\.json: a is not a valid ICU message/),
      'en.json: b must be a string or a group of messages',
    ]);
  });
});
