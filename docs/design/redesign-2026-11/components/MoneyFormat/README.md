# Money format

How Esta writes đồng: full where an amount is checked against cash or a bank screen, compact where a total is read as a size, and never a number that is not exact.

The page runs the app's own formatters live (`formatVnd`, `formatVndCompact`, `formatVndSigned`, `vndInWords`) over a range of stored amounts, shows compact on a stat card next to full in a table row, sets out the treatments for positive, negative, zero, unknown, estimate and loading, puts `12.500.000.000 ₫` in a narrow column at 130% text (the label truncates, the number holds) beside the wrong version, clamps a long property name in a card and truncates it in a table cell, and lists what the money input accepts through `parseVnd`.

Rules:

- Full `3.500.000 ₫` in tables, lists, forms, receipts, QR sheets, toasts. Compact `42,5 tr` · `12,5 tỷ` · `850 nghìn` on stat cards, the home screen and chart labels, always with the full amount on hover or tap and in the accessible name.
- `.` groups thousands, `,` is the decimal mark, `₫` after a no-break space; compact has no `₫`. Never `,00`, `ngàn` or `tỉ`.
- Signed only in ledgers: `+` in `success-text`, `−` (U+2212) in `text`. Zero is `0 ₫` muted; unknown is a muted `—` with `aria-label="Chưa có số liệu"`; an estimate says `Ước tính` and its date; loading is a still skeleton the width of `00.000.000 ₫`.
- Numbers (`.es-num`) never wrap or truncate. The text beside them gives way; a stat card switches to compact.
- Names clamp to two lines in cards and truncate to one line in table cells with the full text in `title`.
- A parsed amount confirms with `=`, not `≈`, which is reserved for estimates.
