# Typeface

Esta sets everything in the app in Inter, chosen against Be Vietnam Pro and the prototype's Plus Jakarta Sans on a real Vietnamese specimen. The brand layer adds Inter Display, the same family at its display optical size, for website and onboarding headlines only.

The page sets the glyph test string (names, a sổ address, stacked marks, figures, ₫, m², ½) in all three faces at line height 1.15 and 1.3, then measures each face live in the browser: how far Ỗ rises, how far the dot of ặ drops, the clearance between them at 1.3, whether `tabular-nums` really gives equal figure widths, and how wide one name line sets at 16px. A canvas draws Ỗ Ẫ Ở Ặ Ữ under ặ ợ ụ ự ộ with the gap (green) or overlap (red) shaded.

Rules:

- Inter only, weights 400 (reading), 500 (labels, amounts) and 600 (titles, summary figures). Nothing heavier.
- Line height never below 1.3 for Vietnamese text: at 1.15 every face collides.
- Amounts always use `font-variant-numeric: tabular-nums` (`.es-num`, the `amount` and `figure-*` styles).
- No uppercase labels, no letter spacing on body text; `font-optical-sizing: auto`.
