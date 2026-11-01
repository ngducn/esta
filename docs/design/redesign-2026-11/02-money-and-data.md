# Money & data

Esta's promise is *exact or silent*: a number appears only when it is right and traceable, and the screen says plainly when it is missing. These rules implement it. `Esta.*` helpers in `components/bundle.js` are ports of the app's own `packages/core` formatters, so a mockup prints what the product prints.

## VND

| Form | Example | Helper | Where |
| --- | --- | --- | --- |
| Full | `3.500.000 ₫` | `formatVnd` | Tables, lists, forms, receipts, QR sheets, payment confirmations, toasts, anything a person checks against cash or a bank screen |
| Compact | `42,5 tr` · `12,5 tỷ` · `850 nghìn` | `formatVndCompact` | Summary figures on stat cards and the home screen, chart axes and labels, a property card's estimated value. Always with the full amount one tap or hover away |
| Signed | `+3.500.000 ₫` · `−1.200.000 ₫` | `formatVndSigned` | Ledger lines and deposit movements, where the direction is the point |
| In words | `Ba triệu năm trăm nghìn đồng` | `vndInWords` | Receipts, the money input's confirmation line, the VietQR note |

- `.` groups thousands, `,` is the decimal mark, `₫` follows after a **no-break space** so it never wraps away from its number. Đồng have no minor unit: never show `,00`.
- Compact keeps up to 1 decimal for `tr` and 2 for `tỷ`, trims trailing zeros, and picks the unit after rounding (`999.999.999` → `1 tỷ`). Compact has no `₫`: `tr` and `tỷ` already say đồng. Use `nghìn`, never `ngàn`; `tỷ`, never `tỉ`.
- Why the split: Mẹ checks rent to the last nghìn, so anything she confirms is exact; a home-screen total is read as a size, where `42,5 tr` is how people say it.

### Signs, zero, unknown, loading

| State | Show | Never |
| --- | --- | --- |
| Positive in a ledger | `+3.500.000 ₫` in `success-text` | A plus sign on ordinary amounts |
| Negative | `−1.200.000 ₫` with the real minus (U+2212), in `text` | Red for negative; parentheses; a hyphen |
| Zero, known | `0 ₫` in `text-muted` | A dash, which would mean "unknown" |
| Unknown or not entered | `—` in `text-muted`, with `aria-label="Chưa có số liệu"`; in a stat card, the words `Chưa có số liệu` and the action that fills it | `0 ₫` (a false zero) |
| Estimate | `Ước tính 3,2 tỷ`, or `≈ 3,2 tỷ` where space is short, with the date of the estimate nearby | An unmarked estimate beside exact amounts |
| Loading | A skeleton bar the width of the expected figure (`.es-skel` sized to `00.000.000 ₫`) | `0 ₫` or `…` as a placeholder, a spinner inside a number |

Overdue amounts stay `text`-coloured: the badge beside them says overdue. Colour on a number is reserved for direction (`+` in success).

### Very large amounts and long strings

- **Numbers never truncate and never wrap.** `.es-num` sets `white-space: nowrap` and tabular figures. When a number does not fit: in a table, the text column beside it truncates instead; in a stat card, switch to the compact form with the full amount in `title` and the accessible name; in a form, the field grows taller (the parsed line wraps), never narrower.
- The largest amount Esta stores is `1.000.000.000.000 ₫` (1.000 tỷ, `MAX_AMOUNT_VND`). Design every money column for `12.500.000.000 ₫` at 130% text.
- **Names and places**: a property or person name wraps to two lines in cards and lists (`-webkit-line-clamp: 2`), then ends in `…`; in a table cell it truncates to one line with the full text in `title`. Never truncate in the middle of a word with `overflow-wrap: anywhere`; that is only for codes (memo `ESTA 7K2QX9MP`, account numbers).
- **Addresses** wrap freely and are never truncated on a detail screen; in a card they clamp to two lines.
- Labels and buttons wrap and balance (`text-wrap: balance`); they never ellipsize.

### Typing money: `parseVnd`

The money input accepts what people type and confirms the exact amount live beneath the field:

| Typed | Reads as |
| --- | --- |
| `3tr5` · `3,5tr` · `3.500.000` · `3500000` | 3.500.000 ₫ |
| `850k` · `850 nghìn` | 850.000 ₫ |
| `15 triệu` | 15.000.000 ₫ |
| `1ty2` · `1,2 tỷ` | 1.200.000.000 ₫ |
| `2tr rưỡi` | 2.500.000 ₫ |
| `3,5` | refused: đồng have no decimals |
| `1.500,000` | refused: mixed separators |

The confirmation reads `= 3.500.000 ₫` and, beneath it, the amount in words. **Deviation from the brief, on purpose:** the brief showed `≈ 3.500.000 ₫`. `≈` is reserved for estimates in Esta; a parsed amount is exact, so it uses `=`.

## Dates and times

| Form | Example | Helper | Where |
| --- | --- | --- | --- |
| Date | `07/10/2026` | `formatDate` | Tables, forms, receipts |
| Long, with weekday | `Thứ Tư, 07/10/2026` | `formatDateLong` | Page header date, a due date in a sheet, confirmation text |
| Day and month | `07/10` | `formatDate(…).slice(0,5)` | Inside the current year where the year is obvious (`Trống từ 01/09`) |
| Month | `Tháng 10/2026` | — | Period pickers and titles |
| Range | `25/09/2026 – 24/10/2026` | — | Billing periods; en dash with spaces |
| Time | `07:00` | — | 24-hour, always two digits |

Relative forms, used next to the absolute date, never instead of it in a record:

| Situation | Text |
| --- | --- |
| Past due | `Quá hạn 12 ngày` |
| Due today | `Đến hạn hôm nay` |
| Due within 7 days | `Còn 3 ngày` (badge: `Đến hạn sau 3 ngày`) |
| Further ahead | the date: `Hạn 25/11` |
| Activity time | `Hôm nay, 09:00` · `Hôm qua, 18:30` · then `05/10, 14:20` |

Rules: dd/mm/yyyy always with leading zeros; weekday capitalised (`Thứ Tư`, `Chủ Nhật`); sentence case for relative phrases at the start of a badge, lower case mid-sentence (`đã quá hạn 12 ngày`). Business dates are Asia/Ho_Chi_Minh. The date input accepts `07/10/2026`, `7/10/26` and `07-10-2026` and confirms the weekday beneath it.
