import { describe, expect, it } from 'vitest';
import { parityProblems } from './i18n-parity.ts';

const vi = (messages: unknown) => ({ locale: 'vi', file: 'vi.json', messages });
const en = (messages: unknown) => ({ locale: 'en', file: 'en.json', messages });

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
    ).toEqual(['rooms: vi.json uses <b> {count, plural} {place}, en.json uses <b> {count, plural}']);
  });

  it('reports a malformed message and a non-string leaf', () => {
    expect(parityProblems(vi({ a: 'Xin {', b: 'ok' }), en({ a: 'Hi', b: 3 }))).toEqual([
      expect.stringMatching(/^vi\.json: a is not a valid ICU message/),
      'en.json: b must be a string or a group of messages',
    ]);
  });

  it('names an argument whose type differs', () => {
    expect(parityProblems(vi({ due: 'Hạn {day, date}' }), en({ due: 'Due {day, number}' }))).toEqual([
      'due: vi.json uses {day, date}, en.json uses {day, number}',
    ]);
  });

  it('names a plain argument that became a plural', () => {
    expect(
      parityProblems(vi({ rooms: '{count} phòng' }), en({ rooms: '{count, plural, one {# room} other {# rooms}}' })),
    ).toEqual(['rooms: vi.json uses {count}, en.json uses {count, plural}']);
  });

  it('names select options that differ', () => {
    expect(
      parityProblems(
        vi({ kind: '{kind, select, house {Nhà} land {Đất} other {Khác}}' }),
        en({ kind: '{kind, select, house {House} other {Other}}' }),
      ),
    ).toEqual(['kind: vi.json uses {kind, select, house|land|other}, en.json uses {kind, select, house|other}']);
  });

  it('names exact plural matches that differ', () => {
    expect(
      parityProblems(
        vi({ rooms: '{count, plural, =0 {Chưa có phòng} other {# phòng}}' }),
        en({ rooms: '{count, plural, one {# room} other {# rooms}}' }),
      ),
    ).toEqual(['rooms: vi.json uses {count, plural, =0}, en.json uses {count, plural}']);
  });

  it('checks plural categories against each locale', () => {
    expect(
      parityProblems(
        vi({ rooms: '{count, plural, one {# phòng} other {# phòng}}' }),
        en({ rooms: '{count, plural, other {# rooms}}' }),
      ),
    ).toEqual([
      'vi.json: rooms {count, plural} has category one, which vi never selects',
      'en.json: rooms {count, plural} lacks the en category one',
    ]);
  });

  it('checks selectordinal categories against the ordinal rules', () => {
    expect(
      parityProblems(
        vi({ floor: 'Tầng {n, selectordinal, one {thứ nhất} other {thứ #}}' }),
        en({ floor: '{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}} floor' }),
      ),
    ).toEqual([]);
  });

  it('rejects keys with a dot or no name', () => {
    expect(parityProblems(vi({ 'app.name': 'Esta', app: { '': 'x' } }), en({ 'app.name': 'Esta', app: { '': 'x' } }))).toEqual([
      'vi.json: key "app.name" under (root) must be non-empty and contain no dot',
      'vi.json: key "" under app must be non-empty and contain no dot',
      'en.json: key "app.name" under (root) must be non-empty and contain no dot',
      'en.json: key "" under app must be non-empty and contain no dot',
    ]);
  });

  it('rejects empty and blank messages', () => {
    expect(parityProblems(vi({ a: '', b: ' ' }), en({ a: 'A', b: 'B' }))).toEqual([
      'vi.json: a is empty',
      'vi.json: b is empty',
    ]);
  });

  it('rejects empty groups', () => {
    expect(parityProblems(vi({ app: {} }), en({ app: {} }))).toEqual([
      'vi.json: app is an empty group',
      'en.json: app is an empty group',
    ]);
  });

  it('rejects a message that is not NFC', () => {
    expect(parityProblems(vi({ late: 'Quá hạn'.normalize('NFD') }), en({ late: 'Overdue' }))).toEqual([
      'vi.json: late is not NFC normalized',
    ]);
  });
});
