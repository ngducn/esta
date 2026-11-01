# Completeness

Completeness shows how much of a property's record is in place by naming what is still missing, with a small ring as the glance. Markup:

```html
<span class="es-complete es-complete--partial">
  <svg class="es-complete__ring" viewBox="0 0 20 20" aria-hidden="true">
    <circle class="es-complete__track" cx="10" cy="10" r="8"/>
    <circle class="es-complete__arc" cx="10" cy="10" r="8" pathLength="100" stroke-dasharray="70 100"/>
  </svg>
  <span class="es-complete__label">Thiếu 3 mục</span>
</span>
```

Set the arc's first `stroke-dasharray` number to the percent done; `pathLength="100"` makes it a percent.

**States.**
- `--partial`: the arc is `text-secondary`, not a status colour, because a missing paper is a to-do, not a problem. Label: `Thiếu N mục`.
- `--full`: the arc closes in `success-text` with a tick. Label: `Đủ hồ sơ`.
- `--empty`: a dashed track with no arc, the label in `text-muted`: `Chưa có giấy tờ`.
- Loading: a round skeleton the ring's size and a text skeleton, `aria-busy="true"`.

**Expanded.** `--expanded` is the property header version: a 44px ring, a headline (`Thiếu 3 mục trong hồ sơ`), one sentence on why it matters, then the next three missing items, each with its own action (`Chụp ảnh`, `Thêm`). Rows are at least 44px. The full state ends on what Trợ lý will do next; the empty state offers `Chụp ảnh sổ`.

**Rules.**
- Do count what is missing in words. A percent alone does not say what to do.
- Do list at most three items, the ones that unlock the most (the sổ first).
- Don't colour a partial record red or amber. Only an overdue tax or an expiring contract is a status, and that goes in a badge.
- Don't put the ring alone, without its label.

The consumer provides: the percent done, the count missing, and for `--expanded` up to three items with an action each. The checks themselves come from the completeness registry in `packages/core`.
