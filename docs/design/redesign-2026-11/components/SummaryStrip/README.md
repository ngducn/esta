# Summary strip

A summary strip shows the two to four figures a working screen is about, in one hairline-divided surface. Markup: `<section class="es-stat-strip" aria-label="…"><div class="es-stat-strip__grid" style="--cols: 4">` with an `es-stat` per figure (`__head` › `__label` and at most one badge, `__value`, optional `es-meter`, `__sub`).

**Layout.** The strip is a container: four (or `--cols`) columns from 52rem of its own width, two from 30rem, one below. Dividers are hairlines drawn by each cell, so any count folds cleanly.

**Figures.** `__value` is 26/34 Inter 600 with tabular digits. Use the exact amount (`42.500.000 ₫`); switch to compact (`42,5 tr`) only when the strip sits in a narrow column, with the exact amount in `title`. Counts carry their unit (`2 phòng`). Unknown is `—` with `aria-label="Chưa có số liệu"` and a sub line that says what to add.

**When to use which.** A summary strip on working screens (Thu tiền, Tài sản, a property). A stand-alone `es-stat` card on the home screen, where each figure links somewhere different.

The consumer provides: the labels, the values, an optional target for the meter, and the sub lines.

- Do keep to four figures; a fifth belongs in a report.
- Don't colour a figure; a badge in the head carries any status.
