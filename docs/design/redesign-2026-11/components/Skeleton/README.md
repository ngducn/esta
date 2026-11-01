# Skeleton

A skeleton holds the place of content that is loading, in the same shape and size as what will arrive. Markup: `<span class="es-skel es-skel--text" style="width: 60%"></span>` inside a container with `aria-busy="true"` and an `es-sr-only` "Đang tải".

**Shapes.** `--text` (a 12px bar in a 24px line box, the height of body text), `--title` (16px in 26px), `--figure` (32px in 40px, 9ch wide, the width of a compact figure), `--avatar` (avatar-md circle), `--photo` (16:10, square corners), `--badge` and `--btn` for the pill and button shapes. Bars sit in line boxes rather than using margins, so a stack of them is exactly as tall as the text it stands for.

**Rules.** Build the skeleton from the loaded layout: same card, same padding, same columns; only text and figures become bars. Money columns get a bar as wide as `00.000.000 ₫`, never `0 ₫`. Show skeletons after 300ms, not before, so quick loads don't flash.

**Motion.** A 1.6s opacity pulse (1 → 0.55). No shimmer sweep. Under reduced motion it holds still.

The consumer provides: the layout, bar widths that match likely content, and `aria-busy` on the region.

- Do: keep icons, labels and headings that are already known; only the data loads.
- Don't: show a spinner inside a number, or a skeleton for something that loads in under 300ms.
