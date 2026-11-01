# Stat card

A stat card shows one summary figure, such as rent collected this month, in compact form with the exact amount on hover and in its accessible name. Markup:

```html
<a class="es-stat" href="/thu-tien">
  <div class="es-stat__head"><span class="es-stat__label">Đã thu tháng 10</span></div>
  <p class="es-stat__value"><span class="es-num" title="42.500.000 ₫" aria-label="42.500.000 ₫">42,5 tr</span>
    <span class="es-stat__of">/ <span class="es-num" title="54.000.000 ₫">54 tr</span></span></p>
  <div class="es-meter" role="meter" aria-label="Đã thu tháng 10" aria-valuemin="0" aria-valuemax="100" aria-valuenow="79" style="--value: 79%"><span class="es-meter__fill"></span></div>
  <p class="es-stat__sub">Còn 4 phòng chưa đóng</p>
</a>
```

Print the figure with `Esta.formatVndCompact` and put `Esta.formatVnd` of the same value in `title` and the accessible name.

**Parts.** `__head` holds the label and at most one badge. `__value` is figure-lg (32px), `--hero` makes it figure-xl (40px) for the one headline number on the home screen. `__of` is the target, smaller and secondary. `es-meter` shows progress toward the target in the accent colour, and in `success-solid` once complete. `__sub` is one line of context or the action that fills a gap.

**States.**
- Link: `a.es-stat` lifts to `shadow-sm` with a `border-strong` edge on hover and draws the focus ring; a plain `div.es-stat` does neither.
- Overdue: the figure stays `text`-coloured; the badge in the head carries the status (`2 phòng`).
- Unknown: `—` in `text-muted` with `aria-label="Chưa có số liệu"`, and the sub line says what to add (`Thêm hợp đồng Phòng 2 để tính`).
- Loading: a figure skeleton and a text skeleton in the card's final shape, `aria-busy="true"`.
- Negative: the real minus (`−1,2 tr`), in `text`, not red.
- Estimate: say `ước tính` in the label and date the estimate in the sub line.
- Narrow: the label wraps; the figure never wraps or truncates.

Cards follow density through `--card-pad` (24 Thoáng, 16 Gọn).

**Rules.**
- Do keep one figure per card; a second number goes in `__of` or `__sub`.
- Do use compact only here and in other summaries; a figure Mẹ checks against cash is a full amount elsewhere.
- Don't show `0 ₫` for a figure that is not known yet.
- Don't put an icon tile above the label.

The consumer provides: the label, the value in đồng (or nothing when unknown), an optional target and link, and the sub line.
