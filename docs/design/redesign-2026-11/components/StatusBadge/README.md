# Status badge

A status badge names the state of a rent period, room or contract with an icon, a word and a colour, so it reads without colour. Markup: `<span class="es-badge es-badge--overdue"><i data-icon="triangle-alert"></i>Quá hạn 12 ngày</span>`.

**Variants.** Each status has one icon; never swap them.

| Class | Icon | Meaning | Example |
| --- | --- | --- | --- |
| `--paid` | `circle-check` | Money received in full | `Đã thu` |
| `--due` | `clock` | Due today or within 7 days | `Đến hạn hôm nay`, `Đến hạn sau 3 ngày` |
| `--overdue` | `triangle-alert` | Past due | `Quá hạn 12 ngày` |
| `--empty` | `circle-dashed` | Nothing there yet: a vacant room, no contract | `Phòng trống`, `Trống từ 01/09` |
| `--draft` | `pencil-line` | Saved, not final: a draft contract or a Trợ lý proposal | `Bản nháp` |
| `--ended` | `archive` | Finished and kept for the record | `Đã kết thúc` |

`--ended` is an outline, not a fill, so it sits back. In dark, the four tinted badges gain a hairline in their own border colour so the pill keeps its edge.

**Sizes.** Default is 24px tall with caption text, for rows, cards and tables. `--lg` (28px, body-sm text) for a property header or a sheet title.

**Count.** `es-count` is a number only, on a solid (danger by default, `--neutral` for plain totals), for nav items and tabs. Give it an `aria-label` that says what is counted (`2 phòng quá hạn`).

**Rules.**
- Do keep the amount beside a badge in `text`. The badge says overdue; the number stays a number.
- Do write the relative phrase from the date rules: `Quá hạn 12 ngày`, `Đến hạn hôm nay`, `Đến hạn sau 3 ngày`.
- Do let a long label wrap. It never ellipsizes; the corner radius keeps a wrapped badge soft.
- Don't use a coloured dot, a coloured number or a coloured row as the status.
- Don't put a badge on every row when all rows share one state; filter instead.

The consumer provides: the variant, the icon that goes with it, and the words.
