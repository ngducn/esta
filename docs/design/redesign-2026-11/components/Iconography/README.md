# Iconography

Esta uses Lucide outline icons, sized by the text they sit beside and aligned to its first line.

The page lists every icon in the system with its name, the size ladder (14 with caption, 16 with label, 20 with body, 24 in the bottom nav), stroke 1.75 against 2 at 14px (actual and magnified), do and don't for optical alignment on one and two lines, and the six status icons in colour and in grayscale.

Rules:

- Write `<i data-icon="name" data-size="16"></i>`; `Esta.hydrate()` swaps in the SVG. Only names in `Esta.icons`.
- Outline only. No filled or duotone icons, emoji or Unicode symbols as icons.
- Size from the type style: `icon-xs` 14 · `icon-sm` 16 · `icon-md` 20 · `icon-lg` 24. Stroke 1.75, and 2 at 14px (the helper does this).
- Gap to text `space-2`, or `space-1.5` at 14px. One line: `align-items: center`. Several lines: align to the first with `margin-top: calc((line-height − icon) / 2)`.
- Status: paid `circle-check`, due soon `clock`, overdue `triangle-alert`, empty `circle-dashed`, draft `pencil-line`, ended `archive`. Always with the word.
- Icons take `currentColor`. An icon-only button needs `aria-label` and a tooltip, and exists only on desktop toolbars.
