import type { Vnd } from '../money/vnd';
import type { Locale } from './index';

const VI_DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'] as const;
const VI_SCALES = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ'] as const;

const EN_SMALL = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
] as const;
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'] as const;
const EN_SCALES = ['', 'thousand', 'million', 'billion', 'trillion'] as const;

function word(words: readonly string[], index: number): string {
  const found = words[index];
  if (found === undefined) throw new RangeError(`No word at ${index}`);
  return found;
}

/** Groups of three digits, lowest first. */
function groupsOf(amount: number): number[] {
  const groups: number[] = [];
  for (let rest = amount; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  return groups;
}

/** A group read as a receipt reads it: a group after a higher one keeps its `không trăm` and `lẻ`. */
function viGroup(group: number, afterHigher: boolean): string[] {
  const [hundreds, tens, units] = [Math.floor(group / 100), Math.floor(group / 10) % 10, group % 10];
  const words: string[] = hundreds > 0 || afterHigher ? [word(VI_DIGITS, hundreds), 'trăm'] : [];
  if (tens === 0) {
    if (units > 0) words.push(...(words.length > 0 ? ['lẻ'] : []), word(VI_DIGITS, units));
  } else {
    words.push(...(tens === 1 ? ['mười'] : [word(VI_DIGITS, tens), 'mươi']));
    if (units === 5) words.push('lăm');
    else if (units === 1 && tens > 1) words.push('mốt');
    else if (units > 0) words.push(word(VI_DIGITS, units));
  }
  return words;
}

function enGroup(group: number): string[] {
  const hundreds = Math.floor(group / 100);
  const rest = group % 100;
  const words: string[] = hundreds > 0 ? [word(EN_SMALL, hundreds), 'hundred'] : [];
  if (rest >= 20) words.push(rest % 10 === 0 ? word(EN_TENS, rest / 10) : `${word(EN_TENS, Math.floor(rest / 10))}-${word(EN_SMALL, rest % 10)}`);
  else if (rest > 0) words.push(word(EN_SMALL, rest));
  return words;
}

const WORDS = {
  vi: { zero: VI_DIGITS[0], currency: 'đồng', scales: VI_SCALES, group: viGroup },
  en: { zero: EN_SMALL[0], currency: 'dong', scales: EN_SCALES, group: enGroup },
} as const satisfies Record<Locale, unknown>;

/**
 * An amount in words, as a receipt or the VietQR split note prints it: `Sáu trăm triệu đồng`, `Six hundred million
 * dong`. Covers every amount Esta stores and more, below a million tỷ.
 */
export function vndInWords(amount: Vnd, locale: Locale): string {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount >= 1e15) throw new RangeError(`No words for ${amount}`);
  const { zero, currency, scales, group: read } = WORDS[locale];
  const groups = groupsOf(amount);
  const spoken = groups
    .map((group, index) => (group === 0 ? [] : [...read(group, index < groups.length - 1), word(scales, index)]))
    .reverse()
    .flat()
    .filter((word) => word !== '');
  const text = [...(spoken.length === 0 ? [zero] : spoken), currency].join(' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
