/**
 * Spellings of a full ID number that must never be saved whole. `reduced` is what the reducer keeps; the SQL check
 * (`holds_national_id`) is not yet held to this table, see the follow-up on #232.
 */
export const NATIONAL_ID_CASES: readonly (readonly [name: string, text: string, reduced: string])[] = [
  ['a number then a dot and a digit in a file name', 'hop-dong-demo-079123456789.2.pdf', 'hop-dong-demo-6789.2.pdf'],
  ['a number then a dot and two digits', '079123456789.25', '6789.25'],
  ['a number then a version suffix', 'cccd_079123456789.v2.pdf', 'cccd_6789.v2.pdf'],
  ['division slash groups', 'cccd 079∕123∕456∕789', 'cccd 6789'],
  ['fraction slash groups', 'cccd 079⁄123⁄456⁄789', 'cccd 6789'],
  ['big solidus groups', 'cccd 079⧸123⧸456⧸789', 'cccd 6789'],
  ['full-width slash groups', 'cccd 079／123／456／789', 'cccd 6789'],
  ['minus sign groups', 'cccd 079−123−456−789', 'cccd 6789'],
  ['small hyphen-minus groups', 'cccd 079﹣123﹣456﹣789', 'cccd 6789'],
  ['non-breaking hyphen groups', 'cccd 079‑123‑456‑789', 'cccd 6789'],
  ['en dash groups', 'cccd 079–123–456–789', 'cccd 6789'],
  ['zero-width spaces between groups', 'cccd 079​123​456​789', 'cccd 6789'],
];

/** A 12-digit number, and the text around it that Mẹ or Ryan may type or name a file with. */
const chars = (...codes: number[]) => codes.map((code) => String.fromCodePoint(code));
export const NATIONAL_ID_JOINERS: readonly string[] = ['', ' ', '.', '-', ...chars(0x2212, 0x2013, 0x2011, 0xa0, 0x200b)];
/** Only a label makes a slash join digit groups: unlabelled, `123456/789012` is a document number. */
export const NATIONAL_ID_LABELLED_JOINERS: readonly string[] = ['/', ...chars(0x2215, 0x2044, 0x29f8, 0xff0f)];
export const NATIONAL_ID_SURROUNDS: readonly (readonly [before: string, after: string])[] = [
  ['', ''],
  ['cccd ', ''],
  ['hop-dong-demo-', '.pdf'],
  ['hop-dong-demo-', '.2.pdf'],
  ['hop-dong-demo-', '.12.pdf'],
  ['scan_', '.v2.pdf'],
  ['Ông Demo ', ', 12 Lê Lợi'],
  ['(', ')'],
];
