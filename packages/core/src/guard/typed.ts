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

const DATE = new RegExp(String.raw`${NOT_WORD_BEFORE}\d{1,2}[/.-]\d{1,2}[/.-]\d{4}${NOT_WORD_AFTER}`, 'gu');
const PERCENT = new RegExp(
  String.raw`${NOT_WORD_BEFORE}(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|phần trăm)(?:\s*\/\s*(năm|nam|tháng|thang))?${NOT_WORD_AFTER}`,
  'gu',
);
const MONEY_CHAIN = new RegExp(
  String.raw`${NOT_WORD_BEFORE}${NUMBER}\s*${MONEY_UNIT}${UNIT_END}(?:\s*${NUMBER}\s*${MONEY_UNIT}${UNIT_END})*(?:\d{1,3}(?![\p{L}\p{N}])|\s+rưỡi${NOT_WORD_AFTER})?`,
  'giu',
);
const GROUPED_MONEY = new RegExp(
  String.raw`${NOT_WORD_BEFORE}[1-9]\d{0,2}(?:\.\d{3})+(?:\s*(?:₫|đ|đồng|vnd))?${NOT_WORD_AFTER}`,
  'giu',
);
const COUNT = new RegExp(
  String.raw`${NOT_WORD_BEFORE}(\d+)\s*(năm|tháng|phòng|căn|nhà|lô|tầng|người|ngày|lần)${NOT_WORD_AFTER}`,
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
    [MONEY_CHAIN, (m) => vndOf(m[0])],
    [GROUPED_MONEY, (m) => vndOf(m[0])],
    [COUNT, (m) => {
      const value = Number(m[1]);
      const unit = (m[2] ?? '').toLowerCase();
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
