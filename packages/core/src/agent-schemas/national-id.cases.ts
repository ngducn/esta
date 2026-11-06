/** A digit string written in another script, from the code point of that script's zero. */
const inScript = (zero: number, digits: string) => digits.replace(/\d/gu, (digit) => String.fromCodePoint(zero + Number(digit)));

/**
 * Spellings of a full ID number that must never be saved whole. `reduced` is what the reducer keeps. The SQL check
 * (`holds_national_id`) replays every row through `NATIONAL_ID_REPLAYED` in `national-id-vectors.ts`, so core and the database cannot drift apart.
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
  ['bullet groups', 'cccd 079•123•456•789', 'cccd 6789'],
  ['unlabelled guillemet groups', 'Số 079«123«456«789', 'Số 6789'],
  ['unlabelled bracket groups', 'Số 079(123(456(789', 'Số 6789'],
  ['unlabelled closing bracket groups', 'Số 079)123)456)789', 'Số 6789'],
  ['unlabelled curly quote groups', 'Số 079“123”456‘789', 'Số 6789'],
  ['unlabelled initial quote groups', 'Số 079‹123›456»789', 'Số 6789'],
  ['bullet groups with no label', '079•123•456•789', '6789'],
  ['tilde groups', 'cccd 079~123~456~789', 'cccd 6789'],
  ['asterisk groups', 'cccd 079*123*456*789', 'cccd 6789'],
  ['hash groups', 'cccd 079#123#456#789', 'cccd 6789'],
  ['colon groups', 'cccd: 079:123:456:789', 'cccd: 6789'],
  ['two-em dash groups', 'cccd 079⸺123⸺456⸺789', 'cccd 6789'],
  ['wave dash groups', 'cccd 079〜123〜456〜789', 'cccd 6789'],
  ['heavy minus groups', 'cccd 079➖123➖456➖789', 'cccd 6789'],
  ['plus groups', 'cccd 079+123+456+789', 'cccd 6789'],
  ['backslash groups', 'cccd 079\\123\\456\\789', 'cccd 6789'],
  ['wave dash groups with no label', '079〜123〜456〜789', '6789'],
  ['zero-width spaces between groups', 'cccd 079​123​456​789', 'cccd 6789'],
  ['Arabic-Indic digits after a label', `cccd ${inScript(0x660, '079123456789')}`, `cccd ${inScript(0x660, '6789')}`],
  ['Arabic-Indic digits with no label', inScript(0x660, '079123456789'), inScript(0x660, '6789')],
  ['extended Arabic-Indic digits in groups', `cccd ${inScript(0x6f0, '079 123 456 789')}`, `cccd ${inScript(0x6f0, '6789')}`],
  ['Devanagari digits', `Số ${inScript(0x966, '079123456789')}`, `Số ${inScript(0x966, '6789')}`],
  ['Thai digits in groups', `Số ${inScript(0xe50, '079.123.456.789')}`, `Số ${inScript(0xe50, '6789')}`],
  ['Arabic-Indic digits mixed with ASCII', `cccd 0791${inScript(0x660, '23456789')}`, `cccd ${inScript(0x660, '6789')}`],
  // A currency word counts only as written (đồng, not Đồng Nai), and a figure grouped with dots or commas is the only money near a label.
  ['a 9-digit CMND before the province Đồng Nai', 'CMND số 271234567 Đồng Nai', 'CMND số 4567 Đồng Nai'],
  ['a 9-digit CMND before đồng ý', 'CMND số 271234567 đồng ý bán', 'CMND số 4567 đồng ý bán'],
  ['a spaced CMND before the province Đồng Tháp', 'CMND 271 234 567 Đồng Tháp', 'CMND 4567 Đồng Tháp'],
  ['a CMND before the name Triệu Thị', 'CMND 271234567 Triệu Thị Demo', 'CMND 4567 Triệu Thị Demo'],
  ['an 11-digit ID with the word đồng after it', 'ID 12345678901 đồng', 'ID 8901 đồng'],
  ['a dotted 9-digit CMND right after the label, then đ', 'CMND 271.234.567 đ', 'CMND 4567 đ'],
  ['a dotted 12-digit CCCD right after the label, then ₫', 'CCCD 79.123.456.789 ₫', 'CCCD 6789 ₫'],
  ['a 9-digit ID after the label whose tail looks like a price', 'CMND 097  46  1·769 đ', 'CMND 1769 đ'],
  ['an ID that starts with 0, dotted, then ₫', 'CCCD 079.123.456.789 ₫', 'CCCD 6789 ₫'],
  ['an ID that starts with 0, dotted, then Đồng Nai', 'CCCD 079.123.456.789 Đồng Nai', 'CCCD 6789 Đồng Nai'],
  ['an ID that starts with 0, dotted, after ₫', 'CCCD ₫079.123.456.789', 'CCCD ₫6789'],
  ['an ID that starts with 0, in commas, after VND', 'CCCD VND 079,123,456,789', 'CCCD VND 6789'],
  ['an ID that starts with 0 and a decimal tail, then đ', 'CCCD 0791234567.89 đ', 'CCCD 6789 đ'],
  ['an ID that starts with 0, dotted, with no label, then ₫', 'Giá 079.123.456.789 ₫', 'Giá 6789 ₫'],
  ['an ID in Arabic-Indic digits, then ₫', `cccd ${inScript(0x660, '079123456789')} ₫`, `cccd ${inScript(0x660, '6789')} ₫`],
  ['a 12-digit number with no label before the province Đồng Nai', 'Số 179123456789 Đồng Nai', 'Số 6789 Đồng Nai'],
  ['a spaced 12-digit number with no label before Triệu Thị', 'Số 179 123 456 789 Triệu Thị', 'Số 6789 Triệu Thị'],
  // Digits of another script and the slashes of other widths are no ASCII date, and a zero of another script is no phone.
  ['a date shape with division slashes after a label', 'CCCD 07∕12∕34 567890', 'CCCD 7890'],
  ['a date-shaped prefix in Arabic-Indic digits with division slashes after a label', `CCCD ${inScript(0x660, '07∕12∕34 567890')}`, `CCCD ${inScript(0x660, '7890')}`],
  ['a date-shaped prefix in Devanagari digits with fraction slashes after a label', `CCCD ${inScript(0x966, '07⁄12⁄34 567890')}`, `CCCD ${inScript(0x966, '7890')}`],
  ['a date-shaped prefix in Thai digits with full-width slashes after a label', `CCCD ${inScript(0xe50, '07／12／34 567890')}`, `CCCD ${inScript(0xe50, '7890')}`],
  ['a date-shaped prefix in Adlam digits with big solidus slashes after a label', `CCCD ${inScript(0x1e950, '07⧸12⧸34 567890')}`, 'CCCD 7890'],
  ['a date shape with fraction slashes after a label', 'CCCD 01⁄02⁄03 456789', 'CCCD 6789'],
  ['a date shape in Arabic-Indic digits after a label', `CCCD ${inScript(0x660, '01/02/03 456789')}`, `CCCD ${inScript(0x660, '6789')}`],
  ['a date shape in Arabic-Indic digits with dots and no label', `Số ${inScript(0x660, '01.02.03.456789')}`, `Số ${inScript(0x660, '6789')}`],
  ['a phone-shaped number in Arabic-Indic digits before a CMND label', `${inScript(0x660, '0901234567')} CMND`, `${inScript(0x660, '4567')} CMND`],
  // The gaps core and the database both had on main.
  ['a 12-digit group right after a digit and a dot, after a label', 'CCCD 1.079123456789', 'CCCD 1.6789'],
  ['a 12-digit group right after a digit and a dot, in a file name', 'hop-dong-demo-2.079123456789.pdf', 'hop-dong-demo-2.6789.pdf'],
  ['a 12-digit group right after a date and a dot', 'Ngày 12/03/2021.079123456789', 'Ngày 12/03/2021.6789'],
  ['an unlabelled ID split by a space and a line break', 'Số 079123 \n456789', 'Số 6789'],
  ['an unlabelled ID split by a line break and a space', 'Số 079123\n 456789', 'Số 6789'],
  ['an unlabelled ID with a Mongolian vowel separator between groups', 'Số 079123᠎456789', 'Số 6789'],
  ['an unlabelled ID with an Arabic letter mark between groups', 'Số 079123؜456789', 'Số 6789'],
  ['an unlabelled ID with a bidi override between groups', 'Số 079123‮456789', 'Số 6789'],
  ['an unlabelled ID with a bidi embedding between groups', 'Số 079123‪456789', 'Số 6789'],
  ['an unlabelled ID with a bidi isolate between groups', 'Số 079123⁧456789', 'Số 6789'],
  ['an unlabelled ID with an interlinear annotation anchor between groups', 'Số 079123￹456789', 'Số 6789'],
  ['a labelled ID with a bidi isolate between groups', 'CCCD 079123⁦456789', 'CCCD 6789'],
  ['a labelled ID with a Hangul filler between groups', 'cccd 079123ㅤ456789', 'cccd 6789'],
  ['an unlabelled ID with a Hangul filler between groups', 'Số 079123ㅤ456789', 'Số 6789'],
  ['an unlabelled ID in Adlam digits', `Số ${inScript(0x1e950, '079123456789')}`, 'Số 6789'],
  ['a labelled ID in grouped Adlam digits', `CCCD ${inScript(0x1e950, '079 123 456 789')}`, 'CCCD 6789'],
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

/**
 * Numbers that are no ID and must come out of the reducer as they went in, next to the ID joiners above: a phone, a
 * price, a date, a certificate number, a map sheet and parcel, and a document number.
 */
export const NATIONAL_ID_KEPT: readonly (readonly [name: string, text: string])[] = [
  ['a phone with minus signs', 'SĐT 0903−123−456'],
  ['a phone with bullets', 'SĐT 0903•123•456'],
  ['a price in dots', 'Giá 1.500.000.000 đồng'],
  ['a price with a currency sign', 'Giá 1.500.000.000 ₫'],
  ['a date with dots', 'Ngày 07.09.2026'],
  ['a date with slashes after a label', 'CCCD cấp ngày 07/09/2026'],
  ['a certificate number', 'Giấy chứng nhận số CS 01234'],
  ['a map sheet and a parcel', 'Thửa đất số 12, tờ bản đồ số 34'],
  ['a document number with a slash', 'Hợp đồng số 123456/789012'],
  ['a document number with a division slash', 'Hợp đồng số 123456∕789012'],
  ['a tax code with a branch suffix', 'MST 0312345678-001'],
  ['a price in spaced groups and VND', 'Giá 123 456 789 012 VND'],
  ['a price in groups of three and vnđ', 'Giá 179 123 456 789 vnđ'],
  ['a price in commas and đ', 'Giá 123,456,789,012 đ'],
  ['a price with the sign before it', 'Giá ₫ 123.456.789.012'],
  ['a price with VND before it', 'Giá VND 179 123 456 789'],
  ['a price in tỷ', 'Giá 123456789012 tỷ'],
  ['a price below one tỷ, with a comma', 'Giá 0,5 tỷ'],
  ['a dotted price in capitals after a label', 'CCCD 6789, giá 1.250.000.000 ĐỒNG'],
  ['a price in triệu with a space', 'Giá 179 123 456 789 triệu'],
];
