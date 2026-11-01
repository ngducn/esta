# Filter tabs

Filter tabs narrow the one list on a working screen by status, each option showing its count. Markup: `<div class="es-filter" role="group" aria-label="Lọc theo trạng thái">` with `<button class="es-filter__opt" aria-pressed="true|false">Quá hạn <span class="es-filter__n">2</span></button>`.

**States.** The track is `segment-track`; the pressed option is `segment-selected` with `shadow-xs` and a hairline, text in `text`. Others are `text-secondary`, turning `text` on hover. Focus-visible draws the standard ring. Exactly one option is pressed; `Tất cả` is the default.

**Size.** 36px options with a mouse, 44px on touch. The group wraps on narrow screens rather than scrolling sideways.

**Versus chips.** Use `es-filter` for the mutually exclusive status filter at the top of a list. Use `es-chips` when several filters can be on at once.

The consumer provides: the options, their counts, the pressed one and the handler.

- Do update the counts when the data changes, never the order.
- Don't put more than six options in one group.
