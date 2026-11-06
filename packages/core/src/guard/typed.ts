import type { TypedValue } from '../calc';
import { displayTyped } from '../calc/display';
import type { Locale } from '../format';
import { parseDateInput } from '../parse/date-input';
import { parsePercentBps } from '../parse/percent';
import { parseVndInput } from '../parse/vnd-input';

export type TypedNumber = { value_display: string; typed: TypedValue; typed_text: string };

const NOT_WORD_BEFORE = String.raw`(?<![\p{L}\p{N}.,/])`;
const NOT_WORD_AFTER = String.raw`(?![\p{L}\p{N}])`;
const MONEY_UNIT = String.raw`(?:tỷ|tỉ|ty|ti|triệu|trieu|tr|nghìn|nghin|ngàn|ngan|k)`;
const UNIT_END = String.raw`(?!\p{L})`;
const NUMBER = String.raw`\d+(?:[.,]\d+)*`;
const COUNT_UNITS = String.raw`(?:năm|tháng|phòng|căn|nhà|lô|tầng|người|ngày|lần)`;
/** A unit after a number that makes it a count or an area, never money: `1.500 m2`, `1.000 người`. */
const NOT_MONEY_UNIT = String.raw`(?:m2|m²|m|ha|người|nguoi|căn|lô|phòng|phong|nhà|tầng|lần|%)`;
/** Words that make the number after them part of a street, block or room description (`đường 3 tháng 2`), not a count of hers. */
const NAME_LABEL = /(?<![\p{L}])(?:đường|phố|hẻm|ngõ|ngách|quận|phường|căn hộ|chung cư)\s+$/iu;
const ROOM_KIND_AFTER = /^\s*(?:ngủ|tắm|vệ sinh|wc)(?!\p{L})/iu;
const ID_WORD = /(?<![\p{L}])(?:cmnd|cccd|cmt|mã|stk|mst|tk|số)\s*:?\s*$/iu;
const UNIT_LABEL = new RegExp(String.raw`(\d[\d.,]*\s*)?(?<![\p{L}])${COUNT_UNITS}\s+$`, 'iu');

const DATE = new RegExp(String.raw`${NOT_WORD_BEFORE}\d{1,2}[/.-]\d{1,2}[/.-]\d{4}${NOT_WORD_AFTER}`, 'gu');
const DATE_IN_WORDS = new RegExp(
  String.raw`${NOT_WORD_BEFORE}ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})${NOT_WORD_AFTER}`,
  'giu',
);
const PERCENT = new RegExp(
  String.raw`${NOT_WORD_BEFORE}(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|phần trăm)(?:(?:\s*\/\s*|\s+(?:mỗi|moi|một|mot)\s+|\s+)(năm|nam|tháng|thang))?${NOT_WORD_AFTER}`,
  'giu',
);
const MONEY_CHAIN = new RegExp(
  String.raw`${NOT_WORD_BEFORE}${NUMBER}\s*${MONEY_UNIT}${UNIT_END}(?:\s*${NUMBER}\s*${MONEY_UNIT}${UNIT_END})*(?:\s*\d{1,3}(?![\p{L}\p{N}]|[.,]\d)(?!\s*${NOT_MONEY_UNIT}(?!\p{L})|\s*${COUNT_UNITS}${NOT_WORD_AFTER})|\s+rưỡi${NOT_WORD_AFTER})?`,
  'giu',
);
const CURRENCY = String.raw`\s*(?:₫|đ|đồng|vnd)${NOT_WORD_AFTER}`;
const GROUPED_MONEY = new RegExp(
  String.raw`${NOT_WORD_BEFORE}(?:(?:[1-9]\d{0,2}(?:\.\d{3})+|[1-9]\d*)${CURRENCY}|[1-9]\d{0,2}(?:\.\d{3})+(?!\s*${NOT_MONEY_UNIT}(?!\p{L}))${NOT_WORD_AFTER})`,
  'giu',
);
const COUNT = new RegExp(
  String.raw`${NOT_WORD_BEFORE}(\d+)\s*(năm|tháng|phòng|căn|nhà|lô|tầng|người|ngày|lần)(\s+rưỡi)?${NOT_WORD_AFTER}`,
  'giu',
);

type Hit = { index: number; length: number; typed: TypedValue };

function blank(text: string, index: number, length: number): string {
  return text.slice(0, index) + ' '.repeat(length) + text.slice(index + length);
}

function collect(text: string, pattern: RegExp, read: (match: RegExpExecArray) => TypedValue | null): { hits: Hit[]; rest: string } {
  const hits: Hit[] = [];
  let rest = text;
  for (const match of text.matchAll(pattern)) {
    const typed = read(match as RegExpExecArray);
    if (typed === null) continue;
    hits.push({ index: match.index, length: match[0].length, typed });
    rest = blank(rest, match.index, match[0].length);
  }
  return { hits, rest };
}

/** A unit word right before a number labels it (`phòng 2`), unless that word is itself the unit of a number before it (`3 phòng 2 tháng`). */
function isLabel(before: string): boolean {
  const found = UNIT_LABEL.exec(before);
  return found !== null && found[1] === undefined;
}

const vndOf = (text: string): TypedValue | null => {
  const parsed = parseVndInput(text);
  return parsed.ok && parsed.value > 0 ? { kind: 'vnd', value: parsed.value } : null;
};

/**
 * Reads the numbers Mẹ typed: amounts, annual percents, dd/mm/yyyy dates, and a number followed by a unit word.
 * A unit word before a number (`phòng 2`) is a label, not a fact [app rule]. A year count reads as months.
 */
export function extractTypedNumbers(text: string, locale: Locale = 'vi'): TypedNumber[] {
  const hits: Hit[] = [];
  let rest = text;
  const passes: Array<[RegExp, (m: RegExpExecArray) => TypedValue | null]> = [
    [DATE, (m) => { const d = parseDateInput(m[0]); return d.ok ? { kind: 'date', value: d.value } : null; }],
    [PERCENT, (m) => {
      if (m[2] !== undefined && /^th/i.test(m[2])) return null;
      const bp = parsePercentBps(m[1] ?? '');
      return bp.ok ? { kind: 'bp', value: bp.value } : null;
    }],
    [DATE_IN_WORDS, (m) => {
      const d = parseDateInput(`${m[1]}/${m[2]}/${m[3]}`);
      return d.ok ? { kind: 'date', value: d.value } : null;
    }],
    [MONEY_CHAIN, (m) => vndOf(m[0])],
    [GROUPED_MONEY, (m) => {
      const bare = !/[₫đ]|đồng|vnd/iu.test(m[0]);
      if (bare && (m[0].split('.').length > 4 || ID_WORD.test(m.input.slice(0, m.index)))) return null;
      return vndOf(m[0]);
    }],
    [COUNT, (m) => {
      if (isLabel(m.input.slice(0, m.index))) return null;
      if (NAME_LABEL.test(m.input.slice(0, m.index)) || ROOM_KIND_AFTER.test(m.input.slice(m.index + m[0].length))) return null;
      const value = Number(m[1]);
      const unit = (m[2] ?? '').toLowerCase();
      if (m[3] !== undefined) return unit === 'năm' ? { kind: 'months', value: value * 12 + 6 } : null;
      if (unit === 'năm') return { kind: 'months', value: value * 12 };
      return unit === 'tháng' ? { kind: 'months', value } : { kind: 'count', value, unit };
    }],
  ];
  for (const [pattern, read] of passes) {
    const found = collect(rest, pattern, read);
    hits.push(...found.hits);
    rest = found.rest;
  }
  return hits
    .sort((a, b) => a.index - b.index)
    .map((hit) => {
      const typed_text = text.slice(hit.index, hit.index + hit.length).trim();
      return { value_display: displayTyped(hit.typed, locale), typed: hit.typed, typed_text };
    });
}

/** Every message she wrote, in order; each message is read on its own so a number never joins its neighbour's unit. */
export function extractTypedNumbersFrom(messages: readonly string[], locale: Locale = 'vi'): TypedNumber[] {
  return messages.flatMap((message) => extractTypedNumbers(message, locale));
}
