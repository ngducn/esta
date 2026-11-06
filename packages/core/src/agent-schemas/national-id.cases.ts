/**
 * Spellings of a full ID number that must never be saved whole. `reduced` is what the reducer keeps; the SQL check
 * (`holds_national_id`) is not yet held to this table, see the follow-up on #425.
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
];

/** A 12-digit number, and the text around it that Mẹ or Ryan may type or name a file with. */
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
 * Numbers that are no ID and must come out of the reducer as they went in: a phone, a
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
  ['a price starting with 0 in dots and a sign', 'Giá 079.123.456.789 ₫'],
  ['a price in spaced groups and VND', 'Giá 123 456 789 012 VND'],
  ['a price in groups of three and vnđ', 'Giá 179 123 456 789 vnđ'],
  ['a price in commas and đ', 'Giá 123,456,789,012 đ'],
  ['a price with the sign before it', 'Giá ₫ 123.456.789.012'],
  ['a price with VND before it', 'Giá VND 179 123 456 789'],
  ['a price in tỷ', 'Giá 123456789012 tỷ'],
  ['a price in triệu with a space', 'Giá 179 123 456 789 triệu'],
];
